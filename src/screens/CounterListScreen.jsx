import { useMemo, useState } from 'react'
import { ArrowLeft, ShoppingBag } from 'lucide-react'
import { counters, menuItems } from '../data.js'
import ShopRow from '../components/ShopRow.jsx'

const KIND_LABEL = {
  tea: '茶饮',
  bento: '便当',
  dessert: '甜点',
  life: '选物',
  noodle: '面食',
  dimsum: '点心',
}

export default function CounterListScreen({ cartCount, customItems = [], onNavigate, onBack }) {
  const [kind, setKind] = useState('all')

  const shopCounts = useMemo(() => {
    const map = {}
    for (const shop of counters) {
      map[shop.id] = menuItems.filter((i) => i.counterId === shop.id).length
        + (customItems || []).filter((i) => i.counterId === shop.id).length
    }
    return map
  }, [customItems])

  const kinds = useMemo(
    () => [{ id: 'all', label: '全部' }, ...counters.map((c) => ({ id: c.id, label: KIND_LABEL[c.id] || c.name }))],
    []
  )
  const shown = kind === 'all' ? counters : counters.filter((c) => c.id === kind)

  return (
    <div className="shop-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title">全部店铺</span>
        <button className="icon-button cart-button bag-button" aria-label={`购物袋，${cartCount} 件商品`} onClick={() => onNavigate('cart')}>
          <ShoppingBag size={21} strokeWidth={1.45} />
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </button>
      </header>

      <section className="simple-hero" aria-label="店铺列表">
        <p className="eyebrow">CHOOSE YOUR COMFORT</p>
        <h1>今天想逛<br />哪一家店？</h1>
        <p className="simple-hero-sub">
          {counters.length} 家虚拟店铺，都开在你家 2 公里内。点进去才能下单 —— 和真外卖一样。
        </p>
      </section>

      <div className="shop-kinds" role="tablist" aria-label="按分类看店">
        {kinds.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={kind === k.id}
            className={`kind-chip ${kind === k.id ? 'is-active' : ''}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <section className="counter-list-page" aria-label="店铺卡片">
        <div className="shop-list">
          {shown.map((shop) => (
            <ShopRow
              key={shop.id}
              shop={shop}
              itemCount={shopCounts[shop.id] || 0}
              onOpen={() => onNavigate('counter', { counterId: shop.id, from: 'counters' })}
            />
          ))}
        </div>
      </section>

      <footer>慢一点，也是一种很好的生活。</footer>
    </div>
  )
}
