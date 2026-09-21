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

/* ── 三条路况（文案与命名保持不变）──
   2026-09-21 删掉了「猫」：那张像素图是一整块梯形加两个尖角，真机上读不出是猫
   （用户原话「做的不像猫，直接不要」）。像素画里猫最难画 —— 12 格宽装不下
   身体 + 四条腿 + 尾巴，硬塞就变成一个色块。**别再试着加回来了。** */
const OBSTACLES = [
  { type: 'puddle', dodge: '他跳过去了，水花都没溅起来。', hit: '溅了一裤腿水 —— 他自己先笑了。' },
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
const COLORS = { puddle: '#8FA8B8', cone: '#C9803A', leaf: '#A8B478' }

/* 越过每样东西需要的离地高度 = 它自己的像素高度。
   短按一下顶点约 24px：水洼 / 落叶（12）**点一下就过**；路障（30）超过短按顶点，
   得**按住**才跳得过去 —— 这个两档梯度就是「按住跳更高」有意义的地方，
   别把 JUMP_V 调到一手就能全过（那样按住就没意义了），也别调到路障也过不去。 */
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

/* ── 骑手：一个人骑在单车上，朝右 ──
   2026-09-21 再改一次 —— 上一版是像素块拼的小人，用户原话：
   「这个骑手的人的形状太那个了，你就换成骑单车的这种人吧，不要这个数码人」。
   所以骑手**不再用像素画**，改成一支线条剪影（和页面里别的插画同一种语言）；
   ⚠️ 场景与玩法一个字都不动 —— 一条地平线、方块路况、按住跳更高、节奏更脆，
   用户当场说过「手机上的确手感更好」（小恐龙那套保留）。

   读得出「人在骑车」全靠这几条**连线**，少一条人就像浮在车上：
     ① 两个空心轮子（真圆，不再用像素环）；
     ② 菱形车架：后轮心 / 五通 / 座 / 头管 / 前轮心，五点连起来；
     ③ 前倾的躯干 + 头在最右上（骑车的姿势；站直了就不像）；
     ④ 手臂从肩接到**车把**、腿从髋接到**脚踏** —— 人和车靠这两条连成一体；
     ⑤ 后座一个方餐箱：一眼知道是送外卖的。
   只有头是实心的（剪影里没个实心块，整张图会散）；别的不上色、不描脸。

   ⚠️ 线宽是「少一笔糊、多一笔糊」调出来的，两个坑都踩过：
     · 线宽 ≥2 全部连成一坨（第一版就是，放大看不出车架）；
     · 腿从髋直着往下跌会**贴着座管平行**，两条线糊成一条 —— 所以膝盖要往前顶
       （髋 20.2,15.2 → 膝 24.5,21.5 → 脚踏 22.8,32.8），跟座管岔开才有腿的样子。
   viewBox 与显示尺寸 1:1（52×40），所以 strokeWidth 的数字就是屏幕像素。 */
function RiderBike() {
  const frame = {
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  }
  const body = { ...frame, strokeWidth: 2.2, strokeLinejoin: 'round' }
  return (
    <svg
      viewBox="0 0 52 40" width={52} height={40}
      aria-hidden="true" focusable="false"
      style={{ display: 'block' }}
    >
      {/* 车：后轮心 (12,31) · 五通 (21,30) · 座 (18.5,16) · 头管 (34,16.5) · 前轮心 (38,31) */}
      <circle cx="12" cy="31" r="7" {...frame} />
      <circle cx="38" cy="31" r="7" {...frame} />
      <path d="M12 31 L21 30 L18.5 16 L12 31" {...frame} />      {/* 后下叉 + 座管 + 后上叉 */}
      <path d="M18.5 16 L34 16.5" {...frame} />                  {/* 上管 */}
      <path d="M21 30 L34.6 20.5" {...frame} />                  {/* 下管 */}
      <path d="M34 16.5 L34.6 20.5 L38 31" {...frame} />         {/* 头管 + 前叉 */}
      <path d="M21 30 L22.8 32.8" {...frame} />                  {/* 曲柄 */}
      <path d="M16.4 15.6 L21 15.4" {...frame} strokeWidth={2.4} />  {/* 座垫 */}
      <path d="M34 16.5 L33.4 14.2 L30.4 14.4" {...frame} strokeWidth={2} /> {/* 车把 */}
      {/* 后座的餐箱（坐在后轮上沿，别做大 —— 大了像货架不像外卖） */}
      <rect x="5" y="17" width="8.6" height="7.2" rx="1" {...frame} />
      {/* 人：髋 (20.2,15.2) · 肩 (27.4,10.4) · 头 · 手臂到车把 · 腿到脚踏 */}
      <circle cx="30.4" cy="6.8" r="3.5" fill="currentColor" />
      <path d="M20.2 15.2 L27.4 10.4" {...body} />                {/* 躯干（前倾） */}
      <path d="M27.4 10.4 L28.6 12.4 L30.4 14.3" {...body} strokeWidth={2} /> {/* 手臂：肩 → 肘 → 车把 */}
      <path d="M20.2 15.2 L25 21.6 L22.8 32.8" {...body} />       {/* 腿：髋 → 膝 → 脚踏 */}
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
            <RiderBike />
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
