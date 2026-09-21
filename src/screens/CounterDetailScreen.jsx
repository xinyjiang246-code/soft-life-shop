import { useState } from 'react'
import { ArrowLeft, Heart, Plus, ShoppingBag } from 'lucide-react'
import { getCounter, getItemsByCounter, hashSeed, specsFor, unitPriceOf } from '../data.js'
import ItemArt from '../components/ItemArt.jsx'

/* 规格的初始选中 = 每个单选组各自的默认值（正常冰 / 标准糖 / 正常份）；加料不预选。
   没这东西的人点开就是空的，还得自己回忆「我刚才选的什么」。 */
function defaultPicks(specs) {
  return specs.filter((g) => g.pick === 'one' && g.def).map((g) => g.def)
}

// 老招牌没有月售/好评字段，用 id 稳定推一个，避免同一样东西每次刷新都在变
function monthlyOf(item) {
  return item.monthly ?? (hashSeed(item.id) % 520 + 140)
}
function praiseOf(item) {
  return item.praise ?? (96 + (hashSeed(item.id + 'p') % 4))
}

function MenuRow({ item, wished, onAdd, onToggleWish }) {
  // 规格是**行内展开**的（2026-09-22 用户挑的做法）：不弹半屏、不跳详情页，
  // 点一下 + 这一行自己长出小标签。没有规格的东西（眼罩、蒸饺…）照旧一点就加入。
  const specs = specsFor(item)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(() => defaultPicks(specs))

  const toggle = (group, option) => {
    setPicked((prev) => {
      if (group.pick === 'one') {
        const others = prev.filter((id) => !group.options.some((o) => o.id === id))
        return [...others, option.id]
      }
      return prev.includes(option.id) ? prev.filter((id) => id !== option.id) : [...prev, option.id]
    })
  }

  const add = (specIds) => {
    onAdd(item.id, specIds)
    setOpen(false)
  }

  return (
    <article className={`menu-row${open ? ' is-open' : ''}`}>
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
          <span className="menu-price">¥{specs.length ? unitPriceOf(item, picked) : item.price}</span>
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
          <button
            className="add-button"
            aria-label={specs.length ? `选规格并加入 ${item.cn}` : `加入 ${item.cn}`}
            aria-expanded={specs.length ? open : undefined}
            onClick={() => (specs.length ? setOpen((v) => !v) : add([]))}
          >
            <Plus size={18} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {open && specs.length > 0 && (
        <div className="spec-box">
          {specs.map((group) => (
            <div key={group.id} className="spec-group">
              <p className="spec-label">{group.label}</p>
              <div className="spec-chips">
                {group.options.map((option) => {
                  const on = picked.includes(option.id)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`spec-chip${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => toggle(group, option)}
                    >
                      {option.label}
                      {/* 只有加料 / 加量标价钱 —— 冰量甜度不花钱，标了反而像在点单课堂 */}
                      {option.delta ? <span className="spec-delta">+¥{option.delta}</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <button type="button" className="spec-add" onClick={() => add(picked)}>
            加入 ¥{unitPriceOf(item, picked)}
          </button>
        </div>
      )}
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
