import { useMemo, useState } from 'react'
import { BookOpen, Plus, Trash2 } from 'lucide-react'
import { getItem } from '../data.js'
import {
  addJournalItem,
  journalKey,
  loadJournal,
  removeJournalItem,
  setJournalNote,
} from '../storage.js'
import ItemArt from './ItemArt.jsx'

/**
 * JournalView —— 食物手账
 *
 * 这是那个 agent 停在数据层的地方（storage.js 里 7 个 API 都写好了，UI 一行没有）。
 * 2026-09-16 用户定：不新增首页入口，并进「把这一餐存下来」那张磁贴，做成第二个视图。
 *
 * 语气红线（跟惜食柜、公益档案一致）：
 *   · 不记卡路里、不算账、不做「连续打卡 N 天」这种催更
 *   · 它不是记账本，是「这些天我想过、点过、最后没有真的吃掉的东西」的落脚处
 *   · 必须诚实：数据只在这台设备上
 */

const JOURNAL_MOODS = [
  { id: 'bright', emoji: '✨', label: '今天挺好' },
  { id: 'good', emoji: '🌿', label: '还不错' },
  { id: 'quiet', emoji: '☕', label: '想静静' },
  { id: 'sweet', emoji: '🍰', label: '需要点甜的' },
  { id: 'tired', emoji: '🌧️', label: '有点累' },
  { id: 'empty', emoji: '🫧', label: '空落落' },
]

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const EMPTY_DAY = { items: [], note: '', mood: '' }

// 自己手写的那一笔不是商品，没有商品图可用 —— 但这里不退回 emoji（项目红线）。
// 用一枚线描「小记」代替：它表示「这是你自己写下的一行字」，不是一道菜，
// 所以不该假装有菜图，也不该塞个盘子 emoji 充数。
function NoteMark() {
  return (
    <svg className="ji-mark" viewBox="0 0 32 32" role="img" aria-label="自己写下的一笔">
      <path d="M9 5.5h11L25 10.5v16H9z" />
      <path d="M20 5.5v5h5" />
      <path d="M12.5 16h9M12.5 20.5h5.5" />
    </svg>
  )
}

function dayParts(key) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return { label: `${m} 月 ${d} 日`, week: WEEK[date.getDay()] || '' }
}

export default function JournalView() {
  const todayKey = journalKey()
  const [journal, setJournal] = useState(() => loadJournal())
  const [draft, setDraft] = useState('')
  const [noteDraft, setNoteDraft] = useState(null) // null = 还没动过，直接显示存着的那份

  const today = journal.days[todayKey] || EMPTY_DAY
  const noteValue = noteDraft ?? (today.note || '')

  const history = useMemo(
    () => Object.entries(journal.days)
      .filter(([k]) => k !== todayKey)
      .sort((a, b) => b[0].localeCompare(a[0])),
    [journal, todayKey]
  )

  const totalDays = history.length + ((today.items?.length || today.note || today.mood) ? 1 : 0)

  const refresh = () => setJournal(loadJournal())

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
    setJournalNote(todayKey, null, today.mood === id ? '' : id)
    refresh()
  }

  const drop = (index) => {
    removeJournalItem(todayKey, index)
    refresh()
  }

  const parts = dayParts(todayKey)

  return (
    <div className="journal-view">
      <section className="journal-intro">
        <p className="eyebrow">FOOD JOURNAL</p>
        <h1>这些天，你想过的东西。</h1>
        <p>
          这里不记卡路里，也不打卡。只记你点过、想过、最后没有真的吃掉的那些东西 ——
          它们本来会变成一份没人吃的外卖。
        </p>
      </section>

      {/* 今天那一页：可编辑 */}
      <section className="journal-today" aria-label="今天那一页">
        <div className="jt-head">
          <span className="jt-date">{parts.label} · {parts.week}</span>
          <span className="jt-tag">今天</span>
        </div>

        {today.items.length > 0 ? (
          <ul className="journal-items">
            {today.items.map((it, i) => {
              const item = it.id ? getItem(it.id) : null
              return (
                <li key={`${it.name}-${i}`} className="journal-item">
                  <span className="ji-art">
                    {item
                      ? <ItemArt item={item} size="sm" prefer="draw" />
                      : <NoteMark />}
                  </span>
                  <span className="ji-name">{it.name}</span>
                  <button
                    className="ji-del"
                    onClick={() => drop(i)}
                    aria-label={`删掉「${it.name}」这一笔`}
                  >
                    <Trash2 size={14} strokeWidth={1.6} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="jt-empty">
            今天还是空的。点完一单外卖，这里会自动多一行 —— 也可以自己写一笔。
          </p>
        )}

        <form className="jt-add" onSubmit={addDraft}>
          <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="今天还想吃点什么…"
            aria-label="记一笔今天想吃的"
            maxLength={40}
          />
          <button type="submit" disabled={!draft.trim()}>记下</button>
        </form>
      </section>

      {/* 今天的心情：不评判，只是留个标签 */}
      <section className="journal-mood" aria-label="今天的心情">
        <p className="journal-mood-head">今天大概是什么感觉？</p>
        <div className="journal-mood-row" role="group">
          {JOURNAL_MOODS.map((m) => (
            <button
              key={m.id}
              className={`jm-chip ${today.mood === m.id ? 'is-active' : ''}`}
              aria-pressed={today.mood === m.id}
              onClick={() => pickMood(m.id)}
            >
              <span aria-hidden="true">{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>
      </section>

      {/* 便签：写给自己的一句话 */}
      <section className="journal-note-box" aria-label="写一句给自己">
        <label htmlFor="journal-note">写一句给自己</label>
        <textarea
          id="journal-note"
          className="journal-note"
          value={noteValue}
          rows={3}
          maxLength={200}
          placeholder="今天为什么想点这一单？"
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={commitNote}
        />
        <p className="journal-note-hint">离开这一格就会自动存下。</p>
      </section>

      {/* 以前的那些天 */}
      <section className="journal-history" aria-label="以前记下的">
        <div className="jh-head">
          <BookOpen size={14} strokeWidth={1.7} />
          <span>以前记下的</span>
          <em>{totalDays > 0 ? `共 ${totalDays} 天` : '还是空的'}</em>
        </div>

        {history.length === 0 ? (
          <p className="jh-empty">
            再往前翻就没有了 —— 从今天开始慢慢记也来得及。
          </p>
        ) : (
          <ul className="jh-list">
            {history.map(([key, day]) => {
              const p = dayParts(key)
              const mood = JOURNAL_MOODS.find((m) => m.id === day.mood)
              const items = (day.items || []).filter((it) => it && it.name)
              return (
                <li key={key} className="jh-day">
                  <div className="jd-head">
                    <b>{p.label}</b>
                    <span>{p.week}</span>
                    {mood && <em title={mood.label}>{mood.emoji}</em>}
                  </div>
                  {items.length > 0 && (
                    <p className="jd-items">
                      {items.map((it, i) => (
                        <span key={i} className="jd-item">
                          {it.id && getItem(it.id) && <i className="jd-dot" aria-hidden="true" />}
                          {it.name}
                        </span>
                      ))}
                    </p>
                  )}
                  {day.note && <p className="jd-note">{day.note}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="journal-foot">
        这本手账只存在你这台设备上 —— 换一台手机，它就看不到了。
        它是一本手写的账，不是一份真实的记录。
      </p>
    </div>
  )
}
