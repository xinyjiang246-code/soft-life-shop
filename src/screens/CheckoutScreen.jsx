import { useMemo, useState } from 'react'
import { ArrowLeft, MapPin, Sparkles } from 'lucide-react'
import { cartBreakdown, counters } from '../data.js'
import { DAILY_PATIENCE, ensureAddresses, loadPatience, patienceLeft, saveAddresses, saveHouseName, savePatience } from '../storage.js'
import AddressPicker from '../components/AddressPicker.jsx'
import PaymentSheet from '../components/PaymentSheet.jsx'

export default function CheckoutScreen({ cart, houseName, setHouseName, onNavigate, onBack }) {
  // 地址卡（2026-09-22）：可编辑、可存多张、可切换 —— 数据与迁移见 storage.js，
  // 老的小屋名会自动变成第一张卡；收件人就是原来的 houseName，结局页「已送达「橘子小屋」」不受影响。
  const [addresses, setAddresses] = useState(() => ensureAddresses(houseName))
  const activeAddr = addresses.list.find((a) => a.id === addresses.activeId) || addresses.list[0] || null
  // 按下单前最后一步，得让人看清买了什么、多少钱 ——
  // 早先这页只剩「2 件商品」，从购物袋带过来的金额全丢了
  const { entries, subtotal, discount, total, count } = useMemo(() => cartBreakdown(cart), [cart])
  // 付款的代价（2026-09-22 用户定）：虚拟的钱不真扣，但要花真实的慢活额度 —— ¥10 = 1 分钟。
  const payCost = Math.max(1, Math.floor(total / 10))
  const [patienceLeftNow] = useState(() => patienceLeft(loadPatience()))

  const [payOpen, setPayOpen] = useState(false)

  // 确认下单 → 先走一遍真的支付仪式（选方式 → 输密码 → 成功），付完才进配送
  const handleSubmit = () => {
    const finalName = (activeAddr?.name || '').trim() || '橘子小屋'
    setHouseName(finalName)
    saveHouseName(finalName)
    setPayOpen(true)
  }

  const handlePaid = () => {
    // 付成功的这一刻才花额度：额度见底不拦下单（封底就好）——
    // 惩罚感会毁掉「不饿也想要」的仪式；代价的意义是让时间被真的花掉，不是把人挡在门外。
    const p = loadPatience()
    savePatience({ ...p, used: Math.min(DAILY_PATIENCE, (p.used || 0) + payCost) })
    setPayOpen(false)
    // 这一单的预计送达时长：按下单的店（购物袋里第一件的归属）取 —— 等待页的真实倒计时用它
    const baseEta = counters.find((c) => c.id === entries[0]?.item?.counterId)?.deliveryTime || 35
    onNavigate('delivery', { baseEta })
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
          <label>
            <MapPin size={16} strokeWidth={1.5} />
            配送地址
          </label>
          <AddressPicker
            value={addresses}
            onChange={(next) => { setAddresses(next); saveAddresses(next) }}
          />
          <p className="form-hint">装饰性地址，姓名电话都可以是编的 —— 无需真实信息。</p>
        </div>

        <div className="checkout-note">
          <Sparkles size={18} strokeWidth={1.35} />
          {/* 全产品唯一一次向用户揭晓真相的地方 —— 这句话决定了「这是什么」。
              旧版后半句写的是「你只是完整地经历了『挑选的快乐』」，那是**别人也有、
              而且最没壁垒**的卖点（假购物车谁都能做），等于在最贵的一句话里把自己说小了。
              现在前半句照旧（诚实：不扣款、不送来），后半句改成这一单真正发生的事：
              你要真的等它，而等待会换来一张写在纸上的凭证（2026-09-19 用户点的那条）。
              2026-09-22 追加付款的代价：花的是慢活额度，不是钱 —— 时间这个「真」要一直说到底。 */}
          <p>
            这是一份虚拟订单 —— 不会扣款，也不会有任何东西送来。
            但接下来那几分钟是真的：你要真的等它。等满了，你会拿到一张凭证，上面记着这一单换来的猫粮。
            付款也不扣真钱，但要花掉 {payCost} 分钟慢活额度 —— 时间是真的。
          </p>
        </div>
      </section>

      {/* 这一单到底有什么 —— 从购物袋带过来的明细与金额，别让人在最后一步看不见 */}
      {entries.length > 0 && (
        <section className="checkout-order" aria-label="这一单">
          <div className="section-rule"><span /></div>
          {/* 这里的数字是**件数**，不是订单号 —— 原来写成补零的「02」，
              摆在紧邻「这一单」的位置会被读成编号。加单位、去掉补零。 */}
          <h2 className="section-title">这一单 <em>{count} 件</em></h2>

          <ul className="co-lines">
            {entries.map((entry) => {
              const { item, qty, specText, unitPrice } = entry
              return (
              <li key={entry.key}>
                <span className="co-name">
                  {item.cn}
                  {/* 规格跟着走 —— 结算前最后一眼能核对「去冰的到底点了没」 */}
                  {specText && <small>{specText}</small>}
                  {qty > 1 && <small>×{qty}</small>}
                  {item.rescue && <span className="co-tag">惜食柜</span>}
                </span>
                <span className="co-price">
                  ¥{unitPrice * qty}
                  {item.rescue && <s className="co-was">¥{item.originalPrice * qty}</s>}
                </span>
              </li>
              )
            })}
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

      {payOpen && <PaymentSheet total={total} onClose={() => setPayOpen(false)} onDone={handlePaid} />}
    </div>
  )
}
