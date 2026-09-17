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
      <div className="rh-head">
        <span className="rh-badge"><Bike size={13} strokeWidth={1.7} />帮他看路</span>
        <span className="rh-hint">{hops > 0 ? `你提醒了他 ${hops} 次` : '路上有状况，点一下提个醒'}</span>
      </div>

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
            <i />
            <em>{it.kind.label}</em>
          </span>
        ))}
        <span
          className={`rh-rider${isHop ? ' is-hop' : ''}`}
          ref={riderRef}
          aria-hidden="true"
        >
          <Bike size={18} strokeWidth={1.8} />
        </span>
      </button>

      {/* is-real 只给「真的发生了点什么」时用 —— 验收靠它区分结果和占位文案
          （探针别去匹配文案内容：占位句里也有「跳过去」三个字，会自己骗自己） */}
      <p className={`rh-line${line ? ' is-real' : ''}`} role="status">
        {line || '点一下，他跳过去 —— 不点也没事，他照样到。'}
      </p>
      <p className="rh-foot">不计分，也不会输。撞上了就是溅一裤腿水而已。</p>
    </section>
  )
}
