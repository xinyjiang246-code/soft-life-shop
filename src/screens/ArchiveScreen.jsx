import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, Check, ImagePlus, PenLine, Settings2, Sparkles, Wand2, X } from 'lucide-react'
import { addJournalItem, journalKey, loadJournal, removeJournalItem, updateJournalItem } from '../storage.js'
import { newPhotoId, preparePhoto, putPhoto } from '../photoStore.js'
import { counters, foodNotes, getItemsByCounter, hashSeed, moodTags, pickN, pickOne } from '../data.js'
import { extractPalette, hexToRgb } from '../colorUtils.js'
import ItemArt from '../components/ItemArt.jsx'
import EntryDetail from '../components/EntryDetail.jsx'
import JournalView from '../components/JournalView.jsx'
import { DEFAULT_PHOTO_NAME } from '../journalMeta.js'
import archiveExample from '../assets/matcha-archive-example.webp'

/**
 * 「把这一餐存下来」+「食物手账」——同一张首页磁贴，两个看法。
 *
 * 2026-09-17 用户定的关系（原话：「这里的图片是和旁边的手帐是联动的……就是 2 边功能类似？」）：
 *   **一套照片，两个看法。** 手账是唯一的存储（`soft-life-journal-v1` + IndexedDB 的照片），
 *   这一页专门做「上传 + AI 帮你写小记」，手账专门做「按天 / 月翻看」。
 *   所以这一页**不再有自己的相册** —— 下面那面照片墙读的就是手账里的照片。
 *
 * ⚠️ 上一版这里有个真问题（本次修掉的）：
 *   1. 照片存的是**全尺寸 base64 dataURL**，塞进 localStorage。一张手机照 3MB → 字符串约 4MB，
 *      而 localStorage 只有 5MB，`saveArchives` 外面又是 `catch {}` → **写满会静默失败**，
 *      用户以为存下了，其实什么都没有。手账那边早就绕开了（原图进 IndexedDB、
 *      localStorage 只留 180px 的缩略图）—— 这页从没跟上。现在统一走 `photoStore.js`。
 *   2. `archives` 那个数组**从来没有被渲染过** —— 上传完 AI 面板一关，
 *      这张照片就再也找不回来了。所以才有了这面照片墙。
 *   3. 示例图点一下会**弹文件选择器**（用户想看图，它让你上传）。现在改成点开看大图。
 */

// 旧版（≤2026-09-16）的照片 key —— 这个数组从来没被渲染过，存在里面的东西本来就是取不回来的
const LEGACY_KEY = 'soft-life-archives-v1'

/** 手账里所有**带自己拍的照片**的条目，按时间倒序 —— 照片墙的数据源 */
function collectWall(journal) {
  const days = journal?.days || {}
  const out = []
  Object.keys(days).sort().forEach((dateKey) => {
    const items = days[dateKey]?.items || []
    items.forEach((entry, index) => {
      // index 必须是**在当天 items 里的下标** —— 更新 / 删除都按它定位，
      // 所以这里遍历原始数组、不要先 filter（否则下标会和 storage 那边对不上）
      if (entry && entry.thumb) out.push({ dateKey, index, entry })
    })
  })
  return out.sort((a, b) => (b.entry.at || 0) - (a.entry.at || 0))
}

const shortDate = (dateKey, todayKey) => {
  if (dateKey === todayKey) return '今天'
  const [, m, d] = String(dateKey).split('-')
  return `${Number(m)}.${d}`
}

export default function ArchiveScreen({ onBack, initialView }) {
  // 两个视图共用这一张磁贴：「存下这一餐」是上传 + AI 小记，「食物手账」是按天翻看
  // initialView 让结局页的「翻翻手账」能直接落到第二格
  const [view, setView] = useState(initialView === 'journal' ? 'journal' : 'archive')
  const [journal, setJournal] = useState(() => loadJournal())
  const [image, setImage] = useState(null)          // 刚存下的那张（blob URL，不是 base64）
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [connected, setConnected] = useState(false)
  const [aiContent, setAiContent] = useState(null)  // 上传后 AI 生成的内容
  const [analyzing, setAnalyzing] = useState(false) // AI 分析中
  const [revealed, setRevealed] = useState(0)       // 已逐条揭晓的模块数
  const [newEntry, setNewEntry] = useState(null)    // 刚记下的那一笔 { dateKey, index }
  const [preview, setPreview] = useState(null)      // { mode: 'entry', dateKey, index } | { mode: 'example' }
  const inputRef = useRef(null)
  const urlRef = useRef(null)

  const todayKey = journalKey()
  const refresh = () => setJournal(loadJournal())
  const wall = useMemo(() => collectWall(journal), [journal])

  const previewDay = preview?.mode === 'entry' ? (journal.days || {})[preview.dateKey] : null
  const previewEntry = previewDay?.items?.[preview.index] || null

  // 旧 key 只在**确实是空的时候**清掉 —— 它占着 localStorage 的配额，
  // 而手账的缩略图也写在同一份配额里，写满会静默失败。
  // 万一里面真有内容，宁可让它占着，也不替用户删东西（那种数据本来也读不出来）。
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEGACY_KEY)
      if (raw && !(JSON.parse(raw) || []).length) localStorage.removeItem(LEGACY_KEY)
    } catch { /* 坏了也与我无关 */ }
  }, [])

  // blob URL 用完要还回去，不然每上传一张就漏一个
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  /**
   * 存下一张照片。顺序是有讲究的：
   *   压到长边 1600 的 WebP → 进 IndexedDB → **先把这一笔记进手账**（缩略图随条目走）
   *   → 再把 blob URL 塞给 <img> 预览 → 最后才去跑 AI。
   * 先落盘再跑 AI：AI 那一步只是锦上添花，它挂了这张照片也该已经存好了。
   */
  const chooseImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // 允许重复选同一张
    if (!file) return
    setBusy(true)
    setHint('正在把这张照片存下来…')
    try {
      const { blob, thumb } = await preparePhoto(file)
      const photoId = newPhotoId()
      const ok = await putPhoto(photoId, blob)
      if (!ok) throw new Error('这张照片没能存下来，可能浏览器的相册被限制了')

      const dateKey = journalKey()
      const entry = addJournalItem(dateKey, DEFAULT_PHOTO_NAME, { photoId, thumb })
      if (!entry) throw new Error('没能把这一笔记下来')
      const index = (loadJournal().days[dateKey]?.items || []).length - 1

      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = URL.createObjectURL(blob)
      setImage(urlRef.current)
      setNewEntry({ dateKey, index })
      refresh()
      setHint('')
      generateAiContent(urlRef.current, dateKey, index)
    } catch (err) {
      setHint(err?.message || '这张照片读不出来，换一张试试')
    } finally {
      setBusy(false)
    }
  }

  const generateAiContent = async (src, dateKey, index) => {
    setAnalyzing(true)
    setRevealed(0)
    setAiContent(null)

    // 种子只来自「哪一天 + 第几笔」—— 同一张照片重新渲染永远是同一段小记，不用 Date.now()
    const seed = hashSeed(`${dateKey}#${index}`)
    const tags = pickN(moodTags, seed, 3)
    const note = pickOne(foodNotes, seed + 1)

    // 模拟 AI 分析耗时（让「正在分析」有真实感）
    const [palette] = await Promise.all([
      extractPalette(src),
      new Promise((r) => setTimeout(r, 950 + Math.random() * 650)),
    ])
    const recommendation = pickColorMatch(palette.dominant)

    setAiContent({ tags, note, palette, recommendation, seed })
    setAnalyzing(false)

    // 顺手写进这一笔 —— 手账那边翻开同一张也看得到「当时 AI 写下的」。
    // 字段白名单在 storage.js 的 ENTRY_TEXT_FIELDS 里，这里塞的 key 必须是那几个。
    updateJournalItem(dateKey, index, { tags, aiNote: note, swatch: palette.dominant })
    refresh()
  }

  const resetArchive = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setImage(null)
    setAiContent(null)
    setRevealed(0)
    setAnalyzing(false)
    setNewEntry(null)
    setHint('')
  }

  // 内容就绪后，4 个模块逐条揭晓
  useEffect(() => {
    if (!aiContent) return undefined
    setRevealed(1)
    const timers = [
      setTimeout(() => setRevealed(2), 280),
      setTimeout(() => setRevealed(3), 560),
      setTimeout(() => setRevealed(4), 840),
    ]
    return () => timers.forEach(clearTimeout)
  }, [aiContent])

  const openEntry = (target) => setPreview({ mode: 'entry', ...target })

  return (
    <div className="shop-page archive-page">
      <header className="archive-bar">
        <button className="icon-button" onClick={onBack} aria-label="返回首页"><ArrowLeft size={23} strokeWidth={1.45} /></button>
        <span>{view === 'journal' ? '食物手账' : '把这一餐存下来'}</span>
        {view === 'journal' ? (
          // 手账视图没有 API 可设，留一个同宽占位，标题保持居中
          <span className="icon-button is-placeholder" aria-hidden="true" />
        ) : (
          <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="API 设置"><Settings2 size={20} strokeWidth={1.45} /></button>
        )}
      </header>

      <nav className="archive-tabs" aria-label="切换视图">
        <button
          className={view === 'archive' ? 'is-active' : ''}
          aria-pressed={view === 'archive'}
          onClick={() => setView('archive')}
        >存下这一餐</button>
        <button
          className={view === 'journal' ? 'is-active' : ''}
          aria-pressed={view === 'journal'}
          onClick={() => setView('journal')}
        >食物手账</button>
      </nav>

      {view === 'journal' ? (
        <JournalView />
      ) : (
        <>
          <section className="archive-intro">
            <p className="eyebrow">SOFT LIFE ARCHIVE</p>
            <h1>把这一餐，<br />轻轻存下来。</h1>
            <p>上传一张食物照片，让 AI 帮你写今天的纸本小记。</p>
          </section>

          {image ? (
            <>
              <section className={`archive-card${aiContent && !analyzing ? ' has-ai' : ''}`} aria-label="食物存档预览">
                <div className="archive-photo"><img src={image} alt="刚存下的这一张" /></div>
                {analyzing && <AnalyzingState />}
                {aiContent && !analyzing && (
                  <ArchiveAiPanel
                    content={aiContent}
                    revealed={revealed}
                    onWrite={newEntry ? () => openEntry(newEntry) : null}
                  />
                )}
              </section>
              <div className="archive-actions">
                <button className="secondary-action" onClick={() => inputRef.current?.click()}><ImagePlus size={18} />换一张</button>
                <button className="secondary-action" onClick={resetArchive}>收起</button>
              </div>
            </>
          ) : (
            <>
              {wall.length === 0 && (
                // 示例图**不再当上传按钮用** —— 那是「想看图却弹出文件选择器」的根源。
                // 现在点它就是看大图，上传走下面那颗明确的按钮。
                // 2026-09-17：大海报缩成一枚小示例条 —— 整屏的大图喧宾夺主，跟米纸页面也不搭。
                <button className="archive-example" onClick={() => setPreview({ mode: 'example' })}>
                  <img src={archiveExample} alt="示例：抹茶拿铁" />
                  <span className="archive-example-txt">
                    <b>先看一眼示例</b>
                    <i>抹茶拿铁 —— 拍下的照片会配一张纸本小记（点开看大图）</i>
                  </span>
                </button>
              )}
              <button className="upload-zone compact" onClick={() => inputRef.current?.click()} disabled={busy}>
                <Camera size={23} />
                <strong>{busy ? '正在存下这一张…' : '拍下这一餐'}</strong>
                <span>相册上传或直接拍摄 —— 存下的照片旁边的手账里也翻得到</span>
              </button>
            </>
          )}

          {hint && <p className="archive-hint">{hint}</p>}

          {/* 照片墙：读的就是手账里的照片，两边是同一套 */}
          <section className="aw" aria-label="存下的照片">
            <div className="aw-head">
              <span>存下的照片</span>
              <span className="aw-count">{wall.length ? `${wall.length} 张` : '还是空的'}</span>
            </div>
            {wall.length > 0 ? (
              <div className="aw-grid">
                {wall.map((w) => (
                  <button
                    key={`${w.dateKey}:${w.index}`}
                    type="button"
                    className="aw-cell"
                    onClick={() => openEntry({ dateKey: w.dateKey, index: w.index })}
                    aria-label={`看「${w.entry.name}」这张照片`}
                  >
                    <img src={w.entry.thumb} alt={w.entry.name || '存下的一张'} loading="lazy" />
                    <span className="aw-cell-date">{shortDate(w.dateKey, todayKey)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="aw-empty">
                还没有存下的照片。拍一张，它会同时出现在旁边的食物手账里 —— 两边是同一套照片。
              </p>
            )}
          </section>

          <p className="archive-note">
            照片只存在你这台设备的相册里（浏览器里，换台手机就看不到了）。
            上面的 AI 小记目前是本地模板 + 图像主色提取，接上真实图像 API 后可以由照片直接生成纸本插图。
          </p>

          <input ref={inputRef} className="file-input" type="file" accept="image/*" onChange={chooseImage} />
        </>
      )}

      {preview?.mode === 'entry' && previewEntry && (
        <EntryDetail
          key={`${preview.dateKey}:${preview.index}`}
          entry={previewEntry}
          dateKey={preview.dateKey}
          index={preview.index}
          canEdit={preview.dateKey === todayKey}
          dayMood={previewDay?.mood || ''}
          // 照片墙从「只看图」进 —— 先看清这张照片，再点一下才出备注（用户要的那个交互）
          initialStage={0}
          onClose={() => setPreview(null)}
          onChanged={refresh}
          onDelete={() => {
            removeJournalItem(preview.dateKey, preview.index)
            setPreview(null)
            refresh()
          }}
        />
      )}

      {preview?.mode === 'example' && (
        <EntryDetail
          entry={{ name: '抹茶拿铁 · 食物存档示例', thumb: archiveExample }}
          dateKey={todayKey}
          index={-1}
          canEdit={false}
          showNote={false}
          initialStage={0}
          onClose={() => setPreview(null)}
        />
      )}

      {showSettings && <ApiSettings close={() => setShowSettings(false)} connected={connected} connect={() => { setConnected(true); setShowSettings(false) }} />}
    </div>
  )
}

// AI 分析中状态
function AnalyzingState() {
  const steps = ['读取图像像素…', '识别色调与光线…', '匹配心情语料…', '生成今日小记…']
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 420)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="archive-analyzing">
      <div className="analyzing-head">
        <Sparkles size={15} className="analyzing-icon" />
        <span>AI 正在分析这张照片</span>
        <span className="analyzing-dots"><i /><i /><i /></span>
      </div>
      <p className="analyzing-step">{steps[step]}</p>
      <div className="analyzing-skeleton">
        <div className="skeleton-line" style={{ width: '42%' }} />
        <div className="skeleton-line" style={{ width: '78%' }} />
        <div className="skeleton-line" style={{ width: '62%' }} />
      </div>
    </div>
  )
}

// AI 生成内容面板：4 个模块（按 revealed 逐条揭晓）+ 一个「去写备注」的出口
function ArchiveAiPanel({ content, revealed, onWrite }) {
  const { tags, note, palette, recommendation } = content
  return (
    <div className="archive-ai-panel">
      {revealed >= 1 && (
        <div className="ai-section is-revealed" style={{ borderLeftColor: palette.dominant }}>
          <div className="ai-section-head">
            <span className="ai-section-tag">AI · 心情标签</span>
            <span className="ai-section-sub">已识别 3 个心情信号</span>
          </div>
          <div className="ai-tags">
            {tags.map((t, i) => (
              <span key={i} className="ai-tag" style={{ animationDelay: `${i * 90}ms` }}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {revealed >= 2 && (
        <div className="ai-section is-revealed">
          <div className="ai-section-head">
            <span className="ai-section-tag">AI · 今日小记</span>
            <span className="ai-section-sub">写于 {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <p className="ai-note">{note}</p>
        </div>
      )}

      {revealed >= 3 && (
        <div className="ai-section is-revealed">
          <div className="ai-section-head">
            <span className="ai-section-tag">AI · 主色提取</span>
            <span className="ai-section-sub">{palette.colorful ? '已滤除背景色' : '整图均色'}</span>
          </div>
          <div className="ai-palette">
            {palette.swatches.map((c, i) => (
              <div key={i} className="ai-palette-chip" style={{ background: c, animationDelay: `${i * 70}ms` }} title={c} />
            ))}
          </div>
          <p className="ai-palette-caption">
            主色 {palette.dominant} · 营造「{palette.mood}」氛围
          </p>
        </div>
      )}

      {revealed >= 4 && (
        <div className="ai-section is-revealed">
          <div className="ai-section-head">
            <span className="ai-section-tag">AI · 同色系推荐</span>
            <span className="ai-section-sub">来自「{recommendation.counter.name}」</span>
          </div>
          <div className="ai-recommendation">
            <div className="ai-thumb">
              {/* ⚠️ 这里必须走 **ItemArt**（商品图的统一出口），不能直接塞 FlipImage。
                  「今日特调」（`toItemFromSpecial`）既没有 image 也没有 imageReal，只有 art ——
                  FlipImage 在这种输入下会退回一个通用同心圆占位，60×80 看着就是个「◎」，
                  像坏图。ItemArt 会按项目规则改画 DishArt 手绘，和别处一致。 */}
              <ItemArt item={recommendation.item} size="sm" prefer="real" />
            </div>
            <div className="ai-recommendation-info">
              <strong>{recommendation.item.cn}</strong>
              <span>{recommendation.item.description}</span>
              <em>¥{recommendation.item.price}</em>
            </div>
          </div>
        </div>
      )}

      {revealed >= 4 && onWrite && (
        <button type="button" className="ai-write" onClick={onWrite}>
          <PenLine size={15} strokeWidth={1.8} />
          给它起个名字、写一句
        </button>
      )}

      {revealed >= 4 && (
        <p className="ai-footer-note">
          <Wand2 size={14} />本页内容由「本地 AI 模板」生成。
          连接真实图像 API 后，将自动改为基于图片理解的智能生成。
        </p>
      )}
    </div>
  )
}

// 按主色找最接近的柜台 accent
function pickColorMatch(hex) {
  const target = hexToRgb(hex)
  let best = null
  let bestDist = Infinity
  for (const counter of counters) {
    if (counter.id === 'life') continue
    const accent = hexToRgb(counter.accent)
    const dist = Math.sqrt(
      Math.pow(target.r - accent.r, 2) +
      Math.pow(target.g - accent.g, 2) +
      Math.pow(target.b - accent.b, 2)
    )
    if (dist < bestDist) {
      bestDist = dist
      const items = getItemsByCounter(counter.id)
      // 用主色 hash 固定选项，避免每次刷新推荐都在跳
      const idx = hexToRgb(hex).r % items.length
      best = { counter, item: items[idx] }
    }
  }
  return best || { counter: counters[0], item: getItemsByCounter(counters[0].id)[0] }
}


function ApiSettings({ close, connected, connect }) {
  const [key, setKey] = useState('')
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="api-title">
      <section className="api-modal">
        <button className="modal-close" onClick={close} aria-label="关闭"><X size={20} /></button>
        <p className="eyebrow">BYOK · BRING YOUR OWN KEY</p>
        <h2 id="api-title">连接你的图像 API</h2>
        <p>你的 Key 只保留在本次浏览器会话中，用于生成食物纸本插图；费用由你的 API 账号承担。</p>
        <label>API Key<input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="粘贴你的 API Key" /></label>
        <div className="provider-hint"><Sparkles size={16} />需要支持"图像编辑 / 参考图生成"的服务。</div>
        <button className="primary-action modal-action" disabled={!key && !connected} onClick={connect}><Check size={18} />{connected ? '已连接' : '仅在本次会话中连接'}</button>
        <p className="fine-print">此原型不上传、保存或展示你的 Key。实际生成 API 将在下一步接入。</p>
      </section>
    </div>
  )
}
