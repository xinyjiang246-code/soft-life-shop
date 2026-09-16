import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Search as SearchIcon, ShoppingBag, X } from 'lucide-react'
import { dateSeed, getCounter, getCustomItems, getItem, getRescueShelf, getTodaySpecial, getWorldItems, menuItems, pickN, toItemFromSpecial } from '../data.js'
import ItemArt from '../components/ItemArt.jsx'

/* 搜索 —— 顶栏那颗放大镜原本是个死按钮（点了没反应），这里给它真实行为。
   小铺东西不多（6 家店 + 世界菜单 + 惜食柜 + 自己上架的），所以不做后端搜索，
   直接把「所有能被点到的商品」拉成一张索引，就地过滤。
   ⚠️ 惜食柜 / 世界菜单的商品**不能**并进 getAllItems()（会污染店铺菜单），
      这里只是读来当搜索源，用 sourceOf() 决定点进去回到哪一页。 */

// 点一下就有结果的捷径词 —— 都取自菜单里真实存在的字
const QUICK_WORDS = ['抹茶', '面', '茶', '甜', '便当', '汤']

/** 判断一样东西是从哪儿来的：决定点进去回哪一页 */
function sourceOf(item) {
  if (!item) return { label: '小铺', to: 'home', params: {} }
  if (item.rescue) return { label: '惜食柜', to: 'rescue', params: {} }
  if (item.isWorld) return { label: `世界菜单 · ${item.city || '远方'}`, to: 'world', params: {} }
  if (item.id === 'special-today') return { label: '今日特调', to: 'home', params: {} }
  if (item.tags?.includes('mine')) return { label: '我的小店', to: 'myshop', params: {} }
  const shop = getCounter(item.counterId)
  return {
    label: shop?.name || '小铺',
    to: 'counter',
    params: { counterId: item.counterId, from: 'home' },
  }
}

function haystack(item) {
  return [
    item.cn,
    item.name,
    item.description,
    item.category,
    item.city,
    getCounter(item.counterId)?.name,
    ...(item.tags || []),
  ].filter(Boolean).join(' ').toLowerCase()
}

function FindRow({ item, onAdd, onNavigate }) {
  const src = sourceOf(item)
  const go = () => onNavigate(src.to, src.params)
  return (
    <article className="find-row">
      <button className="find-thumb" onClick={go} aria-label={`去「${src.label}」看 ${item.cn}`}>
        <ItemArt item={item} size="sm" prefer="real" />
      </button>
      <div className="find-info">
        <h3>{item.cn}</h3>
        <p className="find-en">{item.name}</p>
        <div className="find-foot">
          <span className="find-price">¥{item.price}</span>
          <button className="find-source" onClick={go}>{src.label} →</button>
        </div>
      </div>
      <button className="add-button" aria-label={`加入 ${item.cn}`} onClick={() => onAdd(item.id)}>
        <Plus size={18} strokeWidth={1.5} />
      </button>
    </article>
  )
}

export default function SearchScreen({ cartCount, onAdd, onNavigate, onBack }) {
  const [query, setQuery] = useState('')

  // 所有「能被点到的」商品：店内菜单 + 我的小店 + 世界菜单 + 惜食柜 + 今日特调
  const index = useMemo(() => {
    const special = getItem('special-today') || toItemFromSpecial(getTodaySpecial())
    return [
      ...menuItems,
      ...getCustomItems(),
      ...getWorldItems(),
      ...getRescueShelf(),
      special,
    ].filter(Boolean)
  }, [])

  const todayPicks = useMemo(() => pickN(menuItems, dateSeed() + 7, 3), [])
  const indexed = useMemo(() => index.map((item) => ({ item, text: haystack(item) })), [index])

  const q = query.trim().toLowerCase()
  const matches = q ? indexed.filter(({ text }) => text.includes(q)).map(({ item }) => item) : []

  return (
    <div className="shop-page search-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <label className="search-field">
          <SearchIcon size={15} strokeWidth={1.7} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="找点什么：抹茶 / 面 / 甜"
            aria-label="搜索商品"
            autoFocus
          />
          {query && (
            <button className="search-clear" aria-label="清空" onClick={() => setQuery('')}>
              <X size={13} strokeWidth={1.9} />
            </button>
          )}
        </label>
        <button className="icon-button cart-button" aria-label={`购物袋，${cartCount} 件商品`} onClick={() => onNavigate('cart')}>
          <ShoppingBag size={21} strokeWidth={1.45} />
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </button>
      </header>

      {!q && (
        <section className="search-intro" aria-label="搜索提示">
          <p className="search-hint">小铺里一共 {index.length} 样东西 —— 打个字，或者点一个：</p>
          <div className="search-words" role="group" aria-label="常用词">
            {QUICK_WORDS.map((w) => (
              <button key={w} className="search-word" onClick={() => setQuery(w)}>{w}</button>
            ))}
          </div>

          <div className="section-rule"><span /></div>
          <h2 className="section-title">TODAY <em>今天这几样</em></h2>
          <div className="find-list">
            {todayPicks.map((item) => (
              <FindRow key={item.id} item={item} onAdd={onAdd} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      )}

      {q && (
        <section className="search-results" aria-label="搜索结果">
          {matches.length > 0 ? (
            <>
              <p className="search-hint">找到 {matches.length} 样</p>
              <div className="find-list">
                {matches.map((item) => (
                  <FindRow key={item.id} item={item} onAdd={onAdd} onNavigate={onNavigate} />
                ))}
              </div>
            </>
          ) : (
            <div className="search-empty">
              <p>「{query.trim()}」今天没找到。</p>
              <small>店里就这些，慢慢逛也行 —— 或者看看今日特调。</small>
              <button className="search-word" onClick={() => setQuery('')}>换个词试试</button>
            </div>
          )}
        </section>
      )}

      <footer>慢一点，也是一种很好的生活。</footer>
    </div>
  )
}
