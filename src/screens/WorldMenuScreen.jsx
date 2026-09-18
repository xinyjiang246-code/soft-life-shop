import { ArrowLeft, Plus, RefreshCw, ShoppingBag, Sparkles } from 'lucide-react'
import { WORLD_KITCHENS, getKitchen, tintHex } from '../dishForge.js'
import ItemArt from '../components/ItemArt.jsx'

function WorldCard({ item, onAdd }) {
  return (
    <article className="product-card world-card">
      <div className="product-art">
        <ItemArt item={item} size="lg" />
      </div>
      <p className="product-code">{item.code}</p>
      <h2>{item.name}</h2>
      <p className="product-cn">{item.cn}</p>
      <p className="product-desc">{item.description}</p>
      <div className="product-footer">
        <span>¥{item.price}</span>
        <button className="add-button" aria-label={`加入 ${item.cn}`} onClick={() => onAdd(item.id)}>
          <Plus size={19} strokeWidth={1.35} />
        </button>
      </div>
    </article>
  )
}

export default function WorldMenuScreen({
  kitchenId,
  batch,
  items,
  cartCount,
  onSwitchKitchen,
  onReshuffle,
  onAdd,
  onNavigate,
  onBack,
}) {
  const kitchen = getKitchen(kitchenId)
  // 邮戳日期（仅展示用，不参与任何生成种子）
  const postmarkDate = new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })

  return (
    <div
      className="shop-page world-page"
      style={{ '--world-hex': kitchen.hex, '--world-tint': tintHex(kitchen.hex, 0.84) }}
    >
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">世界菜单</span>
        <button className="icon-button cart-button bag-button" aria-label={`购物袋，${cartCount} 件商品`} onClick={() => onNavigate('cart')}>
          <ShoppingBag size={21} strokeWidth={1.45} />
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </button>
      </header>

      {/* 航空明信片：今天这一桌从哪座城市寄来 */}
      <section className="world-postcard" aria-label="今天的城市">
        <div className="pc-airmail" aria-hidden="true" />
        <div className="pc-main">
          <div className="pc-copy">
            <p className="eyebrow">PAR AVION · 空运来信</p>
            <h1>{kitchen.city}</h1>
            <p className="world-city-en">{kitchen.cityEn}</p>
            <p className="world-blurb">{kitchen.blurb}</p>
            <span className="world-badge"><Sparkles size={12} strokeWidth={1.8} />AI 现编 · 世界上并没有</span>
          </div>
          <div className="pc-stamp" aria-hidden="true">
            <ItemArt item={items[0]} size="lg" />
            <span className="pc-stamp-denom">{items.length} 道 · 空运</span>
          </div>
        </div>
        <div className="pc-foot">
          <div className="pc-postmark" aria-hidden="true">
            <span className="pc-postmark-city">{kitchen.cityEn}</span>
            <svg className="pc-wave" viewBox="0 0 64 14" aria-hidden="true">
              <path d="M2,8 q4,-6 8,0 t8,0 t8,0 t8,0 t8,0 t8,0 t8,0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="pc-postmark-date">{postmarkDate}</span>
          </div>
          <span className="pc-addr">致 · 你的虚拟小屋</span>
        </div>
      </section>

      <div className="world-cities" role="tablist" aria-label="换一个城市">
        {WORLD_KITCHENS.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={k.id === kitchen.id}
            className={`world-city-chip ${k.id === kitchen.id ? 'is-active' : ''}`}
            onClick={() => onSwitchKitchen(k.id)}
          >
            <span className="world-city-dot" style={{ background: k.hex }} />
            {k.city}
          </button>
        ))}
      </div>

      <div className="world-actions">
        <button className="ghost-action" onClick={onReshuffle}>
          <RefreshCw size={15} strokeWidth={1.6} />让 AI 再编一桌
        </button>
        <span className="world-batch">第 {batch + 1} 桌</span>
      </div>

      <section className="product-section" aria-labelledby="world-heading">
        <div className="section-rule"><span /></div>
        <h1 id="world-heading">WORLD MENU <em>{String(items.length).padStart(2, '0')}</em></h1>
        <div className="product-grid">
          {items.map((item) => (
            <WorldCard key={item.id} item={item} onAdd={onAdd} />
          ))}
        </div>
      </section>

      <p className="world-note">
        这一桌菜是 AI 按{kitchen.city}的食材和手法现编的，现实中点不到。
        你可以照样放进购物篮、下单、看着它送到 —— 反正不用真的吃。
      </p>

      <footer>慢一点，也是一种很好的生活。</footer>
    </div>
  )
}
