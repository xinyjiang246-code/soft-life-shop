import { useCallback, useEffect, useRef, useState } from 'react'
import { Bike } from 'lucide-react'

/**
 * RiderHop —— 陪等方式「帮他看路」
 *
 * 这是用户说的 C（真跑酷）落在我们这边的样子：
 *   **有手感**（障碍过来，点一下他跳过去），但
 *   **没有计分、没有失败、没有倒计时、不会 game over**。
 *   撞上了也不罚 —— 只是溅一裤腿水，他自己先笑。
 *
 * 为什么不用 canvas / rAF 逐帧 setState：
 *   位移交给 CSS 动画（最顺），JS 只在 rAF 里读两边的位置做一次「有没有碰上」的判断。
 *   这样每帧不做 React 渲染，低端机也不掉帧。
 */

const OBSTACLES = [
  { type: 'puddle', label: '一滩水', dodge: '他跳过去了，水花都没溅起来。', hit: '溅了一裤腿水 —— 他自己先笑了。' },
  { type: 'cat', label: '一只猫', dodge: '他轻轻捏了刹车，猫慢悠悠走开。', hit: '猫被吓了一跳，回头瞪了他一眼。' },
  { type: 'cone', label: '一个路障', dodge: '车把一歪，稳稳绕过去了。', hit: '车筐磕了一下，他「嘶」了一声。' },
  { type: 'leaf', label: '一堆落叶', dodge: '从叶子上压过去，沙沙响。', hit: '压了一脚叶子，全粘在轮胎上了。' },
]

const HOP_MS = 560     // 跳起来的滞空时间
const SPAWN_MS = 2100  // 出状况的间隔
const SLIDE_MS = 4200  // 从右边滑到左边的时间

/**
 * 四个路况各自画出来。
 *
 * 第一版是「24×9 的圆角色块 + 头顶一行文字标签（一滩水 / 一只猫…）」——
 * 看起来像调试用的占位（用户 2026-09-18：视觉糙）。
 * 现在文字标签去掉：图形自己说话，是什么东西在「结果行」里讲（rh-line）。
 */
function Obstacle({ type }) {
  // 画在 30×24 的坐标系里，显示放大到 40×32（等比）—— 30×24 在 260px 宽的车道里太小了
  const box = { viewBox: '0 0 30 24', width: 40, height: 32, 'aria-hidden': true }

  if (type === 'puddle') {
    return (
      <svg {...box}>
        <ellipse cx="15" cy="15" rx="13" ry="5.6" fill="#a6c6da" />
        <ellipse cx="15" cy="13.6" rx="13" ry="5.6" fill="#d2e6f1" />
        <path d="M8 13.4c2-1.5 4.4-1.5 6.4 0M17 15.6c1.6-1.1 3.4-1.1 5 0"
          fill="none" stroke="#8db1c8" strokeWidth="1" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'cat') {
    return (
      <svg {...box}>
        <path d="M19 12.6c2.8-.4 3.6-3 2.3-4.8" fill="none" stroke="#cdb99e" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M9.4 22.4c-1.5-4.8.4-9.8 5.6-9.8s7.1 5 5.6 9.8z" fill="#ded0b9" />
        <path d="M10.4 6.8L9 2l3.9 2.6z" fill="#e9dfcc" />
        <path d="M19.6 6.8L21 2l-3.9 2.6z" fill="#e9dfcc" />
        <circle cx="15" cy="8.8" r="5" fill="#e9dfcc" />
        <circle cx="13.1" cy="8.6" r=".75" fill="#7a6a55" />
        <circle cx="16.9" cy="8.6" r=".75" fill="#7a6a55" />
      </svg>
    )
  }

  if (type === 'cone') {
    return (
      <svg {...box}>
        <rect x="3" y="20.6" width="24" height="3" rx="1.4" fill="#c9803a" />
        <path d="M15 2.2l7.8 18.4H7.2z" fill="#e0913f" />
        <path d="M10.4 12.8h9.2l1.6 3.6H8.8z" fill="#f8f2e7" />
      </svg>
    )
  }

  // 落叶
  return (
    <svg {...box}>
      <path d="M4.4 17.8c-2-3.5.3-7.8 4.6-8.8 3.9-.9 6.6 1.8 6 5.1-.6 2.9-3.5 4.7-6.4 4.5z" fill="#c2cc92" />
      <path d="M6.6 16.8l5.4-4.7" fill="none" stroke="#a8b478" strokeWidth=".9" strokeLinecap="round" />
      <path d="M18.4 20.8c-1.4-2.5.3-5.5 3.2-6.2 2.7-.6 4.6 1.2 4.2 3.5-.4 2-2.3 3.2-4.2 3.2z" fill="#d6dcae" />
      <path d="M20.4 19.8l3.4-2.9" fill="none" stroke="#bcc48c" strokeWidth=".9" strokeLinecap="round" />
    </svg>
  )
}

export default function RiderHop({ active = true }) {
  const [items, setItems] = useState([])
  const [line, setLine] = useState(null)
  const [hops, setHops] = useState(0)
  const [isHop, setIsHop] = useState(false) // 只是给 CSS 看的（ref 才是碰撞判断读的那个）
  const laneRef = useRef(null)
  const riderRef = useRef(null)
  const hoppingRef = useRef(false)
  const nodeRefs = useRef(new Map())
  const seq = useRef(0)
  const rnd = useRef(0)

  // 出状况：稳定间隔，不随机（同一段路上节奏一致，也方便验收断言）
  useEffect(() => {
    if (!active) return
    const spawn = () => {
      const kind = OBSTACLES[rnd.current % OBSTACLES.length]
      rnd.current += 1
      const id = ++seq.current
      setItems((prev) => [...prev.slice(-2), { id, kind }])
    }
    spawn()
    const t = setInterval(spawn, SPAWN_MS)
    return () => clearInterval(t)
  }, [active])

  // 每帧只看一件事：它撞上骑手了吗？
  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      const rider = riderRef.current?.getBoundingClientRect()
      if (rider) {
        for (const it of items) {
          const node = nodeRefs.current.get(it.id)
          if (!node) continue
          const r = node.getBoundingClientRect()
          const overlap = r.left <= rider.right - 4 && r.right >= rider.left + 4
          if (overlap) {
            setLine(hoppingRef.current ? it.kind.dodge : it.kind.hit)
            setItems((prev) => prev.filter((x) => x.id !== it.id))
            nodeRefs.current.delete(it.id)
          } else if (r.right < rider.left - 20) {
            // 已经过去了（没碰上就不必报 —— 不刷屏）
            setItems((prev) => prev.filter((x) => x.id !== it.id))
            nodeRefs.current.delete(it.id)
          }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active, items])

  const hop = useCallback(() => {
    if (hoppingRef.current) return
    hoppingRef.current = true
    setIsHop(true)
    setHops((n) => n + 1)
    setTimeout(() => { hoppingRef.current = false; setIsHop(false) }, HOP_MS)
  }, [])

  return (
    <section className="rider-hop" aria-label="帮他看路">
      <button
        className="rh-lane"
        onClick={hop}
        aria-label="跳一下"
        ref={laneRef}
      >
        <span className="rh-road" aria-hidden="true" />
        {items.map((it) => (
          <span
            key={it.id}
            ref={(n) => { if (n) nodeRefs.current.set(it.id, n); else nodeRefs.current.delete(it.id) }}
            className={`rh-item is-${it.kind.type}`}
            style={{ animationDuration: `${SLIDE_MS}ms` }}
            aria-hidden="true"
          >
            <Obstacle type={it.kind.type} />
          </span>
        ))}
        <span
          className={`rh-rider${isHop ? ' is-hop' : ''}`}
          ref={riderRef}
          aria-hidden="true"
        >
          <Bike size={22} strokeWidth={1.8} />
        </span>
      </button>

      {/* is-real 只给「真的发生了点什么」时用 —— 验收靠它区分结果和占位文案
          （探针别去匹配文案内容：占位句里也有「跳过去」三个字，会自己骗自己） */}
      <p className={`rh-line${line ? ' is-real' : ''}`} role="status">
        {line || '点一下，他跳过去 —— 不点也没事，他照样到。'}
      </p>
      <p className="rh-foot">
        {hops > 0 && <span className="rh-tally">你提醒了他 {hops} 次 · </span>}
        不计分，也不会输。撞上了就是溅一裤腿水而已。
      </p>
    </section>
  )
}
