import { useEffect, useRef, useState } from 'react'

/**
 * RiderHop —— 陪等方式「帮他看路」
 *
 * 2026-09-21 用户给的方向（原话）：
 *   「他不像我一开始想的，就是 Chrome 没网时候小鳄鱼跳的，我就想这样」
 * 所以这一版不换皮，按**小恐龙那套语言**重做，只要四条：
 *   ① **极简** —— 一条地平线，别的装饰全撤（云 / 远树 / 虚线马路 / 终点 🏠 / 天空渐变都删了）；
 *   ② **方块** —— 骑手与路况是硬边色块（无渐变、无圆角、无投影、无高光）；
 *   ③ **按住跳得更高** —— 小恐龙最关键的一条手感。原来是点一下只有固定高度，
 *      所以「点一下」和「按住」没区别，玩起来像按键触发动画、不像在玩。
 *   ④ **节奏更脆** —— 路况来得更频、滑过更快（原来 2.1s 一个、4.2s 飘过去，太像等）。
 *
 * **不学**它两样（这是红线，别顺手抄过来）：
 *   · 不计分、不会输、撞上了不罚 —— 撞上只是溅一裤腿水，他自己先笑；
 *   · 速度恒定，绝不越跑越快（不设目标、不做趋势、不催）。
 *
 * 为什么不用 canvas / rAF 逐帧 setState：
 *   横向位移交给 CSS 动画（最顺）；JS 每帧只做两件事 —— 算跳跃高度（写 CSS 变量，
 *   不进 React 渲染）和「有没有碰上」这一个判断。低帧率设备也不会掉帧。
 */

/* ── 四条路况（文案与命名保持不变）── */
const OBSTACLES = [
  { type: 'puddle', dodge: '他跳过去了，水花都没溅起来。', hit: '溅了一裤腿水 —— 他自己先笑了。' },
  { type: 'cat', dodge: '他轻轻捏了刹车，猫慢悠悠走开。', hit: '猫被吓了一跳，回头瞪了他一眼。' },
  { type: 'cone', dodge: '车把一歪，稳稳绕过去了。', hit: '车筐磕了一下，他「嘶」了一声。' },
  { type: 'leaf', dodge: '从叶子上压过去，沙沙响。', hit: '压了一脚叶子，全粘在轮胎上了。' },
]

/* ── 像素图：每行 12 格，'#' = 实心一格 ──
   行数直接决定它多高（× 每格 3px），也就是「要跳多高才过得去」，
   所以 CLEAR 是从这里算出来的，不另写一份常量（改了图不用记得改阈值）。 */
const PIXELS = {
  puddle: [
    '............',
    '...######...',
    '.##########.',
    '############',
  ],
  cat: [
    '.#.......#..',
    '.##.....##..',
    '.###...###..',
    '.#########..',
    '.#########..',
    '..#######...',
    '...#####....',
    '....###.....',
  ],
  cone: [
    '.....##.....',
    '....####....',
    '....####....',
    '...######...',
    '...######...',
    '..##....##..',
    '..########..',
    '..########..',
    '.##########.',
    '.##########.',
  ],
  leaf: [
    '.##.....##..',
    '.###...###..',
    '..##....##..',
    '...#...#....',
  ],
}

const PX = 3 // 每格 3px
const COLORS = { puddle: '#8FA8B8', cat: '#A98D6E', cone: '#C9803A', leaf: '#A8B478' }

/* 越过每样东西需要的离地高度 = 它自己的像素高度。
   短按一下顶点约 24px（过得了水洼 12 / 落叶 12），猫 24px 得**稍微按一下**，
   路障 30px 得**按住**才过 —— 这个梯度就是「按住跳更高」有意义的地方，
   别把 JUMP_V 调到一手就能全过（那样按住就没意义了）。 */
const CLEAR = Object.fromEntries(Object.entries(PIXELS).map(([k, rows]) => [k, rows.length * PX]))

const SLIDE_MS = 2600 // 从右边滑到左边（原来 4200，太飘）
const SPAWN_MS = 2000 // 出状况的间隔（原来 2100）
const G = 640         // 松手后的重力 px/s²
const HOLD_G = 200    // 按住不放时的重力 —— 小得多，这就是「跳得更高」
const JUMP_V = 175    // 起跳初速度 px/s
const MAX_Y = 42      // 最高离地（车道 104 高：22 底距 + 40 骑手 + 42 刚好到顶）

/* 把字符串矩阵画成一格一格的方块。横向连续的实心格会合成一条 rect，省节点。 */
function Pixel({ rows, px = PX, fill }) {
  const h = rows.length
  const w = rows[0].length
  const cells = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < w) {
      if (row[x] === '#') {
        let end = x
        while (end < w && row[end] === '#') end += 1
        cells.push(<rect key={`${y}:${x}`} x={x} y={y} width={end - x} height={1} />)
        x = end
      } else x += 1
    }
  })
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`} width={w * px} height={h * px}
      shapeRendering="crispEdges" aria-hidden="true" focusable="false"
      style={{ display: 'block' }}
    >
      <g fill={fill}>{cells}</g>
    </svg>
  )
}

/* 轮子：8×8 的空心环（像素画里的圆就是这样，别改成真圆 —— 一改成圆就不像小恐龙了）。
   ⚠️ 别改成实心块：实心轮会把视觉重量全压在下面，「人」就被吃掉了（试过，整团糊成一块）。 */
function wheel(ox, oy) {
  return [
    [ox + 2, oy, 4, 1],
    [ox + 1, oy + 1, 1, 1], [ox + 6, oy + 1, 1, 1],
    [ox, oy + 2, 1, 4], [ox + 7, oy + 2, 1, 4],
    [ox + 1, oy + 6, 1, 1], [ox + 6, oy + 6, 1, 1],
    [ox + 2, oy + 7, 4, 1],
  ]
}

/* 骑手：方块拼的「一个人骑在车上」，朝右。26×20 格 × 2px = 52×40。
   2026-09-21 重画 —— 上一版是「一堆方块叠在一起」，放大看不出是人骑车。这一版按**可读性**重排：
     · 头在最右上（前倾 = 比躯干右移一格），眼睛从底色里挖空；
     · 躯干是从头往下**每行左移一格**的斜块 —— 像素画里斜线就是这么表达的；
     · 手臂分两级伸到车把、前叉从车把垂直落到前轮心：**这两条把「人」和「车」连起来，
       少了它们人看着是飘在车上的**（上一版就缺这个，是「读不出来」的主因）；
     · 座管那条竖线同时又当腿用，2px 一格的情况下再加腿只会糊。
   ⚠️ 跳跃时不旋转：小恐龙跳起来也只是平移，转一下反而糊。 */
const RIDER = [
  [14, 0, 5, 5],                                // 头
  [13, 5, 5, 1], [12, 6, 5, 1], [11, 7, 5, 1],  // 躯干（每行左移一格 = 前倾）
  [10, 8, 5, 1], [9, 9, 5, 1],
  [8, 10, 5, 1],                                // 座垫
  [10, 11, 1, 4],                               // 座管（兼当腿）
  [10, 15, 10, 1],                              // 车架横梁
  [14, 7, 2, 1], [16, 7, 2, 1], [18, 8, 2, 1],  // 手臂（肩 → 手，两级台阶）
  [19, 7, 4, 1],                                // 车把
  [20, 8, 2, 4],                                // 前叉
  ...wheel(1, 12), ...wheel(17, 12),            // 后轮 / 前轮
]
const RIDER_EYE = [16, 2, 1, 1]

function PixelRider() {
  return (
    <svg
      viewBox="0 0 26 20" width={52} height={40}
      shapeRendering="crispEdges" aria-hidden="true" focusable="false"
      style={{ display: 'block' }}
    >
      <g fill="currentColor">
        {RIDER.map(([x, y, w, h]) => (
          <rect key={`${x}:${y}`} x={x} y={y} width={w} height={h} />
        ))}
      </g>
      {/* 眼睛从**底色变量**里挖出来，不是画一个白点 —— 车道按下时会换 --rh-paper，
          写死颜色的话眼珠会留在旧色上变成两个脏点。 */}
      <rect
        x={RIDER_EYE[0]} y={RIDER_EYE[1]}
        width={RIDER_EYE[2]} height={RIDER_EYE[3]}
        fill="var(--rh-paper)"
      />
    </svg>
  )
}

export default function RiderHop({ active = true }) {
  const [items, setItems] = useState([])
  const [line, setLine] = useState(null)
  const [hops, setHops] = useState(0)
  // 落地压扁 / 撞上趔趄：一次只放一个，key 变了动画就重放
  const [fx, setFx] = useState({ n: 0, kind: '' })

  const riderRef = useRef(null)
  const nodeRefs = useRef(new Map())
  const itemsRef = useRef([])
  const settled = useRef(new Set()) // 已经处理过的障碍 id（碰上 / 滑过去了）
  const jump = useRef({ y: 0, v: 0, holding: false, air: false })
  const handled = useRef(false) // 这次交互已经由 pointerdown 起跳了，click 别再补一次
  const seq = useRef(0)
  const rnd = useRef(0)

  useEffect(() => { itemsRef.current = items }, [items])

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

  const startJump = () => {
    const j = jump.current
    if (j.air) { j.holding = true; return } // 已经在空中：不重复起跳，但继续「按住」
    j.v = JUMP_V
    j.air = true
    j.holding = true
    setHops((n) => n + 1)
  }

  // 每帧：算跳跃高度 + 看有没有碰上
  useEffect(() => {
    if (!active) return
    let raf = 0
    let last = performance.now()
    const loop = (now) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(now - last, 50) / 1000
      last = now
      const j = jump.current

      // 跳跃：按住时重力更小 → 升得更久、跳得更高（小恐龙那条手感就在这一个三元里）
      j.v -= (j.holding && j.v > 0 ? HOLD_G : G) * dt
      j.y += j.v * dt
      if (j.y >= MAX_Y) { j.y = MAX_Y; if (j.v > 0) j.v = -20 }
      if (j.y <= 0) {
        if (j.air && j.v < -140) setFx((f) => ({ n: f.n + 1, kind: 'land' }))
        j.y = 0
        j.v = 0
        j.air = false
      }

      const el = riderRef.current
      if (!el) return
      el.style.setProperty('--rh-y', `${j.y.toFixed(1)}px`)

      const rider = el.getBoundingClientRect()
      for (const it of itemsRef.current) {
        if (settled.current.has(it.id)) continue
        const node = nodeRefs.current.get(it.id)
        if (!node) continue
        const r = node.getBoundingClientRect()
        const overlap = r.left <= rider.right - 6 && r.right >= rider.left + 6
        if (overlap) {
          // 过不过得去，只看这一帧他离地多高 —— 不看按了几次
          settled.current.add(it.id)
          if (j.y > CLEAR[it.kind.type]) setLine(it.kind.dodge)
          else { setLine(it.kind.hit); setFx((f) => ({ n: f.n + 1, kind: 'bump' })) }
        } else if (r.right < rider.left - 24) {
          // 已经滑过去了（没碰上就不必报 —— 不刷屏）
          settled.current.add(it.id)
          setItems((prev) => prev.filter((x) => x.id !== it.id))
          nodeRefs.current.delete(it.id)
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active])

  return (
    <section className="rider-hop" aria-label="帮他看路">
      <button
        type="button"
        className="rh-lane"
        aria-label="跳一下（按住不放，他会跳得更高）"
        onPointerDown={() => { handled.current = true; startJump() }}
        onPointerUp={() => { jump.current.holding = false }}
        onPointerLeave={() => { jump.current.holding = false }}
        onPointerCancel={() => { jump.current.holding = false }}
        // pointerdown 已经起跳了，同一次交互的 click 不补第二次；
        // 但**键盘 Enter/空格和程序化 .click() 没有 pointerdown**，得让它们照常起跳。
        onClick={() => { if (!handled.current) startJump(); handled.current = false }}
        onKeyDown={(e) => {
          if (e.key !== ' ' && e.key !== 'Enter') return
          e.preventDefault() // 不然空格会同时滚页面
          if (e.repeat) return
          handled.current = true
          startJump()
        }}
      >
        {/* 地面：线下面两行小石子，跟着速度滚（小恐龙地上就这几颗点） */}
        <span className="rh-road" aria-hidden="true" />
        {items.map((it) => (
          <span
            key={it.id}
            ref={(n) => { if (n) nodeRefs.current.set(it.id, n); else nodeRefs.current.delete(it.id) }}
            className={`rh-item is-${it.kind.type}`}
            style={{ animationDuration: `${SLIDE_MS}ms` }}
            aria-hidden="true"
          >
            <Pixel rows={PIXELS[it.kind.type]} fill={COLORS[it.kind.type]} />
          </span>
        ))}
        {/* ⚠️ 别在 .rh-rider 上挂 key —— 重新挂载会把它跳到一半的 --rh-y 一起清掉，
            撞上那一下他会瞬移回地面。动画放在里面的 .rh-body 上。 */}
        <span className="rh-rider" ref={riderRef} aria-hidden="true">
          <span key={`fx-${fx.n}`} className={fx.kind ? `rh-body is-${fx.kind}` : 'rh-body'}>
            <PixelRider />
          </span>
        </span>
      </button>

      {/* is-real 只给「真的发生了点什么」时用 —— 验收靠它区分结果和占位文案
          （探针别去匹配文案内容：占位句里也有「跳过去」三个字，会自己骗自己） */}
      <p className={`rh-line${line ? ' is-real' : ''}`} role="status">
        {line || '点一下，他跳过去 —— 不点也没事，他照样到。'}
      </p>
      <p className="rh-foot">
        {hops > 0 && <span className="rh-tally">你提醒了他 {hops} 次 · </span>}
        按住不放，他跳得更高 —— 不计分，也不会输。
      </p>
    </section>
  )
}
