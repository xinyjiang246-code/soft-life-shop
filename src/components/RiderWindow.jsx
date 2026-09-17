import { Bike, Hand } from 'lucide-react'
import { RIDER_MOMENTS } from '../data.js'

/**
 * RiderWindow —— 等待页的「骑手骑到哪了」
 *
 * 2026-09-16：这里原本是另一个 agent 做的骑手小跑酷（接饼干 / 计米数 / 计分）。
 *   用户拍板「改造后保留」→ 去掉游戏性，留一扇只看不玩的窗。
 * 2026-09-17：用户重提「骑手小游戏你也没做」，并选了 **B 陪骑手走**（C 真跑酷也认）。
 *   所以现在它从「只读」升级成「能搭把手」—— 路上遇事你可以替他选一下，
 *   但守住三条（写死在 RIDER_MOMENTS 的注释里）：
 *     ① 不计分、不会输、没有倒计时
 *     ② 不理他也完全可以 —— 他照样到，不扣任何东西
 *     ③ 一次只等一件事，答完就走，不刷屏
 *   它依然不是「让你盯着屏幕玩」的东西，是「有人在路上，你也算在场」。
 *
 * 画面语言：
 *   · 一条从「小铺」到「你家楼下」的路
 *   · 骑手站在路上 = progress（0 → 1），位置由真实数据驱动，不由本地计时器自增
 *   · 沿途地标按进度依次亮起，过了哪一段，下面就说哪一段
 */

const LANDMARKS = [
  { at: 0.06, emoji: '🏪', text: '刚出小铺，路过巷口那家便利店' },
  { at: 0.20, emoji: '🌳', text: '行道树的影子，一段一段地过去' },
  { at: 0.34, emoji: '🚏', text: '在公交站台前等了个红灯' },
  { at: 0.48, emoji: '🌉', text: '过桥了，风比刚才大一点' },
  { at: 0.62, emoji: '🏢', text: '穿过写字楼那一段，玻璃反着光' },
  { at: 0.74, emoji: '🐈', text: '路边一只猫看了他一眼，没动' },
  { at: 0.88, emoji: '🏮', text: '拐进你那条街了' },
  { at: 0.97, emoji: '🔔', text: '停了车，在按门铃' },
]

export default function RiderWindow({
  progress = 0,
  secondsLeft = 0,
  totalSeconds = 120,
  choices = {},
  onChoose,
  mode = 'walk',
}) {
  const p = Math.min(1, Math.max(0, progress))
  const passed = LANDMARKS.filter((l) => p >= l.at)
  const current = passed[passed.length - 1]
  const elapsed = Math.max(0, Math.floor((totalSeconds - secondsLeft) / 60))
  const remain = Math.max(0, Math.ceil(secondsLeft / 60))

  // 路上一件件事：只处理「已经骑到的」那些，取**最新一个还没答的**
  // （取最新而不是最早 —— 骑手已经骑过那个水坑了，再问一遍很怪）
  // 「路上遇事」只属于「陪他走」这一种陪法等 —— 换了方式这里就不打扰
  const showMoments = mode === 'walk'
  const reached = showMoments ? RIDER_MOMENTS.filter((m) => p >= m.at) : []
  const pending = [...reached].reverse().find((m) => !choices[m.key]) || null
  const answered = RIDER_MOMENTS.filter((m) => choices[m.key])
  const lastAnswered = answered[answered.length - 1]
  const helped = answered.length

  return (
    <section className="rider-window" aria-label="骑手骑到哪了">
      <div className="rw-head">
        <span className="rw-badge"><Bike size={13} strokeWidth={1.7} />骑手骑到哪了</span>
        <span className="rw-time">已骑 {elapsed} 分 · 还有约 {remain} 分</span>
      </div>

      <div className="rw-track" aria-hidden="true">
        <div className="rw-line" />
        <div className="rw-line-fill" style={{ width: `${p * 100}%` }} />
        {LANDMARKS.map((l) => (
          <span
            key={l.at}
            className={`rw-land ${p >= l.at ? 'is-passed' : ''}`}
            style={{ left: `${l.at * 100}%` }}
          >
            {l.emoji}
          </span>
        ))}
        <span className="rw-rider" style={{ left: `${p * 100}%` }}>
          <Bike size={17} strokeWidth={1.8} />
        </span>
      </div>

      <div className="rw-ends" aria-hidden="true">
        <span>🏪 小铺</span>
        <span>你家楼下 🏠</span>
      </div>

      <p className="rw-msg" role="status">
        {current ? current.text : '刚接上单，正在往你这边骑'}
      </p>

      {/* 陪骑手走：一次只等一件事。不答也没关系 —— 他照样到，什么都不扣 */}
      {pending ? (
        <div className="rw-moment" role="group" aria-label="陪骑手走">
          <p className="rw-moment-ask">
            <Hand size={12} strokeWidth={1.7} aria-hidden="true" />
            {pending.ask}
          </p>
          <p className="rw-moment-hint">{pending.hint}</p>
          <div className="rw-moment-options">
            {pending.options.map((opt) => (
              <button
                key={opt.key}
                className="rw-moment-opt"
                onClick={() => onChoose?.(pending.key, opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="rw-moment-foot">不理他也行 —— 他照样到，什么都不扣。</p>
        </div>
      ) : showMoments && lastAnswered ? (
        <p className="rw-reply" role="status">
          <i aria-hidden="true">{lastAnswered.ask}</i>
          {lastAnswered.replies[choices[lastAnswered.key]]}
        </p>
      ) : null}

      <p className="rw-note">
        {showMoments && helped > 0
          ? `路上你搭了 ${helped} 次手 —— 他会记着，虽然不知道是你。`
          : '不用一直盯着看 —— 骑手到了会敲门。这里只是告诉你他骑到哪了。'}
      </p>
    </section>
  )
}
