import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, Check, ImagePlus, Settings2, Sparkles, Wand2, X } from 'lucide-react'
import { loadArchives, saveArchives } from '../storage.js'
import { counters, dateSeed, foodNotes, getItemsByCounter, hashSeed, moodTags, pickN, pickOne } from '../data.js'
import { extractPalette, hexToRgb } from '../colorUtils.js'
import FlipImage from '../components/FlipImage.jsx'
import JournalView from '../components/JournalView.jsx'
import archiveExample from '../assets/matcha-archive-example.webp'

export default function ArchiveScreen({ onBack, initialView }) {
  // 两个视图共用这一张磁贴：「存下这一餐」是原来的照片存档，「食物手账」是每天记下的一笔
  // initialView 让结局页的「翻翻手账」能直接落到第二格
  const [view, setView] = useState(initialView === 'journal' ? 'journal' : 'archive')
  const [image, setImage] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [connected, setConnected] = useState(false)
  const [archives, setArchives] = useState(() => loadArchives())
  const [aiContent, setAiContent] = useState(null)   // 上传后 AI 生成的内容
  const [analyzing, setAnalyzing] = useState(false)  // AI 分析中
  const [revealed, setRevealed] = useState(0)        // 已逐条揭晓的模块数
  const inputRef = useRef(null)

  const chooseImage = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = '' // 允许重复选同一张
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      setImage(dataUrl)
      const id = Date.now()
      const next = [{ id, image: dataUrl, date: new Date().toLocaleDateString('zh-CN') }, ...archives]
      setArchives(next)
      saveArchives(next)
      generateAiContent(dataUrl, id)
    }
    reader.readAsDataURL(file)
  }

  const generateAiContent = async (dataUrl, id) => {
    setAnalyzing(true)
    setRevealed(0)
    setAiContent(null)

    const seed = hashSeed(String(id) + dateSeed())
    const tags = pickN(moodTags, seed, 3)
    const note = pickOne(foodNotes, seed + 1)

    // 模拟 AI 分析耗时（让「正在分析」有真实感）
    const [palette] = await Promise.all([
      extractPalette(dataUrl),
      new Promise((r) => setTimeout(r, 950 + Math.random() * 650)),
    ])
    const recommendation = pickColorMatch(palette.dominant)

    setAiContent({ tags, note, palette, recommendation, seed })
    setAnalyzing(false)
  }

  // 内容就绪后，4 个模块逐条揭晓
  useEffect(() => {
    if (!aiContent) return
    setRevealed(1)
    const timers = [
      setTimeout(() => setRevealed(2), 280),
      setTimeout(() => setRevealed(3), 560),
      setTimeout(() => setRevealed(4), 840),
    ]
    return () => timers.forEach(clearTimeout)
  }, [aiContent])

  const resetArchive = () => {
    setImage(null)
    setAiContent(null)
    setRevealed(0)
    setAnalyzing(false)
  }

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
              <section className="archive-card" aria-label="食物存档预览">
                <div className="archive-photo"><img src={image} alt="上传的食物" /></div>
                {analyzing && <AnalyzingState />}
                {aiContent && !analyzing && <ArchiveAiPanel content={aiContent} revealed={revealed} />}
              </section>
              <div className="archive-actions">
                <button className="secondary-action" onClick={() => inputRef.current?.click()}><ImagePlus size={18} />换一张</button>
                <button className="secondary-action" onClick={resetArchive}>重新选择</button>
              </div>
              <p className="archive-note">当前是本地 AI 预览（预设模板 + 图像主色提取）。连接真实图像 API 后，可把下半部分替换为根据照片生成的手绘纸本插图。</p>
            </>
          ) : (
            <>
              <button className="archive-example" onClick={() => inputRef.current?.click()}>
                <img src={archiveExample} alt="抹茶拿铁食物存档示例" />
                <span>示例：真实照片与纸本食物插画</span>
              </button>
              <button className="upload-zone compact" onClick={() => inputRef.current?.click()}>
                <Camera size={23} />
                <strong>拍下这一餐</strong>
                <span>相册上传或直接拍摄</span>
              </button>
            </>
          )}

          <input ref={inputRef} className="file-input" type="file" accept="image/*" capture="environment" onChange={chooseImage} />
        </>
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

// AI 生成内容面板：4 个模块（按 revealed 逐条揭晓）
function ArchiveAiPanel({ content, revealed }) {
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
              <FlipImage
                front={recommendation.item.image}
                back={recommendation.item.imageReal}
                alt={recommendation.item.cn}
                hint={false}
              />
            </div>
            <div className="ai-recommendation-info">
              <strong>{recommendation.item.cn}</strong>
              <span>{recommendation.item.description}</span>
              <em>¥{recommendation.item.price}</em>
            </div>
          </div>
        </div>
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