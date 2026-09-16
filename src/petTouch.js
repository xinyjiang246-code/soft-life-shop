// 点猫的「身体反应」（2026-09-16）
//
// 为什么要这一层：
//   软软现在是一张**平面水彩图**（`assets/pets/*-t.webp`），图里的耳朵、尾巴、
//   身子全是画死的 —— 没法像 SVG 那样「点耳朵只让耳朵动」。
//   所以「身体有反应」只能靠**形变**来表达：挤压拉伸 / 歪头 / 发抖 / 蹭一下。
//   这也是动画最经典的一招：一个平面角色只要会压扁、会歪、会抖，看起来就是活的。
//
// 分区：按点击落点切成 耳朵 / 头 / 左右脸颊 / 肚子 / 爪尾 六块，
//       每块一套不同的形变 + 自己的台词（点头和点肚子不该说同一句话）。

const clamp01 = (n) => Math.max(0, Math.min(1, n))

/** 点击落在图上的哪个部位 —— 用 0~1 归一化坐标判断，与渲染尺寸无关 */
export function zoneFromPoint(rect, clientX, clientY) {
  if (!rect || !rect.width || !rect.height) return 'tummy'
  const nx = clamp01((clientX - rect.left) / rect.width)
  const ny = clamp01((clientY - rect.top) / rect.height)
  if (ny < 0.18) return 'ear'
  if (ny < 0.52) {
    if (nx < 0.3) return 'cheekL'
    if (nx > 0.7) return 'cheekR'
    return 'head'
  }
  if (ny < 0.84) return 'tummy'
  return 'paw'
}

// 每块部位的反应：origin 是形变支点，frames(k) 里 k = 连击放大系数
const REACTIONS = {
  ear: {
    origin: '50% 36%',
    dur: 480,
    frames: (k) => [
      { transform: 'rotate(0deg)' },
      { transform: `rotate(${-5 * k}deg) translateY(${-1.6 * k}px)` },
      { transform: `rotate(${3.4 * k}deg)` },
      { transform: `rotate(${-1.4 * k}deg)` },
      { transform: 'rotate(0deg)' },
    ],
  },
  head: {
    origin: '50% 86%',
    dur: 600,
    frames: (k) => [
      { transform: 'translate(0, 0) rotate(0deg)' },
      { transform: `translate(0, ${-4.5 * k}px) rotate(${2.6 * k}deg)` },
      { transform: `translate(0, ${1 * k}px) rotate(${-1.8 * k}deg)` },
      { transform: `translate(0, 0) rotate(${0.7 * k}deg)` },
      { transform: 'translate(0, 0) rotate(0deg)' },
    ],
  },
  cheekL: {
    origin: '34% 82%',
    dur: 560,
    frames: (k) => [
      { transform: 'translate(0, 0) rotate(0deg)' },
      { transform: `translate(${-4.5 * k}px, 1px) rotate(${-3.2 * k}deg)` },
      { transform: `translate(${1.6 * k}px, 0) rotate(${1.1 * k}deg)` },
      { transform: 'translate(0, 0) rotate(0deg)' },
    ],
  },
  cheekR: {
    origin: '66% 82%',
    dur: 560,
    frames: (k) => [
      { transform: 'translate(0, 0) rotate(0deg)' },
      { transform: `translate(${4.5 * k}px, 1px) rotate(${3.2 * k}deg)` },
      { transform: `translate(${-1.6 * k}px, 0) rotate(${-1.1 * k}deg)` },
      { transform: 'translate(0, 0) rotate(0deg)' },
    ],
  },
  tummy: {
    origin: '50% 100%',
    dur: 620,
    frames: (k) => [
      { transform: 'scale(1, 1)' },
      { transform: `scale(${1 + 0.11 * k}, ${1 - 0.15 * k})` },
      { transform: `scale(${1 - 0.05 * k}, ${1 + 0.07 * k})` },
      { transform: `scale(${1 + 0.02 * k}, ${1 - 0.02 * k})` },
      { transform: 'scale(1, 1)' },
    ],
  },
  paw: {
    origin: '50% 96%',
    dur: 460,
    frames: (k) => [
      { transform: 'rotate(0deg) translateY(0)' },
      { transform: `rotate(${2.2 * k}deg) translateY(${-2 * k}px)` },
      { transform: `rotate(${-2.2 * k}deg)` },
      { transform: `rotate(${1.6 * k}deg)` },
      { transform: `rotate(${-1.2 * k}deg)` },
      { transform: 'rotate(0deg) translateY(0)' },
    ],
  },
}

export const ZONE_LINES = {
  ear: ['耳朵抖了一下。', '耳朵转过来了——很受用。'],
  head: ['（把头往你手底下压了压）', '蹭了一下你的手心。'],
  cheekL: ['侧脸贴过来了。', '被摸到腮帮子，眼睛眯了一下。'],
  cheekR: ['侧脸贴过来了。', '它把右边脸也递过来了。'],
  tummy: ['肚子软软的，它没躲。', '呼噜呼噜……', '（肚皮朝天翻了一点）'],
  paw: ['爪子缩了一下。', '尾巴慢慢竖起来了。'],
}

// 点不同部位 → 脸上换不同表情（见 components/PetFace.jsx）
const ZONE_EXPR = {
  ear: 'squint',      // 眯眼
  head: 'bliss',      // 闭眼享受
  cheekL: 'smile',    // 闭眼笑 + 脸红
  cheekR: 'smile',
  tummy: 'purr',      // 弯月眼 + 呼噜
  paw: 'startle',     // 圆睁 + 汗滴
}

/**
 * 这一下该是什么表情。
 * 连击到后面不再分部位 —— 摸第三下开始眼睛变爱心、第五下变星星，
 * 这才是「越摸越嗨」的样子（只放大形变的话，看上去只是抖得更厉害）。
 */
export function expressionFor(zone, heat = 0) {
  if (heat >= 4) return 'star'
  if (heat >= 2) return 'heart'
  return ZONE_EXPR[zone] || 'bliss'
}

/** 表情停留多久：形变最长 620ms，加一点余韵，之后回到本来那张脸 */
export const FACE_HOLD = 1150

export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * 播放一次身体反应。
 * @param el   要形变的元素（**不要**和别的动画共用同一个元素，会互相覆盖 transform）
 * @param zone zoneFromPoint 的返回值
 * @param heat 连击数（0 = 第一下）
 */
export function playPatReaction(el, zone, heat = 0, reduced = prefersReducedMotion()) {
  if (!el || typeof el.animate !== 'function') return null
  const r = REACTIONS[zone] || REACTIONS.tummy
  const level = Math.min(Math.max(heat, 0), 4)
  // 连击越密，幅度越大、节奏越快 —— 摸到第四下以后它会「嗨」起来
  const k = reduced ? 0.35 : 1 + level * 0.15
  const duration = reduced ? 200 : Math.max(320, r.dur - level * 34)

  el.style.transformOrigin = r.origin
  // 上一次还没播完就再点：先掐掉，避免两份 transform 叠在一起打架
  el.getAnimations().forEach((a) => a.cancel())
  return el.animate(r.frames(k), { duration, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'none' })
}

/** 连击：1.5 秒内接着点才算连击，停手后再点从头算 */
export const HEAT_WINDOW = 1500
