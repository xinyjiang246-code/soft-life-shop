import { useState } from 'react'
import { Scissors } from 'lucide-react'

/**
 * FoldRitual —— 陪等方式「先下线」
 *
 * 这是三种里唯一**故意让自己结束**的一种：
 *   折三步 → 折好 → 然后 App 主动说「行了，把手机放下」。
 * 它不占用你等的那两分钟，它**还给你**那两分钟。
 *
 * 同样不计分：没有「折得快」这种说法，折完也没有奖励 ——
 * 唯一的产出是一句「等下给他装汤，不容易洒」。
 */

const STEPS = [
  { key: 'one', label: '把纸对折', done: '对折好了。四个角对齐了吗？' },
  { key: 'two', label: '再对折一次', done: '厚了一点 —— 边压平。' },
  { key: 'three', label: '撑开成盒', done: '成了。一个能站住的小盒子。' },
]

function PaperBox() {
  // 一个折好的小纸盒：正面梯形 + 侧面 + 打开的两个耳朵
  return (
    <svg viewBox="0 0 120 96" className="fold-box" aria-hidden="true">
      <path d="M22 40 L98 40 L86 84 L34 84 Z" fill="#f3e6d4" stroke="#9f7f5f" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M22 40 L60 52 L98 40" fill="none" stroke="#9f7f5f" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M60 52 L60 84" fill="none" stroke="#c9a882" strokeWidth="1.3" />
      <path d="M34 40 L28 22 L52 30 Z" fill="#f7ede0" stroke="#9f7f5f" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M86 40 L92 22 L68 30 Z" fill="#f7ede0" stroke="#9f7f5f" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export default function FoldRitual() {
  const [step, setStep] = useState(0)
  const done = step >= STEPS.length

  return (
    <section className="fold-ritual" aria-label="先下线">
      <div className="fold-head">
        <span className="fold-badge"><Scissors size={13} strokeWidth={1.7} />先下线</span>
        <span className="fold-hint">{done ? '折好了' : `第 ${step + 1} / ${STEPS.length} 步`}</span>
      </div>

      {!done ? (
        <div className="fold-doing">
          <p className="fold-say">{step === 0 ? '趁他还没到，折个装汤的小盒子吧。' : STEPS[step - 1].done}</p>
          <button className="fold-step" onClick={() => setStep((s) => s + 1)}>
            {STEPS[step].label}
          </button>
          <p className="fold-foot">折完就把手机放下 —— 不折也行。</p>
        </div>
      ) : (
        <div className="fold-done">
          <PaperBox />
          <p className="fold-done-title">一个能站住的小盒子</p>
          <p className="fold-done-body">
            等他到了给他装汤，不容易洒。他会愣一下，说「还挺讲究」。
          </p>
          <p className="fold-done-go">现在把手机放下 —— 去倒杯水，或者就坐着发会儿呆。<br />他到了会敲门。</p>
        </div>
      )}
    </section>
  )
}
