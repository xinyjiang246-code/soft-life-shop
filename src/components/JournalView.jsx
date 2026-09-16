import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { getItem } from '../data.js'
import { addJournalItem, journalKey, loadJournal, removeJournalItem, setJournalNote } from '../storage.js'

/**
 * JournalView —— 食物手账
 *
 * 数据层是另一个 agent 写的（storage.js 的 soft-life-journal-v1 + 7 个 API），
 * UI 2026-09-16 由我补，同日按用户给的参考 App 重做成「月 / 周 / 今天」三视图。
 *
 * 参考来源：用户发的 8 张「咖啡记录 + 集章」App 截图（`参考图/手账App界面/`）。抄过来的是它的
 * **设计语言**：中性米灰底、近黑墨色、等宽打字机数字、大圆角卡片、**贴纸**当视觉隐喻。
 *
 * 语气红线（与惜食柜、公益档案一致）：
 *   · 不记卡路里、不算账、不做「连续打卡 N 天」这种催更
 *   · 参考 App 里满屏的统计（总杯数 / 咖啡因 mg / 每周柱状图）**一律不搬**
 *   · 它是「这些天你点过、想过、最后没有真的吃掉的东西」的落脚处，不是记账本
 *   · 必须诚实：数据只在这台设备上
 */

const EMPTY_DAY = { items: [], note: '', mood: '' }
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

// 心情只用文字标签，不用 emoji（项目红线：商品与界面都不退回 emoji）
const MOODS = [
  { id: 'bright', label: '挺好' },
  { id: 'good', label: '还不错' },
  { id: 'quiet', label: '想静静' },
  { id: 'sweet', label: '想吃点甜的' },
  { id: 'tired', label: '有点累' },
  { id: 'empty', label: '空落落' },
]

// 集章的里程碑：第 N 份。参考 App 的「Reached 10 Cups」，换成小铺的说法。
const STAMP_STEPS = [1, 5, 10, 25, 50]

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

/* --------------------------- 自己手写的那一笔 --------------------------- */
// 手写条目不是商品，没有商品图可用 —— 但这里不退回 emoji（项目红线）。
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
  const [view, setView] = useState('month') // month | week | day
  const [focus, setFocus] = useState(todayKey)
  const [draft, setDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState(null) // null = 还没动过，直接显示存着的那份

  const days = journal.days || {}
  const refresh = () => setJournal(loadJournal())

  const itemsOf = (k) => (days[k]?.items || []).filter((it) => it && it.name)
  const dayOf = (k) => days[k] || EMPTY_DAY

  // 全部记录摊平成一条时间线 —— 集章和回顾都基于它
  const timeline = useMemo(() => {
    const out = []
    Object.keys(days).sort().forEach((k) => {
      itemsOf(k).forEach((it) => out.push({ key: k, ...it }))
    })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

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

  /* ------------------------------ 操作 ------------------------------ */

  const step = (dir) => {
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

  const backToToday = () => {
    setFocus(todayKey)
    setView('day')
  }

  const switchView = (next) => {
    if (next === 'day') setFocus(todayKey)
    setView(next)
  }

  const openDay = (k) => {
    setFocus(k)
    setView('day')
    setNoteDraft(null)
  }

  const addDraft = (e) => {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    addJournalItem(todayKey, name)
    setDraft('')
    refresh()
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

  const drop = (index) => {
    removeJournalItem(focus, index)
    refresh()
  }

  /* ------------------------------ 标题 ------------------------------ */

  const isToday = focus === todayKey
  const viewTitle = view === 'month'
    ? `${focusParts.y} 年 ${focusParts.m} 月`
    : view === 'week'
      ? `${parseKey(weekOf(focus)[0]).m}.${parseKey(weekOf(focus)[0]).d} – ${parseKey(weekOf(focus)[6]).m}.${parseKey(weekOf(focus)[6]).d}`
      : `${focusParts.m} 月 ${focusParts.d} 日`

  const viewSub = view === 'day'
    ? `${WEEK_CN[new Date(focusParts.y, focusParts.m - 1, focusParts.d).getDay()]}${isToday ? ' · 今天' : ''}`
    : `${monthEntries.length} 份 · ${shopIds.size} 家铺子`

  /* ------------------------------ 渲染 ------------------------------ */

  const stickersOf = (k) => itemsOf(k)
    .map((it) => (it.id ? getItem(it.id)?.image : null))
    .filter(Boolean)

  const cellNode = (k, idx, big) => {
    const list = itemsOf(k)
    const stickers = stickersOf(k)
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
        {stickers.length > 0 && (
          <span className="jh-thumbs">
            <img src={stickers[0]} alt="" loading="lazy" />
          </span>
        )}
        {!stickers.length && list.length > 0 && <span className="jh-thumbs"><NoteMark /></span>}
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
                {itemsOf(focus).map((it, i) => {
                  const item = it.id ? getItem(it.id) : null
                  const art = item?.image
                  return (
                    <li key={`${it.name}-${i}`} className="jh-line">
                      <span className="jh-line-art">
                        {art ? <img src={art} alt="" loading="lazy" /> : <NoteMark />}
                      </span>
                      <span className="jh-line-name">{it.name}</span>
                      {isToday && (
                        <button type="button" className="jh-line-del" onClick={() => drop(i)} aria-label={`删掉「${it.name}」这一笔`}>
                          <Trash2 size={14} strokeWidth={1.6} />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="jh-day-empty">
                {isToday ? '今天还是空的。点完一单外卖，这里会自动多一行 —— 也可以自己写一笔。' : '这一天没有留下什么。'}
              </p>
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
              <span>{s.date ? `${parseKey(s.date).m}.${pad2(parseKey(s.date).d)}` : '还没到'}</span>
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
        这本手账只存在你这台设备上 —— 换一台手机，它就看不到了。
        它是一本手写的账，不是一份真实的记录。
      </p>

      {/* 悬浮胶囊底栏 */}
      <nav className="jh-dock" aria-label="切换手账视图">
        <button type="button" className={view === 'month' ? 'is-on' : ''} onClick={() => switchView('month')}>月</button>
        <button type="button" className={view === 'week' ? 'is-on' : ''} onClick={() => switchView('week')}>周</button>
        <button type="button" className={view === 'day' ? 'is-on' : ''} onClick={() => switchView('day')}>今天</button>
        <button type="button" className="jh-dock-add" onClick={backToToday} aria-label="记一笔">
          <Plus size={19} strokeWidth={1.9} />
        </button>
      </nav>
    </div>
  )
}
