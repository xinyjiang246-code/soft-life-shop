import { BookOpen, Camera, ChevronRight, Heart, Receipt, Store } from 'lucide-react'
import { CHARITY, levelForMeals, petNameFor, petStagesFor } from '../data.js'
import { loadHouseName, loadOrders } from '../storage.js'
import SoftPet from '../components/SoftPet.jsx'

/**
 * MineScreen —— 「我的」tab
 * 聚合：身份卡（软软+小屋名）、订单历史、公益/存档/小店/心愿单入口。
 * 语气延续全 App：不催更、不记账焦虑，订单叫「这一单」。
 */
export default function MineScreen({ pet, charity, customItems, onNavigate }) {
  const orders = loadOrders()
  const house = loadHouseName()
  const name = petNameFor(pet.species || 'cat')
  const stages = petStagesFor(pet.species || 'cat')
  const stage = stages[levelForMeals(pet.meals)]

  return (
    <div className="shop-page mine-page">
      <header className="topbar compact">
        <span className="topbar-spacer" />
        <span className="topbar-title serif">我的</span>
        <span className="topbar-spacer" />
      </header>

      {/* 身份卡 */}
      <section className="mine-id hard-pp" aria-label="我的身份">
        <span className="mine-id-pet"><SoftPet stage={levelForMeals(pet.meals)} mood="happy" colorway={pet.colorway || 'cream'} species={pet.species || 'cat'} size={64} /></span>
        <div className="mine-id-copy">
          <b>{house ? `${house}的小铺` : '我的小铺'}</b>
          <small>{name} · {stage.name} · 陪你少点了 {pet.meals} 次外卖</small>
        </div>
      </section>

      {/* 订单历史 */}
      <section className="mine-orders" aria-label="订单历史">
        <p className="mine-sec-head">这一单又一单 <em>ORDERS</em></p>
        {orders.length === 0 ? (
          <p className="mine-empty">还没有订单。去首页挑一份想要的，等它送到。</p>
        ) : (
          <ul className="mine-order-list">
            {orders.slice(0, 20).map((o, i) => (
              <li key={`${o.at}-${i}`} className="hard-pp">
                <span className="mine-order-icon"><Receipt size={15} strokeWidth={1.6} /></span>
                <div className="mine-order-main">
                  <b>{o.shop}</b>
                  <small>{new Date(o.at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}{o.payment ? ` · ${o.payment}` : ''} · {(o.items || []).slice(0, 2).join('、')}{(o.items || []).length > 2 ? ` 等 ${o.items.length} 件` : ''}</small>
                </div>
                <span className="mine-order-total">¥{o.total}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 入口 */}
      <section className="mine-grid" aria-label="我的东西">
        <button type="button" className="corner-tile" onClick={() => onNavigate('charity')}>
          <span className="corner-tile-icon is-charity"><Heart size={19} strokeWidth={1.5} /></span>
          <b>{CHARITY.name}</b>
          <small>{charity.grams > 0 ? `已捐 ${charity.grams.toLocaleString()} g` : '点完一餐按克捐'}</small>
        </button>
        <button type="button" className="corner-tile" onClick={() => onNavigate('archive')}>
          <span className="corner-tile-icon is-archive"><Camera size={19} strokeWidth={1.5} /></span>
          <b>存档与手账</b>
          <small>照片和纸本小记</small>
        </button>
        <button type="button" className="corner-tile" onClick={() => onNavigate('myshop')}>
          <span className="corner-tile-icon is-myshop"><Store size={19} strokeWidth={1.5} /></span>
          <b>我的小店</b>
          <small>{customItems.length > 0 ? `已上架 ${customItems.length} 件` : '拍照上架'}</small>
        </button>
        <button type="button" className="corner-tile" onClick={() => onNavigate('wishlist')}>
          <span className="corner-tile-icon is-wish"><BookOpen size={19} strokeWidth={1.5} /></span>
          <b>心愿单</b>
          <small>先记着，改天点</small>
        </button>
      </section>

      <footer>慢一点，也是一种很好的生活。</footer>
    </div>
  )
}
