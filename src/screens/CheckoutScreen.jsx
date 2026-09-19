import { useMemo, useState } from 'react'
import { ArrowLeft, Home, MapPin, Sparkles } from 'lucide-react'
import { cartBreakdown } from '../data.js'
import { saveHouseName } from '../storage.js'

const DECOR_ADDRESSES = [
  '云端 3 巷 7 号',
  '棉花糖大街 12 号',
  '橘子小屋隔壁',
  '慢活小区 8 栋 2 单元',
  '亚麻巷 5 号',
]

export default function CheckoutScreen({ cart, houseName, setHouseName, onNavigate, onBack }) {
  const [name, setName] = useState(houseName || '')
  const [address] = useState(() => DECOR_ADDRESSES[Math.floor(Math.random() * DECOR_ADDRESSES.length)])
  // 按下单前最后一步，得让人看清买了什么、多少钱 ——
  // 早先这页只剩「2 件商品」，从购物袋带过来的金额全丢了
  const { entries, subtotal, discount, total, count } = useMemo(() => cartBreakdown(cart), [cart])

  const handleSubmit = () => {
    const finalName = name.trim() || '橘子小屋'
    setHouseName(finalName)
    saveHouseName(finalName)
    onNavigate('delivery', { address })
  }

  return (
    <div className="shop-page">
      <header className="topbar compact">
        <button className="icon-button menu-button" aria-label="返回" onClick={onBack}>
          <ArrowLeft size={25} strokeWidth={1.4} />
        </button>
        <span className="topbar-title serif">虚拟下单</span>
        <div className="icon-button" aria-hidden="true" />
      </header>

      <section className="simple-hero compact" aria-label="下单">
        <p className="eyebrow">ALMOST THERE</p>
        <h1>给今天的小屋<br />取个名字</h1>
        <p className="simple-hero-sub">不需要真实地址，这里是你的云端小角落。</p>
      </section>

      <section className={`checkout-form ${entries.length > 0 ? 'has-order' : ''}`} aria-label="虚拟地址">
        <div className="form-group">
          <label htmlFor="house-name">
            <Home size={16} strokeWidth={1.5} />
            虚拟小屋名称
          </label>
          <input
            id="house-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="橘子小屋"
            maxLength={12}
          />
          <p className="form-hint">只有你能看见，可以随便取。</p>
        </div>

        <div className="form-group read-only">
          <label>
            <MapPin size={16} strokeWidth={1.5} />
            配送地址
          </label>
          <div className="decor-address">{address}</div>
          <p className="form-hint">装饰性地址，无需真实信息。</p>
        </div>

        <div className="checkout-note">
          <Sparkles size={18} strokeWidth={1.35} />
          {/* 全产品唯一一次向用户揭晓真相的地方 —— 这句话决定了「这是什么」。
              旧版后半句写的是「你只是完整地经历了『挑选的快乐』」，那是**别人也有、
              而且最没壁垒**的卖点（假购物车谁都能做），等于在最贵的一句话里把自己说小了。
              现在前半句照旧（诚实：不扣款、不送来），后半句改成这一单真正发生的事：
              你要真的等它，而等待会换来一张写在纸上的凭证（2026-09-19 用户点的那条）。 */}
          <p>
            这是一份虚拟订单 —— 不会扣款，也不会有任何东西送来。
            但接下来那几分钟是真的：你要真的等它。等满了，你会拿到一张凭证，上面记着这一单换来的猫粮。
          </p>
        </div>
      </section>

      {/* 这一单到底有什么 —— 从购物袋带过来的明细与金额，别让人在最后一步看不见 */}
      {entries.length > 0 && (
        <section className="checkout-order" aria-label="这一单">
          <div className="section-rule"><span /></div>
          <h2 className="section-title">这一单 <em>{String(count).padStart(2, '0')}</em></h2>

          <ul className="co-lines">
            {entries.map(({ item, qty }) => (
              <li key={item.id}>
                <span className="co-name">
                  {item.cn}
                  {qty > 1 && <small>×{qty}</small>}
                  {item.rescue && <span className="co-tag">惜食柜</span>}
                </span>
                <span className="co-price">
                  ¥{item.price * qty}
                  {item.rescue && <s className="co-was">¥{item.originalPrice * qty}</s>}
                </span>
              </li>
            ))}
          </ul>

          <div className="co-sum">
            <div className="summary-row"><span>小计</span><span>¥{subtotal}</span></div>
            {discount > 0 && <div className="summary-row discount"><span>优惠</span><span>-¥{discount}</span></div>}
            <div className="summary-row total"><span>合计</span><span>¥{total}</span></div>
          </div>
        </section>
      )}

      <div className="bottom-bar">
        <div className="bottom-total">
          <span className="bottom-label">{count} 件商品</span>
          <span key={total} className="bottom-price num-bump">合计 ¥{total}</span>
        </div>
        <button className="primary-button" onClick={handleSubmit}>
          确认下单
        </button>
      </div>
    </div>
  )
}
