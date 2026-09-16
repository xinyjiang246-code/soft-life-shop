import { ArrowLeft, Plus, ShoppingBag } from 'lucide-react'
import { getCounter, getItem } from '../data.js'
import ItemArt from '../components/ItemArt.jsx'

/* 心愿单 —— 顶栏那颗心原本也是个死按钮。
   它在这间小铺里的意思不是「收藏」，而是**别当场冲动下单**：
   想吃的先记着，明天还记得就再来点。所以这一页只做两件事：
   看看记着的、决定要不要真的点；不催、不提示「仅剩 N 件」。
   ⚠️ 记的是 id，商品没查到就静默跳过（比如世界菜单换城市后旧菜没了）。 */

function fromOf(item) {
  if (item.rescue) return '惜食柜'
  if (item.isWorld) return `世界菜单 · ${item.city || '远方'}`
  if (item.id === 'special-today') return '今日特调'
  if (item.tags?.includes('mine')) return '我的小店'
  return getCounter(item.counterId)?.name || '小铺'
}

export default function WishlistScreen({ wishes = [], cartCount, onAdd, onRemove, onNavigate, onBack }) {
  // 逐条查回来：查不到的（例如那天的世界菜单已经换桌）就不出现
  const items = wishes.map((id) => getItem(id)).filter(Boolean)

  return (
    <div className="shop-page wish-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">心愿单</span>
        <button className="icon-button cart-button" aria-label={`购物袋，${cartCount} 件商品`} onClick={() => onNavigate('cart')}>
          <ShoppingBag size={21} strokeWidth={1.45} />
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </button>
      </header>

      <p className="wish-intro">
        先记着，不急着点 —— 记着不等于点了，它不会替你下单。
        <small>想吃的先放这儿，明天还记得，再来。</small>
      </p>

      {items.length > 0 ? (
        <>
          <h2 className="section-title">WISHED <em>记着 {String(items.length).padStart(2, '0')} 样</em></h2>
          <div className="wish-list">
            {items.map((item) => (
              <article className="wish-row" key={item.id}>
                <div className="wish-thumb">
                  <ItemArt item={item} size="sm" prefer="real" />
                </div>
                <div className="wish-info">
                  <h3>{item.cn}</h3>
                  <p className="wish-en">{item.name}</p>
                  <p className="wish-from">{fromOf(item)} · <b>¥{item.price}</b></p>
                  <div className="wish-actions">
                    <button className="wish-add" onClick={() => onAdd(item.id)}>
                      <Plus size={15} strokeWidth={1.6} />加进袋子
                    </button>
                    <button className="wish-drop" aria-label={`不再记着 ${item.cn}`} onClick={() => onRemove(item.id)}>
                      不再记着
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="wish-empty">
          <p>还没记着什么。</p>
          <small>看到想吃的，点商品旁边那颗小心 —— 先记着，不急着点。</small>
          <button className="wish-browse" onClick={() => onNavigate('home')}>回去逛逛</button>
        </div>
      )}

      <footer>慢一点，也是一种很好的生活。</footer>
    </div>
  )
}
