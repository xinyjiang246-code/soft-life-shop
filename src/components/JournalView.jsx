import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { getCounter, getItem } from '../data.js'
import {
  addJournalItem, journalKey, loadJournal, removeJournalItem, setJournalNote,
} from '../storage.js'
import { newPhotoId, preparePhoto, putPhoto } from '../photoStore.js'
import { DEFAULT_PHOTO_NAME, MOODS, timeOf } from '../journalMeta.js'
import EntryDetail from './EntryDetail.jsx'

/**
 * JournalView —— 食物手账
 *
 * 数据层是另一个 agent 写的（storage.js 的 soft-life-journal-v1 + 7 个 API），
 * UI 2026-09-16 由我补，同日按用户给的参考 App 重做成「月 / 周 / 今天」三视图；
 * 2026-09-21 加第四视图「印记」：每笔记录一枚波浪边邮票（铺子上弧/日期下弧/贴纸居中），
 * 6 枚一页左右翻页（纸张效果），点章先翻面（+震动）再展开详情 —— 对齐用户给的 Brew 交互清单
 * （#3 盖章翻转、#4 邮票页左右滑页、#5 点标题回到今天）。
 *
 * 参考来源：用户发的 8 张「咖啡记录 + 集章」App 截图（`参考图/手账App界面/`）。抄过来的是它的
 * **设计语言**：中性米灰底、近黑墨色、等宽打字机数字、大圆角卡片、**贴纸**当视觉隐喻。
 *
 * ⚠️ 2026-09-16 用户纠正的核心一条（本文件存在的理由）：
 *   「我的意思是**自己拍照上传**后，展开来看就是这种 —— 而不是你在后端这样」
 *   也就是 —— 手账里贴的那张图必须是**用户自己的照片**，不是项目里预先画好的商品图。
 *   所以有了：拍照/相册上传 → 压缩进 IndexedDB（photoStore.js）→ 贴纸形态 → 点开是展开详情。
 *   商品图只在「点完一单自动记下的那一笔」上作为兜底出现。
 *
 * 语气红线（与惜食柜、公益档案一致）：
 *   · 不记卡路里、不算账、不做「连续打卡 N 天」这种催更
 *   · 参考 App 里满屏的统计（总杯数 / 咖啡因 mg / 每周柱状图）**一律不搬**
 *   · 它是「这些天你点过、想过、最后没有真的吃掉的东西」的落脚处，不是记账本
 *   · 必须诚实：照片和数据只在这台设备上
 */

const EMPTY_DAY = { items: [], note: '', mood: '' }
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

// 集章的节点：第 N 份。参考 App 的「Reached 10 Cups」，换成小铺的说法。
// ⚠️ 2026-09-22：这里只留「哪几个数字有章」这层数据，UI 上**不出现进度/催促口径** ——
//   副标题原本写「里程碑 X / 5」（进度条感），没盖的章原本写「还没到」（催促），都已去掉。
//   留着改回去前先想一遍红线 4：打卡 / 目标 / 奖励 / 催单不许。
const STAMP_STEPS = [1, 5, 10, 25, 50]

/* --------------------------- 邮票墙（印记） --------------------------- */
/**
 * 每一笔记录 = 一枚波浪边邮票（参考 App 的 Time Stamps 页 + Paper Press demo 的盖章徽章）：
 * 波浪环用城市印章色轮着来，上弧写铺子名，下弧写日期，中间贴那张图。
 * 点一下：章先翻个面（＋一下震动），然后才展开详情 —— 对应 Brew 交互清单 #3。
 */

// 波浪环路径：120×120 画布上一圈 26 段圆弧拱（模块加载时算一次）
const WALL_SCALLOP = (() => {
  const N = 26
  const R = 54
  let d = ''
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2
    const x = 60 + R * Math.cos(a)
    const y = 60 + R * Math.sin(a)
    const chord = 2 * R * Math.sin(Math.PI / N) * 0.62
    d += `${i === 0 ? 'M' : `A${chord.toFixed(2)} ${chord.toFixed(2)} 0 0 1 `}${x.toFixed(2)} ${y.toFixed(2)} `
  }
  return `${d}Z`
})()

// 印章色轮：赭红 / 抹茶 / 焦糖 / 青灰 —— 挨着用，一墙不单调
const STAMP_PALS = ['#B4552D', '#7E9070', '#9F7F5F', '#6E7F92']

// 震动：设备支持就嗡一下，不支持就当没有
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms) } catch { /* 忽略 */ } }

function WallStamp({ entry, uid, idx, flipped, onFlip }) {
  const pal = STAMP_PALS[idx % STAMP_PALS.length]
  const item = entry.id ? getItem(entry.id) : null
  const shop = item ? (getCounter(item.counterId)?.name || '慢活小铺') : '自己拍的'
  const { y, m, d } = parseKey(entry.key)
  const idTop = `wt-${uid}`
  const idBot = `wb-${uid}`
  return (
    <button
      type="button"
      className={`jh-wall-stamp${flipped ? ' is-flip' : ''}`}
      style={{ '--pal': pal }}
      onClick={() => onFlip(entry)}
      aria-label={`${shop}，${m} 月 ${d} 日，${entry.name || '一张照片'}`}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true" className="jh-wall-ring">
        <defs>
          <path id={idTop} d="M60,60 m-43,0 a43,43 0 1,1 86,0" />
          <path id={idBot} d="M60,60 m-43,0 a43,43 0 1,0 86,0" />
        </defs>
        <path d={WALL_SCALLOP} fill="none" stroke={pal} strokeWidth="2" />
        <circle cx="60" cy="60" r="43.5" fill="none" stroke={pal} strokeWidth=".8" opacity=".55" strokeDasharray="1.5 3" />
        <text fontSize="8.6" letterSpacing="1.6" fill={pal} opacity=".85">
          <textPath href={`#${idTop}`} startOffset="50%" textAnchor="middle">{shop}</textPath>
        </text>
        <text fontSize="7.6" letterSpacing="1.8" fill={pal} opacity=".7">
          <textPath href={`#${idBot}`} startOffset="50%" textAnchor="middle">{`${pad2(m)}.${pad2(d)}.${y}`}</textPath>
        </text>
      </svg>
      <span className="jh-wall-art"><Sticker entry={entry} size="md" /></span>
    </button>
  )
}

/* ------------------------------ 日期工具 ------------------------------ */

const pad2 = (n) => String(n).padStart(2, '0')
const keyOf = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`
const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number)
  return { y, m, d }
}
const shiftKey = (k, delta) => {
  const { y, m, d } = parseKey(k)
  const t = new Date(y, m - 1, d + delta)
  return keyOf(t.getFullYear(), t.getMonth() + 1, t.getDate())
}
const weekOf = (k) => {
  const { y, m, d } = parseKey(k)
  const base = new Date(y, m - 1, d)
  const start = new Date(base)
  start.setDate(base.getDate() - base.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const t = new Date(start)
    t.setDate(start.getDate() + i)
    return keyOf(t.getFullYear(), t.getMonth() + 1, t.getDate())
  })
}
const monthCells = (y, m) => {
  const lead = new Date(y, m - 1, 1).getDay()
  const days = new Date(y, m, 0).getDate()
  const cells = Array(lead).fill(null)
  for (let d = 1; d <= days; d += 1) cells.push(keyOf(y, m, d))
  while (cells.length % 7) cells.push(null)
  return cells
}

/* --------------------------- 贴纸 --------------------------- */
/**
 * 手账里那张「图」只有一个出口 —— 和商品的 ItemArt 同理，别再各写各的。
 * 优先级：用户自己拍的照片 > 商品图 > 手写小记的线描符号（**不退回 emoji**）。
 */
function Sticker({ entry, size = 'sm' }) {
  const cls = `jh-sticker jh-sticker-${size}`
  if (entry?.thumb) {
    // 自己拍的照片裁满（cover），商品图留白（contain）—— 见 styles.css 的 .jh-sticker.is-photo
    return (
      <span className={`${cls} is-photo`}>
        <img src={entry.thumb} alt={entry.name || '自己拍的一张'} loading="lazy" />
      </span>
    )
  }
  const art = entry?.id ? getItem(entry.id)?.image : null
  if (art) {
    return (
      <span className={cls}>
        <img src={art} alt={entry.name || ''} loading="lazy" />
      </span>
    )
  }
  return <span className={`${cls} is-note`}><NoteMark /></span>
}

// 手写条目不是商品，没有图可用 —— 但这里不退回 emoji（项目红线）。
// 用一枚线描「小记」代替：它表示「这是你自己写下的一行字」，不是一道菜。
function NoteMark() {
  return (
    <svg className="jh-mark" viewBox="0 0 32 32" role="img" aria-label="自己写下的一笔">
      <path d="M9 5.5h11L25 10.5v16H9z" />
      <path d="M20 5.5v5h5" />
      <path d="M12.5 16h9M12.5 20.5h5.5" />
    </svg>
  )
}

/* ================================ 主体 ================================ */

export default function JournalView() {
  const todayKey = journalKey()
  const [journal, setJournal] = useState(() => loadJournal())
  const [view, setView] = useState('month') // month | week | day | stamps
  const [focus, setFocus] = useState(todayKey)
  const [draft, setDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState(null) // null = 还没动过，直接显示存着的那份
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState('')
  const [opened, setOpened] = useState(null) // { key, index } —— 展开的那一张
  const [page, setPage] = useState(0)        // 印记墙的页码（6 枚一页）
  const [turnDir, setTurnDir] = useState(1)  // 翻页方向（决定纸张从哪边翻过来）
  const [flipped, setFlipped] = useState(null) // 正在翻面的那枚（uid）
  const wallRef = useRef(null)
  const swipeX0 = useRef(null)
  const flipTimer = useRef(null)
  const fileRef = useRef(null)

  const days = journal.days || {}
  const refresh = () => setJournal(loadJournal())

  const itemsOf = (k) => (days[k]?.items || []).filter((it) => it && it.name)
  const dayOf = (k) => days[k] || EMPTY_DAY

  // 全部记录摊平成一条时间线 —— 集章、印记墙和回顾都基于它
  // idx 带上：印记墙点开详情要用它在那天里的位置
  const timeline = useMemo(() => {
    const out = []
    Object.keys(days).sort().forEach((k) => {
      itemsOf(k).forEach((it, idx) => out.push({ key: k, idx, ...it }))
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  // 印记墙：新的盖在前面（翻本子从最近翻起），6 枚一页
  const PER_PAGE = 6
  const wallEntries = useMemo(() => [...timeline].reverse(), [timeline])
  const pageCount = Math.max(1, Math.ceil(wallEntries.length / PER_PAGE))
  const wallPageEntries = wallEntries.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)

  const focusParts = parseKey(focus)
  const monthPrefix = `${focusParts.y}-${pad2(focusParts.m)}`
  const monthCellsList = monthCells(focusParts.y, focusParts.m)

  // 集章：第 N 份落在哪一天
  const stamps = STAMP_STEPS.map((n) => ({ n, date: timeline[n - 1]?.key || null }))

  // 回顾：这个月的份数 / 铺子数 / 最常出现的那一道
  const monthEntries = timeline.filter((e) => e.key.startsWith(monthPrefix))
  const shopIds = new Set()
  const nameCount = {}
  monthEntries.forEach((e) => {
    const item = e.id ? getItem(e.id) : null
    if (item?.counterId) shopIds.add(item.counterId)
    nameCount[e.name] = (nameCount[e.name] || 0) + 1
  })
  const favorite = Object.entries(nameCount).sort((a, b) => b[1] - a[1])[0] || null

  const openedEntry = opened ? itemsOf(opened.key)[opened.index] || null : null

  /* ------------------------------ 操作 ------------------------------ */

  const step = (dir) => {
    if (view === 'stamps') {
      // 印记墙里，箭头就是翻页
      turnPage(dir)
      return
    }
    if (view === 'month') {
      const { y, m, d } = parseKey(focus)
      const t = new Date(y, m - 1 + dir, 1)
      const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
      setFocus(keyOf(t.getFullYear(), t.getMonth() + 1, Math.min(d, lastDay)))
      return
    }
    if (view === 'week') setFocus(shiftKey(focus, dir * 7))
    else setFocus(shiftKey(focus, dir))
  }

  // 翻页：方向记下来给纸张动画用，越界就停
  const turnPage = (dir) => {
    const next = page + dir
    if (next < 0 || next > pageCount - 1) return
    setTurnDir(dir)
    buzz(6)
    setPage(next)
  }

  const backToToday = () => {
    setFocus(todayKey)
    setView('day')
  }

  const switchView = (next) => {
    if (next === 'day') setFocus(todayKey)
    if (next === 'stamps') setPage(0)
    setView(next)
  }

  // 点一枚章：先翻面（＋震动），翻过去之后才展开详情 —— 仪式感在这半秒里
  const flipStamp = (entry) => {
    if (flipped) return
    buzz(10)
    setFlipped(`${entry.key}:${entry.idx}`)
    clearTimeout(flipTimer.current)
    flipTimer.current = setTimeout(() => {
      setFlipped(null)
      openEntry(entry.key, entry.idx)
    }, 380)
  }

  const openDay = (k) => {
    setFocus(k)
    setView('day')
    setNoteDraft(null)
  }

  const openEntry = (k, index) => setOpened({ key: k, index })
  const closeEntry = () => setOpened(null)

  const addDraft = (e) => {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    addJournalItem(todayKey, name)
    setDraft('')
    refresh()
  }

  /**
   * 用户自己拍的那张 —— 整个功能的主干。
   * 选图 → 压到长边 1600 存 IndexedDB → 缩略图随条目进 localStorage → 直接展开看。
   * 缩略图是为了让日历格和列表**同步**就能渲染出来（不能为一个格子去 await 一次 IDB）。
   */
  const onPickPhoto = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // 允许连着挑同一张
    if (!file) return
    setBusy(true)
    setHint('正在把这张照片存进手账…')
    try {
      const { blob, thumb } = await preparePhoto(file)
      const photoId = newPhotoId()
      const ok = await putPhoto(photoId, blob)
      if (!ok) throw new Error('这张照片没能存下来，可能相册被浏览器限制了')
      const entry = addJournalItem(todayKey, DEFAULT_PHOTO_NAME, { photoId, thumb })
      refresh()
      setFocus(todayKey)
      setView('day')
      setNoteDraft(null)
      // 直接展开，让用户接着补名字和店名（参考 App 的拍摄 → Detail 流程）
      const idx = (loadJournal().days[todayKey]?.items || []).length - 1
      if (entry) setOpened({ key: todayKey, index: idx })
      setHint('')
    } catch (err) {
      setHint(err?.message || '这张照片读不出来，换一张试试')
    } finally {
      setBusy(false)
    }
  }

  const commitNote = () => {
    if (noteDraft === null) return
    setJournalNote(todayKey, noteDraft, null)
    setNoteDraft(null)
    refresh()
  }

  const pickMood = (id) => {
    setJournalNote(todayKey, null, dayOf(todayKey).mood === id ? '' : id)
    refresh()
  }

  const drop = (key, index) => {
    removeJournalItem(key, index)
    if (opened && opened.key === key) setOpened(null)
    refresh()
  }

  /* ------------------------------ 标题 ------------------------------ */

  const isToday = focus === todayKey
  const viewTitle = view === 'stamps'
    ? `印记 · ${timeline.length} 枚`
    : view === 'month'
      ? `${focusParts.y} 年 ${focusParts.m} 月`
      : view === 'week'
        ? `${parseKey(weekOf(focus)[0]).m}.${parseKey(weekOf(focus)[0]).d} – ${parseKey(weekOf(focus)[6]).m}.${parseKey(weekOf(focus)[6]).d}`
        : `${focusParts.m} 月 ${focusParts.d} 日`

  const viewSub = view === 'stamps'
    ? '左右翻着看'
    : view === 'day'
      ? `${WEEK_CN[new Date(focusParts.y, focusParts.m - 1, focusParts.d).getDay()]}${isToday ? ' · 今天' : ''}`
      : `${monthEntries.length} 份 · ${shopIds.size} 家铺子`

  /* ------------------------------ 渲染 ------------------------------ */

  const cellNode = (k, idx, big) => {
    const list = itemsOf(k)
    const first = list[0] || null
    const isTodayCell = k === todayKey
    const isFocus = k === focus
    return (
      <button
        key={k}
        type="button"
        className={`jh-cell${big ? ' is-big' : ''}${isTodayCell ? ' is-today' : ''}${list.length ? ' has' : ''}${isFocus ? ' is-focus' : ''}`}
        style={{ '--i': idx }}
        onClick={() => openDay(k)}
        aria-label={`${parseKey(k).m} 月 ${parseKey(k).d} 日${list.length ? `，记了 ${list.length} 笔` : ''}`}
      >
        <span className="jh-dnum">{parseKey(k).d}</span>
        {first && (
          <span className="jh-thumbs">
            <Sticker entry={first} size={big ? 'md' : 'sm'} />
          </span>
        )}
        {list.length > 0 && <span className="jh-badge">{list.length}</span>}
      </button>
    )
  }

  return (
    <div className="jh">
      <header className="jh-top">
        <button type="button" className="jh-heading" onClick={backToToday} title="回到今天">
          <span className="jh-h1">{viewTitle}</span>
          <span className="jh-h2">{viewSub}</span>
        </button>
        <div className="jh-arrows">
          <button type="button" onClick={() => step(-1)} aria-label="往前"><ChevronLeft size={17} strokeWidth={1.7} /></button>
          <button type="button" onClick={() => step(1)} aria-label="往后"><ChevronRight size={17} strokeWidth={1.7} /></button>
        </div>
      </header>

      {hint && <p className="jh-hint">{hint}</p>}

      {/* 换视图 / 换日期都换 key —— 动画自然重放，不需要额外的状态机 */}
      <div className={`jh-stage jh-stage-${view}`} key={`${view}-${focus}`}>
        {view === 'month' && (
          <div className="jh-grid">
            {WEEK_CN.map((w) => <span key={w} className="jh-dow">{w}</span>)}
            {monthCellsList.map((k, i) => (k ? cellNode(k, i, false) : <span key={`b${i}`} className="jh-blank" />))}
          </div>
        )}

        {view === 'week' && (
          <div className="jh-week">
            {WEEK_CN.map((w) => <span key={w} className="jh-dow">{w}</span>)}
            {weekOf(focus).map((k, i) => cellNode(k, i, true))}
          </div>
        )}

        {view === 'stamps' && (
          <div
            className="jh-wall"
            ref={wallRef}
            onPointerDown={(e) => { swipeX0.current = e.clientX }}
            onPointerUp={(e) => {
              const x0 = swipeX0.current
              swipeX0.current = null
              if (x0 == null) return
              const dx = e.clientX - x0
              if (Math.abs(dx) > 42) turnPage(dx < 0 ? 1 : -1) // 往左滑 = 下一页
            }}
          >
            {/* key 换页即换 —— 纸张翻页动画跟着重放 */}
            <div className="jh-wall-page" key={page} style={{ '--dir': turnDir }}>
              {wallPageEntries.length > 0 ? wallPageEntries.map((e, i) => (
                <WallStamp
                  key={`${e.key}:${e.idx}`}
                  entry={e}
                  uid={`${e.key}-${e.idx}`}
                  idx={page * PER_PAGE + i}
                  flipped={flipped === `${e.key}:${e.idx}`}
                  onFlip={flipStamp}
                />
              )) : (
                <p className="jh-wall-empty">
                  还没有印记 —— 贴一张照片，或者点完一单，<br />第一枚会自己盖在这里。
                </p>
              )}
            </div>
            <p className="jh-wall-num">- {page + 1} -</p>
            {pageCount > 1 && (
              <p className="jh-wall-swipe">往左翻，翻到最早的那一天</p>
            )}
          </div>
        )}

        {view === 'day' && (
          <section className="jh-day">
            {!isToday && (
              <p className="jh-day-hint">
                这是 {focusParts.m} 月 {focusParts.d} 日 那一天，只能看。
                <button type="button" onClick={backToToday}>回到今天</button>
              </p>
            )}

            {itemsOf(focus).length > 0 ? (
              <ul className="jh-lines">
                {itemsOf(focus).map((it, i) => (
                  // 点整张 → 展开看大的（参考 App 是点贴纸进 Detail；那一行的「删」也搬进详情页了）
                  <li key={`${it.name}-${i}`}>
                    <button
                      type="button"
                      className="jh-line"
                      onClick={() => openEntry(focus, i)}
                      aria-label={`展开「${it.name}」`}
                    >
                      <span className="jh-line-art">
                        <Sticker entry={it} size="xs" />
                      </span>
                      <span className="jh-line-text">
                        <span className="jh-line-name">{it.name}</span>
                        {(it.place || timeOf(it.at)) && (
                          <span className="jh-line-sub">
                            {[it.place, timeOf(it.at)].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="jh-day-empty">
                {isToday ? '今天还是空的。贴一张自己拍的照片，或者点完一单等它自己掉进来。' : '这一天没有留下什么。'}
              </p>
            )}

            {isToday && (
              <button type="button" className="jh-shoot" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Camera size={19} strokeWidth={1.6} aria-hidden="true" />
                <span>
                  <b>{busy ? '正在存下这一张…' : '贴一张自己拍的照片'}</b>
                  <em>拍照或从相册选一张</em>
                </span>
              </button>
            )}

            {isToday && (
              <form className="jh-add" onSubmit={addDraft}>
                <Plus size={15} strokeWidth={1.9} aria-hidden="true" />
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="今天还想吃点什么…"
                  aria-label="记一笔今天想吃的"
                  maxLength={40}
                />
                <button type="submit" className="jh-add-btn" disabled={!draft.trim()}>记下</button>
              </form>
            )}

            {isToday && (
              <>
                <div className="jh-moods" role="group" aria-label="今天大概是什么感觉">
                  {MOODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`jh-mood${dayOf(todayKey).mood === m.id ? ' is-on' : ''}`}
                      aria-pressed={dayOf(todayKey).mood === m.id}
                      onClick={() => pickMood(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <label className="jh-note-box">
                  <span>写一句给自己</span>
                  <textarea
                    className="jh-note"
                    rows={3}
                    maxLength={200}
                    value={noteDraft ?? (dayOf(todayKey).note || '')}
                    placeholder="今天为什么想点这一单？"
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onBlur={commitNote}
                  />
                  <em>离开这一格就会自动存下。</em>
                </label>
              </>
            )}

            {!isToday && dayOf(focus).note && <p className="jh-note-read">{dayOf(focus).note}</p>}
            {!isToday && dayOf(focus).mood && (
              <p className="jh-mood-read">
                {MOODS.find((m) => m.id === dayOf(focus).mood)?.label}
              </p>
            )}
          </section>
        )}
      </div>

      {/* 集章：参考 App 的「Reached 10 Cups」 */}
      <section className="jh-stamps" aria-label="留下的印记">
        <p className="jh-sec-head">留下的印记</p>
        <div className="jh-stamp-row">
          {stamps.map((s) => (
            <div key={s.n} className={`jh-stamp${s.date ? ' is-on' : ''}`}>
              <svg viewBox="0 0 48 48" aria-hidden="true" className="jh-stamp-ring">
                <path d="M24 3.5c3.4 0 5.1 2.6 8.4 2.2 3.3-.4 5.4 1.7 5.6 5 .2 3.3 2.4 4.9 2.4 8.3s-2.2 5-2.4 8.3c-.2 3.3-2.3 5.4-5.6 5-3.3-.4-5 2.2-8.4 2.2s-5.1-2.6-8.4-2.2c-3.3.4-5.4-1.7-5.6-5-.2-3.3-2.4-4.9-2.4-8.3s2.2-5 2.4-8.3c.2-3.3 2.3-5.4 5.6-5 3.3.4 5-2.2 8.4-2.2z" />
              </svg>
              <b>{s.n}</b>
              {/* 没盖的章不写字（2026-09-22）：原来写「还没到」= 催促口径，
                  和「不催更」的语气冲突。空着只留虚线齿轮，认得出是「还没到」但不逼迫。 */}
              {s.date && <span>{`${parseKey(s.date).m}.${pad2(parseKey(s.date).d)}`}</span>}
            </div>
          ))}
        </div>
        <p className="jh-sec-foot">第 1 / 5 / 10 / 25 / 50 份，各留一枚。慢慢来。</p>
      </section>

      {/* 回顾卡：只留「温柔的回顾」，不记卡路里也不算账 */}
      <section className="jh-review" aria-label="这个月">
        <p className="jh-sec-head">{focusParts.m} 月这一页</p>
        {monthEntries.length > 0 ? (
          <>
            <div className="jh-review-nums">
              <div><b>{monthEntries.length}</b><span>份想过</span></div>
              <div><b>{shopIds.size}</b><span>家铺子</span></div>
            </div>
            {favorite && (
              <p className="jh-review-fav">
                最常想起　<b>{favorite[0]}</b>
                <em>{favorite[1]} 次</em>
              </p>
            )}
          </>
        ) : (
          <p className="jh-review-empty">这个月还没有翻过的痕迹。</p>
        )}
      </section>

      <p className="jh-foot">
        这本手账只存在你这台设备上 —— 照片和字都在浏览器里，换一台手机就看不到了。
        它是一本手写的账，不是一份真实的记录。
      </p>

      {/* 悬浮胶囊底栏 */}
      <nav className="jh-dock" aria-label="切换手账视图">
        <button type="button" className={view === 'month' ? 'is-on' : ''} onClick={() => switchView('month')}>月</button>
        <button type="button" className={view === 'week' ? 'is-on' : ''} onClick={() => switchView('week')}>周</button>
        <button type="button" className={view === 'day' ? 'is-on' : ''} onClick={() => switchView('day')}>今天</button>
        <button type="button" className={view === 'stamps' ? 'is-on' : ''} onClick={() => switchView('stamps')}>印记</button>
        <button
          type="button"
          className="jh-dock-add"
          onClick={() => fileRef.current?.click()}
          aria-label="贴一张自己拍的照片"
          title="贴一张自己拍的照片"
        >
          <Plus size={19} strokeWidth={1.9} />
        </button>
      </nav>

      {/* 相册/相机入口。不加 capture —— 那会直接开相机，用户就没有「从相册选」这条路了 */}
      <input
        ref={fileRef}
        className="file-input"
        type="file"
        accept="image/*"
        onChange={onPickPhoto}
      />

      {openedEntry && (
        <EntryDetail
          // key 让「换一张」时**重新挂载** —— 备注卡里的输入框初值只算一次，
          // 不换 key 的话翻到下一张还留着上一张的字。
          key={`${opened.key}:${opened.index}`}
          entry={openedEntry}
          dateKey={opened.key}
          index={opened.index}
          canEdit={opened.key === todayKey}
          dayMood={dayOf(opened.key).mood}
          onClose={closeEntry}
          onChanged={refresh}
          onDelete={() => drop(opened.key, opened.index)}
        />
      )}
    </div>
  )
}

/* 展开那一张的详情页（备注卡）已抽到 `components/EntryDetail.jsx`：
   食物手账与「存下这一餐」的照片墙共用同一个组件，字段白名单在 storage.js 里。 */
