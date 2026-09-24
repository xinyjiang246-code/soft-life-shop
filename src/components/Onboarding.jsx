import { useState } from 'react'
import { BookOpen, Bike, PawPrint, UtensilsCrossed } from 'lucide-react'

/**
 * Onboarding —— 第一次打开的三屏引导
 *
 * 只回答新用户心里的三个问题：
 *   ① 这是什么？（虚拟的，不浪费）
 *   ② 怎么玩？（挑 → 等 → 记）
 *   ③ 然后呢？（省下的钱可以按克捐猫粮）
 * 任何时候都能跳过；看完一次就再也不弹（localStorage 记账）。
 * 风格：Paper Press（墨线卡 + 硬阴影 + mono 数据行 + 印章数字）。
 */

const KEY = 'soft-life-onboarded-v1'

const STEPS = [
  {
    tag: 'WELCOME · 先说清楚',
    title: '这里点的外卖，\n不会真的送来。',
    body: '挑、下单、等它送到 —— 这些都是真的；只有食物不会真的被做出来、被浪费。那笔钱，一直都在你手里。',
    mono: '0 CALORIES * 0 WASTE * 0 GUILT',
    Icon: UtensilsCrossed,
  },
  {
    tag: 'HOW IT WORKS · 怎么玩',
    title: '三步，\n逛完一圈。',
    rows: [
      { Icon: UtensilsCrossed, b: '挑一份想要的', s: '6 家虚拟小店，开在你家附近' },
      { Icon: Bike, b: '慢慢等它送到', s: '等多久自己说了算 —— 可以陪骑手走一段' },
      { Icon: BookOpen, b: '记进手账、喂软软', s: '每一单都会变成一枚邮票，它也长大一点' },
    ],
  },
  {
    tag: 'ONE MORE THING · 顺便说',
    title: '省下的那笔钱，\n可以变成猫粮。',
    body: '每一单结束，你可以选择按克捐一点猫粮。账就记在这台设备上 —— 我们只是把它记下来，真假由你判断。',
    Icon: PawPrint,
  },
]

const buzz = (ms = 10) => { try { navigator.vibrate?.(ms) } catch { /* 忽略 */ } }

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0)
  const s = STEPS[step]
  const last = step === STEPS.length - 1

  const finish = () => {
    try { localStorage.setItem(KEY, '1') } catch { /* 忽略 */ }
    buzz(14)
    onDone?.()
  }
  const next = () => { buzz(8); last ? finish() : setStep((v) => v + 1) }

  return (
    <div className="ob-backdrop" role="dialog" aria-modal="true" aria-label="新手引导">
      <div className="ob-card" key={step}>
        <span className="ob-no">{`0${step + 1}`}</span>
        <p className="ob-tag">{s.tag}</p>

        {s.title && <h2 className="ob-title">{s.title.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</h2>}
        {s.body && <p className="ob-body">{s.body}</p>}
        {s.rows && (
          <ul className="ob-rows">
            {s.rows.map(({ Icon, b, s: sub }, i) => (
              <li key={i}>
                <span className="ob-row-icon"><Icon size={16} strokeWidth={1.6} /></span>
                <div><b>{b}</b><small>{sub}</small></div>
              </li>
            ))}
          </ul>
        )}
        {s.mono && <p className="ob-mono">{s.mono}</p>}

        <div className="ob-dots" aria-hidden="true">
          {STEPS.map((_, i) => <i key={i} className={i === step ? 'is-on' : ''} />)}
        </div>
        <button type="button" className="ob-go" onClick={next}>
          {last ? '好，进来逛逛 →' : '接着讲 →'}
        </button>
        <button type="button" className="ob-skip" onClick={finish}>先随便逛逛</button>
      </div>
    </div>
  )
}
