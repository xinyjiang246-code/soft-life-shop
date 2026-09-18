import { useState } from 'react'

/**
 * FoldRitual —— 陪等方式「先下线」
 *
 * 这是三种里唯一**故意让自己结束**的一种：
 *   折三步 → 折好 → 然后 App 主动说「行了，把手机放下」。
 * 它不占用你等的那两分钟，它**还给你**那两分钟。
 *
 * 同样不计分：没有「折得快」这种说法，折完也没有奖励 ——
 * 唯一的产出是一句「等下给他装汤，不容易洒」。
 *
 * 2026-09-18 重做（用户：「这 3 个互动不行」）：
 *   ① 第一版的「折纸」其实是**按三下按钮**，纸一动不动，按完直接跳出一个静态盒子 ——
 *      叫「折」却没有折的动作。现在真的折：一张纸分左右两片，右片绕中缝翻过去（左右对折），
 *      整张再绕顶边翻一次（上下对折），第三次才撑开成盒。
 *   ② 盒子重画了。第一版是「梯形 + 两条线 + 两个朝上的三角」，从上面看像两个尖角，
 *      不像盒子。现在按斜上方视角画一个**开口的方盒**：能看到盒口内侧，左右两面壁。
 */

const STEPS = [
  { key: 'one', label: '把纸对折', done: '对折好了。四个角对齐了吗？' },
  { key: 'two', label: '再对折一次', done: '厚了一点 —— 边压平。' },
  { key: 'three', label: '撑开成盒', done: '成了。一个能站住的小盒子。' },
]

/** 斜上方视角的开口方盒：盒口菱形 + 左右两面壁 */
function PaperBox() {
  return (
    <svg viewBox="0 0 120 100" className="fold-box" aria-hidden="true">
      <path d="M16 32 L60 12 L104 32 L60 52 Z" fill="#e6d4bb" />
      <path d="M16 32 L60 12 L104 32" fill="none" stroke="#b08f6a" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M16 32 L60 52 L60 86 L16 66 Z" fill="#f8eedf" stroke="#b08f6a" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M60 52 L104 32 L104 66 L60 86 Z" fill="#eee0c9" stroke="#b08f6a" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

/** 折纸舞台：纸真的在折，不是按钮文字变一下 */
function FoldStage({ step }) {
  const done = step >= STEPS.length
  const foldedX = step >= 1
  const foldedY = step >= 2

  return (
    <div className={`fold-stage${done ? ' is-done' : ''}`} aria-hidden="true">
      <div className={`fp-wrap${foldedY ? ' is-y' : ''}`}>
        <div className={`fp-sheet${foldedX ? ' is-x' : ''}`}>
          <span className="fp-l" />
          <span className="fp-r" />
          {/* 还没折的那道折痕留一条虚线 —— 否则「折」看不出发生了什么。
              竖折痕由 .fp-r 的左边框承担（折过之后变实线）。 */}
          <span className="fp-crease-h" />
        </div>
      </div>
      <div className={`fold-boxwrap${done ? ' is-on' : ''}`}>
        <PaperBox />
      </div>
    </div>
  )
}

export default function FoldRitual() {
  const [step, setStep] = useState(0)
  const done = step >= STEPS.length

  return (
    <section className="fold-ritual" aria-label="先下线">
      <FoldStage step={step} />

      <ol className="fold-progress" aria-hidden="true">
        {STEPS.map((s, i) => (
          <li key={s.key} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} />
        ))}
      </ol>

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
