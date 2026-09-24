import { useState } from 'react'
import { MOODS } from '../journalMeta.js'

/**
 * ReviewCard —— 「这一单，说点什么」评价卡
 *
 * 长得像外卖软件的订单评价卡（戳点 + 一句话 + 提交），但发出去**不是公开**，
 * 而是盖进自己的食物手账：写成独立一笔（店名 + mood + why），用 addJournalItem 落盘。
 *
 * 为什么「星级」换成「戳点」：
 *   外卖评价的五颗星是「打分」，会踩到项目红线「不计分、不催更」。
 *   所以这里复用 MOODS（六种心情）当戳点 —— 它评的是「这一单戳中了我什么」，
 *   不是「这家店好不好」。戳点 → 手账那笔的 `mood`，一句话 → `why`，字段零新增。
 *
 * 为什么是「一单一条」而不是补到某件商品：
 *   外卖评价挂在「订单」上，不挂在「第一件商品」上。手账里自动记下的是每一件商品，
 *   这一条是这一单的心声 —— 独立一笔、没有商品 id，手账里会画成「自己写下的」线描小记。
 *
 * 可跳过：不点、不写、直接往下走，什么都不记，零负担（呼应「不点没事」）。
 */
export default function ReviewCard({ shop, onDone }) {
  const [mood, setMood] = useState('')
  const [why, setWhy] = useState('')
  const [done, setDone] = useState(false)

  const canCommit = !done && Boolean(mood || why.trim())

  const commit = () => {
    if (!canCommit) return
    onDone?.({ mood, why: why.trim() })
    setDone(true)
  }

  if (done) {
    const moodLabel = MOODS.find((m) => m.id === mood)?.label
    return (
      <section className="review-card is-done" aria-label="这一单已经写进手账">
        <span className="print-seal review-seal" aria-hidden="true">印记</span>
        <p className="review-eyebrow">这一单，说点什么</p>
        <p className="review-done">
          {moodLabel ? `「${moodLabel}」` : ''}{why ? `${moodLabel ? ' · ' : ''}${why}` : ''}
        </p>
        <p className="review-foot">写下了，盖进今天那一页，只给你自己看。</p>
      </section>
    )
  }

  return (
    <section className="review-card" aria-label="给这一单写点什么">
      <p className="review-eyebrow">
        这一单，说点什么 <em>只写给自己看</em>
      </p>
      <p className="review-shop">{shop}</p>

      <div className="review-chips" role="group" aria-label="戳中我的是">
        {MOODS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`review-chip${mood === m.id ? ' is-on' : ''}`}
            aria-pressed={mood === m.id}
            onClick={() => setMood(mood === m.id ? '' : m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <textarea
        className="review-why"
        rows={2}
        maxLength={80}
        value={why}
        placeholder="不饿也想要，也行……"
        aria-label="这一句想说的话"
        onChange={(e) => setWhy(e.target.value)}
      />

      <div className="review-actions">
        <button type="button" className="review-submit" disabled={!canCommit} onClick={commit}>
          盖进手账
        </button>
      </div>

      <p className="review-foot">不想写就跳过 —— 这一单也已经记下了。</p>
    </section>
  )
}
