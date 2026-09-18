import { useState } from 'react'
import { ArrowLeft, Heart, Plus, ShoppingBag } from 'lucide-react'
import { getCounter, getItemsByCounter, hashSeed } from '../data.js'
import ItemArt from '../components/ItemArt.jsx'

// 老招牌没有月售/好评字段，用 id 稳定推一个，避免同一样东西每次刷新都在变
function monthlyOf(item) {
  return item.monthly ?? (hashSeed(item.id) % 520 + 140)
}
function praiseOf(item) {
  return item.praise ?? (96 + (hashSeed(item.id + 'p') % 4))
}

function MenuRow({ item, wished, onAdd, onToggleWish }) {
  return (
    <article className="menu-row">
      <div className="menu-thumb">
        <ItemArt item={item} size="sm" prefer="real" />
      </div>

      <div className="menu-info">
        <h3>{item.cn}</h3>
        <p className="menu-en">{item.name}</p>
        {item.description && <p className="menu-desc">{item.description}</p>}
        <p className="menu-meta">
          月售 {monthlyOf(item)} · 好评 {praiseOf(item)}%
        </p>
        <div className="menu-foot">
          <span className="menu-price">¥{item.price}</span>
          {/* 先记着 —— 不饿的时候别急着下单，记下来，等真的想吃了再点 */}
          <button
            className={`wish-toggle ${wished ? 'is-on' : ''}`}
            aria-pressed={wished}
            aria-label={wished ? `不再记着 ${item.cn}` : `先记着 ${item.cn}`}
            title={wished ? '已记着' : '先记着'}
            onClick={() => onToggleWish(item.id)}
          >
            <Heart size={15} strokeWidth={1.7} fill={wished ? 'currentColor' : 'none'} />
          </button>
          <button className="add-button" aria-label={`加入 ${item.cn}`} onClick={() => onAdd(item.id)}>
            <Plus size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </article>
  )
}

export default function CounterDetailScreen({ counterId, cartCount, wishes = [], onNavigate, onBack, onAdd, onToggleWish }) {
  const counter = getCounter(counterId)
  const items = getItemsByCounter(counterId)
  const categories = ['全部', ...Array.from(new Set(items.map((i) => i.category)))]
  const [activeCategory, setActiveCategory] = useState('全部')
  const filtered = activeCategory === '全部' ? items : items.filter((i) => i.category === activeCategory)

  if (!counter) return null

  const cover = counter.heroReal || counter.hero

  return (
    <div className="shop-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">{counter.name}</span>
        <button className="icon-button cart-button bag-button" aria-label={`购物袋，${cartCount} 件商品`} onClick={() => onNavigate('cart')}>
          <ShoppingBag size={21} strokeWidth={1.45} />
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </button>
      </header>

      {/* 店铺头：封面 + 评分月售 + 起送配送 + 公告 */}
      <section className={`store-hero counter-${counter.color}`} aria-label={counter.name}>
        <div className="store-cover">
          {cover ? (
            <img src={cover} alt={counter.name} />
          ) : (
            <span className="shop-cover-fallback" aria-hidden="true">🏪</span>
          )}
        </div>

        <div className="store-head">
          <h1>{counter.name}</h1>
          <p className="store-en">{counter.nameEn}</p>

          <div className="store-stats">
            <span className="shop-rating">★ {counter.rating}</span>
            <span>月售 {counter.monthly}</span>
            <span>{counter.deliveryTime} 分钟</span>
            <span>{counter.distance} km</span>
          </div>

          <div className="store-tags">
            <span className="shop-chip">起送 ¥{counter.minOrder}</span>
            <span className="shop-chip">配送 {counter.deliveryFee === 0 ? '免配送费' : `¥${counter.deliveryFee}`}</span>
            {counter.discount && (
              <span className="shop-chip shop-chip-promo">满{counter.discount.threshold}减{counter.discount.amount}</span>
            )}
            <span className="shop-chip shop-chip-ghost">{counter.hours}</span>
          </div>

          {counter.notice && (
            <p className="store-notice"><b>店内公告</b>{counter.notice}</p>
          )}
        </div>
      </section>

      {categories.length > 2 && (
        <section className="category-tabs" aria-label="分类">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </section>
      )}

      <section className="menu-section" aria-labelledby="store-menu-heading">
        <div className="menu-head">
          <h2 id="store-menu-heading" className="section-title">MENU <em>{filtered.length}/{items.length}</em></h2>
          <span className="menu-head-sub">现做现送 · 出餐约 {Math.max(6, Math.round(counter.deliveryTime / 3))} 分钟</span>
        </div>

        <div className="menu-list">
          {filtered.map((item) => (
            <MenuRow
              key={item.id}
              item={item}
              wished={wishes.includes(item.id)}
              onAdd={onAdd}
              onToggleWish={onToggleWish}
            />
          ))}
          {filtered.length === 0 && <p className="menu-empty">这一类今天还没上。</p>}
        </div>
      </section>

      <footer>慢一点，也是一种很好的生活。</footer>
    </div>
  )
}
