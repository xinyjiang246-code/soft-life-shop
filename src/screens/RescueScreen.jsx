import { ArrowLeft, Plus, ShoppingBag } from 'lucide-react'
import { RESCUE, getCounter, rescueLine } from '../data.js'
import ItemArt from '../components/ItemArt.jsx'

/**
 * 惜食柜 —— 今天没卖完的那几份，折价摆在柜上。
 *
 * 定位：不是「限时秒杀」。这里没有倒计时、没有「仅剩 N 件」的催促，
 * 只有几份没赶上被点走的东西，和一个愿意带走它们的人。
 *
 * 页面结构 = 柜子头（今天几件 + 小铺留的一句话）→ 货架 → 这本账。
 * 账本记的是「份数」，不是「省了多少钱」—— 钱只是附带的说明。
 */
function ShelfRow({ item, taken = 0, onAdd }) {
  const counter = getCounter(item.counterId)
  // 柜上就剩这么几份 —— 陈述事实，不催（没有「仅剩 3 件！」那种电商口吻）
  const left = Math.max(0, RESCUE.perItem - taken)
  const gone = left === 0
  return (
    <article className={`shelf-row ${gone ? 'is-gone' : ''}`}>
      <div className="shelf-thumb">
        <ItemArt item={item} size="sm" prefer="real" />
      </div>

      <div className="shelf-info">
        <div className="shelf-tags">
          <span className="shelf-off">-{item.offPct}%</span>
          <span className="shelf-from">{counter?.name || '慢活小铺'}</span>
          <span className="shelf-left">
            {gone ? '都在你的袋子里了' : `柜上还有 ${left} 份`}
          </span>
        </div>
        <h3>{item.cn}</h3>
        <p className="shelf-en">{item.name}</p>
        <p className="shelf-desc">{item.description}</p>
        <div className="shelf-foot">
          <span className="shelf-price">¥{item.price}</span>
          <span className="shelf-was">¥{item.originalPrice}</span>
          <button
            className="add-button"
            aria-label={gone ? `${item.cn} 已经在你的袋子里了` : `把${item.cn}放进袋子`}
            disabled={gone}
            onClick={() => onAdd(item.id)}
          >
            <Plus size={19} strokeWidth={1.35} />
          </button>
        </div>
      </div>
    </article>
  )
}

export default function RescueScreen({ shelf = [], rescue, cart = {}, cartCount = 0, onAdd, onNavigate, onBack }) {
  const records = rescue?.records || []
  const servings = rescue?.servings || 0
  const yuan = rescue?.yuan || 0
  const orders = rescue?.orders || 0
  const leftOnShelf = shelf.reduce((n, item) => n + Math.max(0, RESCUE.perItem - (cart[item.id] || 0)), 0)

  return (
    <div className="shop-page rescue-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">{RESCUE.name}</span>
        <button className="icon-button cart-button bag-button" aria-label={`购物袋，${cartCount} 件商品`} onClick={() => onNavigate('cart')}>
          <ShoppingBag size={21} strokeWidth={1.45} />
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </button>
      </header>

      {/* 柜子头：一块木牌，写着今天还剩几件 */}
      <section className="rescue-hero" aria-label="今日惜食柜">
        <div className="rescue-sign">
          <p className="eyebrow">{RESCUE.nameEn} · 今日</p>
          <h1>今天没卖完的<br />这几份</h1>
          <p className="rescue-line">{rescueLine()}</p>
        </div>
        <div className="rescue-tally" aria-label={`柜上还有 ${leftOnShelf} 份`}>
          <b>{leftOnShelf}</b>
          <small>份在柜上</small>
        </div>
      </section>
      <p className="rescue-meta">{RESCUE.limitNote}</p>

      {shelf.length === 0 ? (
        <div className="empty-state">
          <p>柜子今天是空的。</p>
          <button className="primary-action" onClick={() => onNavigate('home')}>回小铺</button>
        </div>
      ) : (
        <section className="shelf-list" aria-label="柜上的东西">
          {shelf.map((item) => (
            <ShelfRow key={item.id} item={item} taken={cart[item.id] || 0} onAdd={onAdd} />
          ))}
        </section>
      )}

      <p className="rescue-note">{RESCUE.note}</p>

      {/* 这本账：记的是「有几份被留下」，不是「省了多少钱」 */}
      <section className="rescue-ledger" aria-labelledby="ledger-heading">
        <div className="section-rule"><span /></div>
        <h2 id="ledger-heading">这本账 <em>THE LEDGER</em></h2>

        <div className="ledger-stats">
          <div className="ledger-stat is-primary">
            <b>{servings}</b>
            <small>份被留下</small>
          </div>
          <div className="ledger-stat">
            <b>{orders}</b>
            <small>单带走它们</small>
          </div>
          <div className="ledger-stat">
            <b>¥{yuan}</b>
            <small>比原价少花</small>
          </div>
        </div>

        {records.length === 0 ? (
          <p className="ledger-empty">还没有人从柜子上带走东西。</p>
        ) : (
          <ul className="ledger-records">
            {records.slice(0, 6).map((r) => (
              <li key={r.id}>
                <span className="ledger-date">
                  {new Date(r.at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                </span>
                <span className="ledger-items">
                  {(r.items || []).map((it) => it.cn).join(' · ') || '—'}
                </span>
                <span className="ledger-serving">{r.servings} 份</span>
              </li>
            ))}
          </ul>
        )}

        <p className="ledger-foot">
          这本账存在你自己的浏览器里 —— 换台设备就看不见了。它是一本账，不是一次真实的食物救援。
        </p>
      </section>

      <footer>慢一点，也是一种很好的生活。</footer>

      {cartCount > 0 && (
        <div className="bottom-bar">
          <div className="bottom-total">
            <span className="bottom-label">袋子</span>
            <span className="bottom-price">{cartCount} 件</span>
          </div>
          <button className="primary-button" onClick={() => onNavigate('cart')}>
            看看袋子
          </button>
        </div>
      )}
    </div>
  )
}
