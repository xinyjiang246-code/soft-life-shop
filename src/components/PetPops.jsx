// 点猫时从指尖冒出来的小图：爱心 / 小饼干 / 小星星（一律线描 SVG —— 项目禁 emoji）
//
// 用法：父级 position:relative，把 <PetPops pops={pops} /> 放在里面，
// pops 由 spawnPops(x, y) 生成（x/y 是相对父级的像素坐标）。

const KINDS = ['heart', 'biscuit', 'sparkle']

let uid = 0

/** 生成一组粒子：默认朝上散开，左右随机、各自转一点角度 */
export function spawnPops(x, y, count = 4) {
  return Array.from({ length: count }, (_, i) => {
    const spread = (i - (count - 1) / 2) * 11
    return {
      id: ++uid,
      kind: KINDS[Math.floor(Math.random() * KINDS.length)],
      x: x + spread + (Math.random() * 10 - 5),
      y: y + (Math.random() * 8 - 4),
      dx: spread * 1.5 + (Math.random() * 14 - 7),
      dy: -(38 + Math.random() * 22),
      rot: Math.random() * 60 - 30,
      scale: 0.8 + Math.random() * 0.5,
      delay: i * 45,
    }
  })
}

export default function PetPops({ pops = [] }) {
  if (!pops.length) return null
  return (
    <span className="pat-pop-layer" aria-hidden="true">
      {pops.map((p) => (
        <i
          key={p.id}
          className="pat-pop"
          style={{
            left: `${p.x}px`,
            top: `${p.y}px`,
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            '--rot': `${p.rot}deg`,
            '--pop-scale': p.scale,
            animationDelay: `${p.delay}ms`,
          }}
        >
          <Shape kind={p.kind} />
        </i>
      ))}
    </span>
  )
}

function Shape({ kind }) {
  if (kind === 'biscuit') {
    // 小饼干：圆角方 + 三个小点（呼应项目里一律把零食叫「小饼干」）
    return (
      <svg viewBox="0 0 20 20">
        <rect x="2.2" y="2.2" width="15.6" height="15.6" rx="5.4" fill="#F3DDAE" stroke="#C39A63" strokeWidth="1.5" />
        <circle cx="7.2" cy="7.4" r="1.15" fill="#C39A63" />
        <circle cx="12.6" cy="8.6" r="1.15" fill="#C39A63" />
        <circle cx="9.4" cy="13" r="1.15" fill="#C39A63" />
      </svg>
    )
  }
  if (kind === 'sparkle') {
    return (
      <svg viewBox="0 0 20 20">
        <path d="M10,2 L11.5,7.4 L17,9 L11.5,10.6 L10,16 L8.5,10.6 L3,9 L8.5,7.4 Z" fill="#EFC97A" stroke="#C39A63" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20">
      <path
        d="M10,17.2 C4.6,13.4 2.1,10.6 2.1,7.8 C2.1,5.4 4,3.6 6.3,3.6 C7.9,3.6 9.2,4.5 10,5.8 C10.8,4.5 12.1,3.6 13.7,3.6 C16,3.6 17.9,5.4 17.9,7.8 C17.9,10.6 15.4,13.4 10,17.2 Z"
        fill="#F2A0B4"
        stroke="#D0728A"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
