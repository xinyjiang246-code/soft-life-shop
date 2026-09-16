import { Bike } from 'lucide-react'

/**
 * RiderWindow —— 等待页的「骑手骑到哪了」
 *
 * 为什么这里不是小游戏（2026-09-16 和用户定的口径）：
 *   这个 App 的整个立意是劝人慢下来、少看屏幕。再塞一个消磨时间的游戏，
 *   等于自己拆自己的台。所以这一块**没有任何操作** ——
 *   不能点、不能跳、不计分、不会输。
 *
 * 它只是一扇窗：画面里骑手的位置**就是真实的配送进度**。
 * 你不看它，它也照样在走 —— 这正是它想说的那件事。
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

export default function RiderWindow({ progress = 0, secondsLeft = 0, totalSeconds = 120 }) {
  const p = Math.min(1, Math.max(0, progress))
  const passed = LANDMARKS.filter((l) => p >= l.at)
  const current = passed[passed.length - 1]
  const elapsed = Math.max(0, Math.floor((totalSeconds - secondsLeft) / 60))
  const remain = Math.max(0, Math.ceil(secondsLeft / 60))

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
      <p className="rw-note">不用一直盯着看 —— 骑手到了会敲门。这里只是告诉你他骑到哪了。</p>
    </section>
  )
}
