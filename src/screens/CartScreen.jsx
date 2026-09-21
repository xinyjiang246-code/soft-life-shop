import { ArrowLeft, Gift, Minus, Plus, Sparkles, Trash2 } from 'lucide-react'
import { RESCUE, cartBreakdown, getCounter, parseCartKey, promoDrops } from '../data.js'
import { useMemo } from 'react'
import ItemArt from '../components/ItemArt.jsx'

export default function CartScreen({ cart, setCart, onNavigate, onBack }) {
  // 明细与金额统一由 data.js 的 cartBreakdown 算 —— 和结算页共用一份，
  // 免得两个页面各算各的、金额对不上（今天的世界菜单商品换城市后就查不到了，
  // 会在那里被丢掉，不会白屏也不会让角标骗人）
  const { entries, byCounter, subtotal, discount, total } = useMemo(() => cartBreakdown(cart), [cart])

  // 惜食柜的东西柜上就剩那么几份，袋子里的「+」也不能越过这条线。
  // ⚠️ 份数是**按商品**算的：同一碗饭「少一点」「多一点」各一行，加起来也不能超
  const capOf = (item) => (item?.rescue ? RESCUE.perItem : Infinity)
  const heldOf = (itemId) => Object.entries(cart).reduce(
    (n, [key, qty]) => (parseCartKey(key).itemId === itemId ? n + qty : n), 0)
  const atCap = (item) => heldOf(item.id) >= capOf(item)

  const drop = useMemo(() => promoDrops[Math.floor(Math.random() * promoDrops.length)], [entries.length])

  const updateQty = (key, delta) => {
    setCart((prev) => {
      const next = { ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) }
      if (next[key] === 0) delete next[key]
      return next
    })
  }

  const bump = (entry, delta) => {
    if (delta > 0 && atCap(entry.item)) return
    updateQty(entry.key, delta)
  }

  return (
    <div className="shop-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">My Aesthetic Cart</span>
        <div className="icon-button" aria-hidden="true" />
      </header>

      <section className="simple-hero compact" aria-label="购物篮">
        <p className="eyebrow">YOUR SOFT LIFE BASKET</p>
        <h1>今日美学<br />购物篮</h1>
      </section>

      {entries.length === 0 ? (
        <div className="empty-state">
          <p>购物篮还是空的</p>
          <button className="primary-action" onClick={() => onNavigate('home')}>去逛逛</button>
        </div>
      ) : (
        <>
          <section className="cart-list" aria-label="已选商品">
            {entries.map((entry) => {
              const { item, qty, specText, unitPrice } = entry
              return (
              <article key={entry.key} className="cart-row">
                <div className="cart-thumb">
                  <ItemArt item={item} size="sm" prefer="real" />
                </div>
                <div className="cart-info">
                  <p className="cart-name">{item.name}</p>
                  <p className="cart-cn">{item.cn}</p>
                  {/* 规格：同一杯奶茶「去冰」和「少冰」是两行，得让人看清哪杯是哪杯 */}
                  {specText && <p className="cart-spec">{specText}</p>}
                  <p className="cart-price">
                    ¥{unitPrice}
                    {/* 惜食柜来的：原价划掉，让人看清它本来是多少 */}
                    {item.rescue && <s className="cart-was">¥{item.originalPrice}</s>}
                  </p>
                  {item.rescue && <span className="cart-rescue-tag">惜食柜</span>}
                </div>
                <div className="cart-stepper">
                  <button aria-label="减少" onClick={() => bump(entry, -1)}><Minus size={16} strokeWidth={1.4} /></button>
                  {/* key={qty} 是为了让数字变化时重挂元素、重播一次 .qty-num 的淡入 ——
                      React 只改文本不会重播 CSS 动画，换 key 才会 */}
                  <span key={qty} className="qty-num">{qty}</span>
                  <button
                    aria-label="增加"
                    onClick={() => bump(entry, 1)}
                    disabled={atCap(item)}
                    title={atCap(item) ? `柜上只剩 ${capOf(item)} 份` : undefined}
                  ><Plus size={16} strokeWidth={1.4} /></button>
                </div>
                <button className="cart-remove" aria-label="删除" onClick={() => updateQty(entry.key, -qty)}>
                  <Trash2 size={16} strokeWidth={1.4} />
                </button>
              </article>
              )
            })}
          </section>

          <section className="cart-promo" aria-label="优惠进度">
            {Object.values(byCounter).map(({ counter, subtotal: s }) => {
              if (!counter?.discount) return null
              const needed = Math.max(0, counter.discount.threshold - s)
              const progress = Math.min(1, s / counter.discount.threshold)
              return (
                <div key={counter.id} className="promo-row">
                  <p className="promo-label">{counter.name}</p>
                  <div className="promo-bar-bg">
                    <div className="promo-bar-fill" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <p className="promo-text">
                    {needed > 0
                      ? `再凑 ¥${needed} 享 ${counter.tags[0]}`
                      : `已享 ${counter.tags[0]}`}
                  </p>
                </div>
              )
            })}
          </section>

          <section className="drop-card" aria-label="今日掉落">
            <div className="drop-icon"><Gift size={20} strokeWidth={1.4} /></div>
            <div>
              <p className="drop-title">{drop.text}</p>
              <p className="drop-sub">一份不期而遇的小温柔</p>
            </div>
            <Sparkles size={18} strokeWidth={1.35} />
          </section>

          <section className="cart-summary" aria-label="结算">
            <div className="summary-row"><span>小计</span><span>¥{subtotal}</span></div>
            {discount > 0 && <div className="summary-row discount"><span>优惠</span><span>-¥{discount}</span></div>}
            <div className="summary-row total"><span>合计</span><span>¥{total}</span></div>
          </section>
        </>
      )}

      {entries.length > 0 && (
        <div className="bottom-bar">
          <div className="bottom-total">
            <span className="bottom-label">合计</span>
            <span key={total} className="bottom-price num-bump">¥{total}</span>
          </div>
          <button className="primary-button" onClick={() => onNavigate('checkout')}>
            去结算
          </button>
        </div>
      )}
    </div>
  )
}
