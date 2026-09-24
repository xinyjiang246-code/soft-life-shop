import { useState } from 'react'
import { ArrowLeft, Heart, X } from 'lucide-react'
import { CHARITY, catDaysText } from '../data.js'

function formatDay(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

function formatFull(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export default function CharityScreen({ charity, onBack, onSettle }) {
  const grams = charity.grams || 0
  const settled = charity.settled || []
  const settledGrams = settled.reduce((n, s) => n + (Number(s.grams) || 0), 0)
  const settledAmount = settled.reduce((n, s) => n + (Number(s.amount) || 0), 0)
  const pending = Math.max(0, grams - settledGrams)
  const rate = grams > 0 ? Math.min(100, Math.round((settledGrams / grams) * 100)) : 0

  const [open, setOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [draftGrams, setDraftGrams] = useState('')
  const [draftTo, setDraftTo] = useState('')

  // 打开表单时默认填「还没捐的那部分」—— 大多数人是一次把攒下的都捐掉
  const armForm = () => {
    setDraftGrams(String(pending || ''))
    setDraftTo('')
    setFormOpen(true)
  }

  const commit = () => {
    // 一位小数：¥1=0.1g 之后账上的克数都是小数（预填的「还没捐的那部分」也是）
    const g = Math.round((Number(draftGrams) || 0) * 10) / 10
    if (g <= 0) return
    onSettle?.({
      grams: g,
      amount: Math.round((g / CHARITY.gramsPerYuan) * 100) / 100,
      to: draftTo.trim(),
    })
    setFormOpen(false)
    setDraftGrams('')
    setDraftTo('')
  }

  return (
    <div className="shop-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">{CHARITY.name}</span>
        <span className="topbar-spacer" />
      </header>

      <section className="charity-hero" aria-label="记下的猫粮">
        <span className="charity-hero-icon" aria-hidden="true"><Heart size={20} strokeWidth={1.5} /></span>
        <p className="charity-hero-label">你替那些没点成的外卖，记下的猫粮</p>
        <button
          className="charity-hero-num is-tap"
          onClick={() => setOpen(true)}
          aria-label="看这一本账的明细"
        >
          {grams.toLocaleString()}<small>g</small>
        </button>
        <p className="charity-hero-sub">
          {grams > 0
            ? `${catDaysText(grams)} · 还没捐出去`
            : '还没有开始 —— 下一单送达后可以记第一笔'}
        </p>
        <button className="charity-hero-more" onClick={() => setOpen(true)}>
          {settled.length ? `已真捐 ${settledGrams.toLocaleString()} g · 点开看明细` : '点开看明细'}
        </button>
      </section>

      <div className="charity-stats">
        <div className="charity-stat">
          <span className="charity-stat-num">{charity.orders || 0}</span>
          <span className="charity-stat-label">笔参与的单</span>
        </div>
        <div className="charity-stat">
          <span className="charity-stat-num">{Math.round(charity.amount || 0)}</span>
          <span className="charity-stat-label">元还没捐</span>
        </div>
        <div className="charity-stat">
          <span className="charity-stat-num">{grams > 0 ? grams.toLocaleString() : '0'}</span>
          <span className="charity-stat-label">克待捐</span>
        </div>
      </div>

      <section className="charity-log" aria-labelledby="charity-log-heading">
        <div className="menu-head">
          <h2 id="charity-log-heading" className="section-title">RECORDS <em>{String((charity.records || []).length).padStart(2, '0')}</em></h2>
        </div>

        {(charity.records || []).length === 0 ? (
          <p className="menu-empty">这里还很空。等你点完第一餐。</p>
        ) : (
          <ul className="charity-records">
            {charity.records.map((r) => (
              <li key={r.id} className="charity-record">
                <span className="charity-record-main">
                  <b>{r.shop || '慢活小铺'}</b>
                  <small>{formatDay(r.at)} · 按 {r.ratio}% 折算</small>
                </span>
                <span className="charity-record-gram">+{r.grams}g</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="charity-note">
        <p><b>这是怎么算的</b></p>
        <p>每完成一餐，我们会把你花掉的这笔钱按 ¥1 = {CHARITY.gramsPerYuan} g 换算成猫粮，你可以自己决定记多少比例。</p>
        <p><b>钱一直在你手上</b> —— 这本账只负责把它算清楚、记下来，转账那一步发生在 App 之外，由你自己的手完成。</p>
        {/* 「我真去捐了」这个按钮以前只问你「捐了多少、捐给谁」，
            却从来没说过这笔钱**可以往哪儿去** —— 全 App 唯一的提示是输入框里那句
            placeholder「比如：北大猫协」。面向陌生人的产品，这恰恰是最该给的一句下一步。 */}
        <p><b>可以捐给谁</b></p>
        <p>
          附近总能找到在收猫粮的地方：小区的固定投喂点、大学里的猫协、做救助的小店 ——
          猫粮实物和小额转账一般都收。给谁、给多少、什么时候给，都由你定。
        </p>
        <p className="charity-note-dim">捐完了可以回来记一笔 —— 不记也没关系，这本账不会催你。</p>
        <p>{CHARITY.note}</p>
        <p className="charity-note-dim">这个 App 没有后端，所有数字都记在你自己的浏览器里。它是一本账，不是一次真实的转账 —— 捐不捐、什么时候捐、捐给谁，都你说了算。</p>
      </section>

      <footer>慢一点，也是一种很好的生活。</footer>

      {open && (
        <div className="jh-detail" role="dialog" aria-label="这一本账的明细">
          <div className="jh-detail-bg" onClick={() => setOpen(false)} />
          <div className="jh-detail-panel">
            <div className="jh-detail-top">
              <span>这一本账</span>
              <button aria-label="收起" onClick={() => setOpen(false)}><X size={18} strokeWidth={1.6} /></button>
            </div>

            <div className="jh-detail-body">
              <div className="cs-sum">
                <div className="cs-sum-row">
                  <span>记下</span><b>{grams.toLocaleString()} g</b>
                </div>
                <div className="cs-sum-row is-done">
                  <span>真捐出去</span><b>{settledGrams.toLocaleString()} g</b>
                </div>
                <div className="cs-sum-row">
                  <span>还没捐</span><b>{pending.toLocaleString()} g</b>
                </div>
                <div className="cs-bar" aria-hidden="true">
                  <i style={{ width: `${rate}%` }} />
                </div>
                <p className="cs-rate">
                  {settled.length
                    ? `兑现了 ${rate}% · 真捐合计约 ¥${Math.round(settledAmount)}`
                    : '还没捐过一次 —— 这些数字目前只是打算'}
                </p>
              </div>

              <div className="cs-block">
                <p className="cs-block-head">真捐记录 <em>{String(settled.length).padStart(2, '0')}</em></p>
                {settled.length === 0 ? (
                  <p className="cs-empty">
                    还没有一次真捐。等你真的转了账，回来这里记一笔 ——
                    那时候这些数字才真的变成了猫粮。
                  </p>
                ) : (
                  <ul className="cs-list">
                    {settled.map((s) => (
                      <li key={s.id} className="cs-item">
                        <span className="cs-item-main">
                          <b>{s.to || '（没写给了谁）'}</b>
                          <small>{formatFull(s.at)}{s.amount ? ` · 约 ¥${Math.round(s.amount)}` : ''}</small>
                        </span>
                        <span className="cs-item-gram">{s.grams.toLocaleString()} g</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {formOpen ? (
                <div className="cs-form">
                  <label className="cs-field">
                    <span>这次捐了多少克</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={draftGrams}
                      aria-label="这次捐了多少克"
                      onChange={(e) => setDraftGrams(e.target.value)}
                    />
                  </label>
                  <label className="cs-field">
                    <span>捐给了谁（选填）</span>
                    <input
                      type="text"
                      value={draftTo}
                      placeholder="比如：小区投喂点 / 北大猫协"
                      aria-label="捐给了谁"
                      onChange={(e) => setDraftTo(e.target.value)}
                    />
                  </label>
                  <div className="cs-actions">
                    <button className="ghost-button" onClick={() => setFormOpen(false)}>先不记</button>
                    <button className="primary-button" onClick={commit} disabled={!(Number(draftGrams) > 0)}>
                      记下这一笔
                    </button>
                  </div>
                </div>
              ) : (
                <button className="cs-settle" onClick={armForm} disabled={grams <= 0}>
                  我真去捐了
                </button>
              )}

              <p className="cs-foot">
                这些记录只存在你这台设备上。App 不会替你转账，也不会看到你捐给了谁。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
