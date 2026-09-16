import { ArrowLeft, Heart } from 'lucide-react'
import { CHARITY } from '../data.js'

function formatDay(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export default function CharityScreen({ charity, onBack }) {
  const grams = charity.grams || 0
  const catDays = grams / CHARITY.gramPerCatDay

  return (
    <div className="shop-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">{CHARITY.name}</span>
        <span className="topbar-spacer" />
      </header>

      <section className="charity-hero" aria-label="已捐猫粮">
        <span className="charity-hero-icon" aria-hidden="true"><Heart size={20} strokeWidth={1.5} /></span>
        <p className="charity-hero-label">你替那些没点成的外卖，攒下的猫粮</p>
        <p className="charity-hero-num">
          {grams.toLocaleString()}<small>g</small>
        </p>
        <p className="charity-hero-sub">
          {grams > 0
            ? `约 ${catDays.toFixed(1)} 只猫一天的口粮`
            : '还没有开始 —— 下一单送达后可以捐第一笔'}
        </p>
      </section>

      <div className="charity-stats">
        <div className="charity-stat">
          <span className="charity-stat-num">{charity.orders || 0}</span>
          <span className="charity-stat-label">笔参与的单</span>
        </div>
        <div className="charity-stat">
          <span className="charity-stat-num">{Math.round(charity.amount || 0)}</span>
          <span className="charity-stat-label">元折算出去</span>
        </div>
        <div className="charity-stat">
          <span className="charity-stat-num">{grams > 0 ? (grams / 1000).toFixed(2) : '0.00'}</span>
          <span className="charity-stat-label">公斤猫粮</span>
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
        <p>每完成一餐，我们会把你花掉的这笔钱按 ¥1 = {CHARITY.gramsPerYuan} g 换算成猫粮，你可以自己决定捐多少比例。</p>
        <p>{CHARITY.note}</p>
        <p className="charity-note-dim">这个 App 没有后端，所有数字都记在你自己的浏览器里。它是一本账，不是一次真实的转账 —— 但我们按真实的方式记账。</p>
      </section>

      <footer>慢一点，也是一种很好的生活。</footer>
    </div>
  )
}
