import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { getItem } from '../data.js'
import { getPhotoUrl } from '../photoStore.js'
import { updateJournalItem } from '../storage.js'
import { MOODS, moodLabel, timeOf } from '../journalMeta.js'

/**
 * 一笔记录的「备注卡」—— **食物手账的详情页 与 「存下这一餐」的照片墙共用这一个组件**。
 *
 * 为什么要共用（2026-09-17，用户：「这里的图片是和旁边的手帐是联动的」）：
 *   两边是**同一套照片**。如果各写一个详情页，编辑逻辑迟早分叉 ——
 *   最典型的坏法是「在 A 页面填的字段在 B 页面看不见」，而且不报错。
 *   所以字段的白名单只放一份（`storage.js` 的 ENTRY_TEXT_FIELDS），卡片也只做一份。
 *
 * 两段式（用户原话：「点开里面的图片可以跳出来，然后再点一下可以跳出备注」）：
 *   stage 0 —— 只有这张大图，背景压暗，先把照片本身看清楚
 *   stage 1 —— 照片 + 下面的备注卡（日期 / 名字 / 店名 / 心情 / 为什么 / 和谁 / 热量 / AI 写下的）
 *   照片墙从 stage 0 进（照片优先），手账的列表从 stage 1 进（用户已经知道是哪一笔了）——
 *   靠 `initialStage` 区分，两边都不用为对方改行为。
 *
 * 语气红线：不记卡路里、不算账、不打卡。热量那一格是**可选、自己填、绝不汇总**的：
 *   想记就记，空着完全没关系，这里永远不会出现「今天一共多少」。
 */
export default function EntryDetail({
  entry,
  dateKey,
  index,
  canEdit = false,
  dayMood = '',
  onClose,
  onChanged,
  onDelete,
  initialStage = 1,
  showNote = true,
}) {
  const [stage, setStage] = useState(initialStage)
  const [bigUrl, setBigUrl] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [form, setForm] = useState(() => ({
    name: entry.name || '',
    place: entry.place || '',
    mood: entry.mood || '',
    why: entry.why || '',
    company: entry.company || '',
    kcal: entry.kcal || '',
  }))

  const parts = (() => {
    const [y, m, d] = String(dateKey || '').split('-').map(Number)
    return { y, m, d }
  })()

  // 大图在 IndexedDB 里 —— 这是整个手账唯一一次异步取图。
  // ⚠️ 别只判 naturalWidth > 0：卡片会先用 180px 的缩略图顶一下，那样会在缩略图上就「通过」。
  useEffect(() => {
    let alive = true
    setBigUrl(null)
    if (!entry.photoId) return undefined
    getPhotoUrl(entry.photoId).then((url) => {
      if (!alive) {
        if (url) setTimeout(() => URL.revokeObjectURL(url), 1000)
        return
      }
      setBigUrl(url)
    })
    return () => { alive = false }
  }, [entry.photoId])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const commit = () => {
    if (!canEdit) return
    updateJournalItem(dateKey, index, form)
    onChanged?.()
  }

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  // 心情点一下就存，不用等失焦 —— 和手账「今天」页的手感一致
  const pickMood = (id) => {
    const next = form.mood === id ? '' : id
    setForm((prev) => ({ ...prev, mood: next }))
    if (canEdit) {
      updateJournalItem(dateKey, index, { mood: next })
      onChanged?.()
    }
  }

  const art = entry.thumb || (entry.id ? getItem(entry.id)?.image : null)
  const dayMoodLabel = moodLabel(dayMood)
  const hasAi = Boolean(entry.aiNote || entry.tags?.length || entry.swatch)

  const photo = bigUrl
    ? <img src={bigUrl} alt={entry.name || '自己拍的一张'} />
    : art
      ? <img src={art} alt={entry.name || ''} />
      : <span className="jh-detail-note"><NoteMark /></span>

  /* ------------------ stage 0：先把这张照片看清楚 ------------------ */
  if (stage === 0) {
    return (
      <div className="jh-detail is-peek">
        <div className="jh-detail-bg" onClick={onClose} aria-hidden="true" />
        <div className="jh-peek" role="dialog" aria-modal="true" aria-label={`${entry.name || '这一张'} 的照片`}>
          <header className="jh-detail-top">
            <button type="button" onClick={onClose} aria-label="关掉"><X size={19} strokeWidth={1.7} /></button>
            <span>这一张</span>
            <span className="jh-detail-slot" aria-hidden="true" />
          </header>

          {showNote ? (
            <button type="button" className="jh-peek-tap" onClick={() => setStage(1)} aria-label="看这一笔的备注">
              {photo}
            </button>
          ) : (
            <div className="jh-peek-tap is-static">{photo}</div>
          )}

          {showNote && <p className="jh-peek-hint">点一下照片，看这一笔写了什么</p>}
        </div>
      </div>
    )
  }

  /* ------------------ stage 1：照片 + 备注卡 ------------------ */
  return (
    <div className="jh-detail">
      <div className="jh-detail-bg" onClick={onClose} aria-hidden="true" />

      <div className="jh-detail-panel">
        <header className="jh-detail-top">
          <button type="button" onClick={onClose} aria-label="关掉"><X size={19} strokeWidth={1.7} /></button>
          <span>这一张</span>
          {canEdit ? (
            <button
              type="button"
              className="jh-detail-ok"
              onClick={() => { commit(); onClose() }}
              aria-label="存下"
            >
              <CheckIcon />
            </button>
          ) : (
            <span className="jh-detail-slot" aria-hidden="true" />
          )}
        </header>

        <div className="jh-detail-body">
          {/* 中间那张贴纸。自己拍的照片是 cover（裁满），商品图是 contain（不裁） */}
          <div
            className={`jh-detail-photo${entry.photoId ? ' is-photo' : ''}`}
            onClick={entry.photoId ? () => setStage(0) : undefined}
            role={entry.photoId ? 'button' : undefined}
            tabIndex={entry.photoId ? 0 : undefined}
            onKeyDown={entry.photoId ? (e) => { if (e.key === 'Enter') setStage(0) } : undefined}
            title={entry.photoId ? '看大图' : undefined}
          >
            {photo}
          </div>

          <div className="jh-detail-rows">
            <div className="jh-detail-row">
              <CalIcon />
              <span>
                {parts.y} 年 {parts.m} 月 {parts.d} 日{timeOf(entry.at) ? ` · ${timeOf(entry.at)}` : ''}
              </span>
            </div>

            {canEdit ? (
              <>
                <label className="jh-detail-row is-input">
                  <CupIcon />
                  <input
                    value={form.name}
                    maxLength={30}
                    placeholder="这一份叫什么"
                    aria-label="这一份叫什么"
                    onChange={(e) => setField('name', e.target.value)}
                    onBlur={commit}
                  />
                </label>
                <label className="jh-detail-row is-input">
                  <ShopIcon />
                  <input
                    value={form.place}
                    maxLength={24}
                    placeholder="在哪家（可以不写）"
                    aria-label="在哪家买的"
                    onChange={(e) => setField('place', e.target.value)}
                    onBlur={commit}
                  />
                </label>
              </>
            ) : (
              <>
                <div className="jh-detail-row"><CupIcon /><span>{entry.name}</span></div>
                {entry.place && <div className="jh-detail-row"><ShopIcon /><span>{entry.place}</span></div>}
              </>
            )}

            {/* 这一张的心情 —— 与手账「今天」页的「这一天的心情」是两层，互不覆盖 */}
            <div className="jh-detail-row is-chips">
              <MoodIcon />
              <div className="jh-detail-chips" role="group" aria-label="这一张的心情">
                {MOODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!canEdit}
                    className={`jh-detail-chip${form.mood === m.id ? ' is-on' : ''}`}
                    aria-pressed={form.mood === m.id}
                    aria-label={`这一张：${m.label}`}
                    onClick={() => pickMood(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {canEdit ? (
              <>
                <label className="jh-detail-row is-input">
                  <AskIcon />
                  <input
                    value={form.why}
                    maxLength={40}
                    placeholder="为什么想吃它（不饿也想要，也行）"
                    aria-label="为什么想吃它"
                    onChange={(e) => setField('why', e.target.value)}
                    onBlur={commit}
                  />
                </label>
                <label className="jh-detail-row is-input">
                  <PairIcon />
                  <input
                    value={form.company}
                    maxLength={24}
                    placeholder="和谁一起（一个人也行）"
                    aria-label="和谁一起"
                    onChange={(e) => setField('company', e.target.value)}
                    onBlur={commit}
                  />
                </label>
                <label className="jh-detail-row is-input">
                  <GaugeIcon />
                  <input
                    value={form.kcal}
                    maxLength={12}
                    inputMode="numeric"
                    placeholder="热量（想记就记）"
                    aria-label="热量"
                    onChange={(e) => setField('kcal', e.target.value)}
                    onBlur={commit}
                  />
                </label>
              </>
            ) : (
              <>
                {entry.why && <div className="jh-detail-row"><AskIcon /><span>{entry.why}</span></div>}
                {entry.company && <div className="jh-detail-row"><PairIcon /><span>{entry.company}</span></div>}
                {entry.kcal && <div className="jh-detail-row"><GaugeIcon /><span>{entry.kcal}</span></div>}
              </>
            )}

            {dayMoodLabel && (
              <p className="jh-detail-daymood">这一天整体：{dayMoodLabel}</p>
            )}
          </div>

          {hasAi && (
            <section className="jh-detail-ai">
              <p className="jh-detail-ai-head"><Sparkles size={14} strokeWidth={1.7} /><span>当时 AI 写下的</span></p>
              {entry.tags?.length > 0 && (
                <div className="jh-detail-ai-tags">
                  {entry.tags.map((t, i) => <span key={`${t}-${i}`} className="jh-detail-ai-tag">{t}</span>)}
                </div>
              )}
              {entry.aiNote && <p className="jh-detail-ai-note">{entry.aiNote}</p>}
              {entry.swatch && (
                <p className="jh-detail-ai-swatch"><i style={{ background: entry.swatch }} />主色 {entry.swatch}</p>
              )}
            </section>
          )}

          <p className="jh-detail-foot">
            {entry.photoId
              ? '这张照片只存在你这台设备的相册里，没有传到任何地方。'
              : '这一笔是点单时自动记下的，用的是铺子里的图。'}
            {canEdit && ' 热量那一格想记就记 —— 这里不会替你算总数。'}
          </p>

          {canEdit && (
            <button
              type="button"
              className={`jh-detail-del${confirming ? ' is-armed' : ''}`}
              onClick={() => {
                if (!confirming) { setConfirming(true); return }
                onDelete()
              }}
              onBlur={() => setConfirming(false)}
            >
              {confirming ? '真的删掉这一笔？再点一下' : '删掉这一笔'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* 备注卡上的几枚线描图标 —— 与项目其余部分一致：不用 emoji */
const lineProps = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7" {...lineProps} /></svg>
)
const CalIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="2.5" {...lineProps} /><path d="M3.5 10h17M8 3.5v4M16 3.5v4" {...lineProps} /></svg>
)
const CupIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M6 8h12l-1.4 11.5H7.4z" {...lineProps} /><path d="M8.5 8V6.2a3.5 3.5 0 0 1 7 0V8" {...lineProps} /></svg>
)
const ShopIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 9.5 6 4.5h12l2 5" {...lineProps} /><path d="M5 9.5v10h14v-10" {...lineProps} /><path d="M9.5 19.5v-5h5v5" {...lineProps} /></svg>
)
const MoodIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="8.2" {...lineProps} /><path d="M8.8 14.2c.9 1.3 2 1.9 3.2 1.9s2.3-.6 3.2-1.9" {...lineProps} /><path d="M9.2 10h.01M14.8 10h.01" {...lineProps} strokeWidth="2.1" /></svg>
)
const AskIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M20 12.4c0 3.9-3.6 7-8 7-1 0-2-.2-2.9-.5L4.5 20l1.2-3.4C4.6 15.4 4 14 4 12.4c0-3.9 3.6-7 8-7s8 3.1 8 7z" {...lineProps} /><path d="M10.6 10.4a1.6 1.6 0 1 1 2.2 1.5c-.5.2-.8.6-.8 1.1v.3" {...lineProps} /><path d="M12 15.6h.01" {...lineProps} strokeWidth="2" /></svg>
)
const PairIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="9" cy="9" r="3.1" {...lineProps} /><path d="M3.6 19.2c.4-2.9 2.6-4.7 5.4-4.7s5 1.8 5.4 4.7" {...lineProps} /><path d="M15.6 6.6a3 3 0 0 1 0 5.4M17 14.9c2 .5 3.3 2.1 3.6 4.3" {...lineProps} /></svg>
)
const GaugeIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4.5 16.5a7.5 7.5 0 1 1 15 0" {...lineProps} /><path d="M12 16.5 16 11" {...lineProps} /></svg>
)

// 手写条目的兜底符号（没有照片、也没连商品图时）——同样不退回 emoji
const NoteMark = () => (
  <svg className="jh-mark" viewBox="0 0 32 32" role="img" aria-label="自己写下的一笔">
    <path d="M9 5.5h11L25 10.5v16H9z" />
    <path d="M20 5.5v5h5" />
    <path d="M12.5 16h9M12.5 20.5h5.5" />
  </svg>
)
