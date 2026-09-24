import { useEffect, useRef, useState } from 'react'
import { Check, Delete, Lock, X } from 'lucide-react'

/**
 * PaymentSheet —— 模拟支付的底部面板（含输密码）
 *
 * 完整还原真 App 的支付仪式：选支付方式 → 输 6 位支付密码 → 确认动画 → 成功。
 * **全程模拟**：密码是随便按的 6 位（界面上也这么写），不接任何支付 SDK，
 * 不动真钱 —— 面板底部一直是那句实话：钱一直在你手上。
 *
 * 记住上次选的支付方式；选择结果经 localStorage 流向订单历史。
 */

const METHODS = [
  { id: 'alipay', name: '支付宝', hint: '推荐，秒到账', color: '#1677FF', glyph: '支' },
  { id: 'wechat', name: '微信支付', hint: '使用零钱或银行卡', color: '#07C160', glyph: '微' },
  { id: 'shop', name: '小铺零钱', hint: '这一单记在账上，慢慢还', color: '#9F7F5F', glyph: '零' },
]

const KEY_LAST = 'soft-life-last-pay'
const buzz = (ms = 10) => { try { navigator.vibrate?.(ms) } catch { /* 忽略 */ } }

export default function PaymentSheet({ total, onClose, onDone }) {
  const [method, setMethod] = useState(() => {
    try { return localStorage.getItem(KEY_LAST) || 'alipay' } catch { return 'alipay' }
  })
  // pick（选方式）→ pin（输密码）→ paying → done
  const [stage, setStage] = useState('pick')
  const [pin, setPin] = useState('')
  const timer = useRef(null)
  const methodName = METHODS.find((m) => m.id === method)?.name || '支付宝'

  useEffect(() => () => clearTimeout(timer.current), [])

  const toPin = () => {
    buzz(8)
    try { localStorage.setItem(KEY_LAST, method) } catch {}
    setStage('pin')
  }

  const pressDigit = (d) => {
    if (pin.length >= 6) return
    buzz(5)
    const next = pin + d
    setPin(next)
    // 输满 6 位 → 自动去确认（模拟：任何 6 位都通过）
    if (next.length === 6) {
      timer.current = setTimeout(() => {
        setStage('paying')
        timer.current = setTimeout(() => {
          setStage('done')
          buzz(16)
          timer.current = setTimeout(() => onDone?.(method), 1000)
        }, 900)
      }, 220)
    }
  }

  const backspace = () => { buzz(5); setPin((p) => p.slice(0, -1)) }

  return (
    <div className="pay-backdrop" role="dialog" aria-modal="true" aria-label="支付" onClick={stage === 'pick' ? onClose : undefined}>
      <div className="pay-sheet" onClick={(e) => e.stopPropagation()}>
        {stage === 'pick' && (
          <>
            <div className="pay-head">
              <span className="pay-title">选择支付方式</span>
              <button type="button" className="pay-close" aria-label="关闭" onClick={onClose}><X size={16} strokeWidth={2} /></button>
            </div>
            <p className="pay-amount">¥{total}<small>合计</small></p>
            <ul className="pay-methods">
              {METHODS.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`pay-method ${method === m.id ? 'is-on' : ''}`}
                    onClick={() => { setMethod(m.id); buzz(5) }}
                    aria-pressed={method === m.id}
                  >
                    <span className="pay-m-icon" style={{ background: m.color }}>{m.glyph}</span>
                    <span className="pay-m-copy"><b>{m.name}</b><small>{m.hint}</small></span>
                    <span className="pay-m-radio" aria-hidden="true">{method === m.id && <Check size={13} strokeWidth={3} />}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="pay-confirm" onClick={toPin}>
              确认支付 ¥{total}
            </button>
            <p className="pay-honest"><Lock size={11} strokeWidth={1.8} aria-hidden="true" />全程模拟，不会真的扣款 —— 钱一直在你手上。</p>
          </>
        )}

        {stage === 'pin' && (
          <div className="pay-pin">
            <div className="pay-head dark">
              <button type="button" className="pay-close" aria-label="返回" onClick={() => { setStage('pick'); setPin('') }}><X size={16} strokeWidth={2} /></button>
              <span className="pay-title">请输入支付密码</span>
              <span className="pay-close ghost" aria-hidden="true" />
            </div>
            <p className="pay-pin-amount">¥{total}<small>{methodName}</small></p>
            <div className="pay-dots" role="status" aria-label={`已输入 ${pin.length} 位`}>
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} className={i < pin.length ? 'is-filled' : ''} />
              ))}
            </div>
            <p className="pay-pin-hint">模拟密码 —— 随便按 6 位就能过</p>
            <div className="pay-pad" aria-label="数字键盘">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0'].map((d, i) =>
                d ? (
                  <button key={i} type="button" className="pay-key" onClick={() => pressDigit(d)}>{d}</button>
                ) : (
                  <span key={i} className="pay-key blank" aria-hidden="true" />
                )
              )}
              <button type="button" className="pay-key" onClick={backspace} aria-label="删除一位"><Delete size={19} strokeWidth={1.6} /></button>
            </div>
          </div>
        )}

        {stage === 'paying' && (
          <div className="pay-stage" role="status">
            <i className="pay-spinner" aria-hidden="true" />
            <p>正在与{methodName}确认…</p>
            <small>（其实什么都不会发生）</small>
          </div>
        )}

        {stage === 'done' && (
          <div className="pay-stage" role="status">
            <i className="pay-ok" aria-hidden="true"><Check size={34} strokeWidth={2.6} /></i>
            <p>支付成功 ¥{total}</p>
            <small>模拟支付 · 已选择「{methodName}」</small>
          </div>
        )}
      </div>
    </div>
  )
}
