import { FACE_EYE, FACE_INK, faceAnchor } from '../petFace.js'
import { DOG_FACE_EYE, DOG_FACE_INK, dogFaceAnchor } from '../dogFace.js'

/**
 * PetFace —— 软软的「表情」层（2026-09-17）
 *
 * 为什么要有这一层：
 *   上一版点它只有**身体形变**，表情没变。可软软是一张**平面水彩图**，
 *   五官画死在图里 —— 要让表情变，就得先把原来的眼睛抹掉。
 *   所以底层用 `assets/pets/noeye/*-t.webp`（tools/petFace.py 生成的「无眼底图」：
 *   用形态学最大值把眼睛那块填成周围的毛色），本组件只负责**往上画新的五官**。
 *   ⚠️ 别退回「用纯色盖住原眼睛」—— 眼睛周围是水彩晕染，左白右灰，
 *      任何一个纯色都会有一半对不上（实测并否决）。
 *
 * 坐标：viewBox 与素材同为 720x812，锚点来自 src/petFace.js（自动量出来的）。
 *   每只眼睛都 translate 到自己的位置再按 tilt 旋转 —— 软软是 3/4 侧脸，
 *   两眼不在一条水平线上（倾斜约 -10°~-12°），不跟着转就会像贴歪的贴纸。
 *   笔画颜色取自原图（FACE_INK），不要手写色值。
 */

const SW = 9            // 笔宽：原图描边 8~11px，取中间值
const BLUSH = '#F0A6B2'
const MOUTH_IN = '#E9889B'   // 张嘴时的口腔色：比浮空爱心深一档，才读得出「张开」
const TONGUE = '#F4B7C2'
// 爱心眼 / 星星眼跟**浮空小记号**同一套色系（见下方 Mark），这样两层看着是一件事。
// 别改回 FACE_EYE（深棕）—— 那会让「眼睛变成爱心」读成一坨深色，跟旁边的粉爱心不搭。
const EYE_HEART = '#F28FA6'
const EYE_STAR = '#EFC97A'

/** 每种表情：眼睛形状 + 嘴形 + 要不要腮红 + 额外的浮空小记号
 *
 *  ⚠️ 2026-09-17 补：**嘴必须跟着表情变**。
 *  软软这张图原本**只有眼睛和鼻子、没有嘴**（鼻子下面是水彩纸纹，放大 7 倍确认过）。
 *  第一版表情只换眼睛，于是七种表情共用同一张下半脸 —— 眼睛再变也像「只有上半脸在演」
 *  （`startle` 那张尤其别扭：眼睛瞪得老大，嘴却一如既往地平静）。
 *  现在嘴按 `nose` 锚点推算：鼻子正下方、跟着 `tilt` 转。
 */
export const EXPRESSIONS = {
  squint: { blush: 0.30, mouth: 'flat', marks: [] },                          // 耳朵被碰 → 眯起眼
  bliss: { blush: 0.42, mouth: 'smile', marks: ['sparkle'] },                 // 被摸头 → 闭眼享受
  smile: { blush: 0.62, mouth: 'grin', marks: ['heart1'] },                   // 被摸腮 → 张口笑 + 脸红
  purr: { blush: 0.72, mouth: 'wave', marks: ['purr'] },                      // 摸肚皮 → 呼噜（ω 嘴）
  startle: { blush: 0.0, mouth: 'o', marks: ['shock'] },                      // 碰爪子 → 惊（小圆嘴）
  heart: { blush: 0.8, mouth: 'grin', marks: ['hearts'] },                    // 连摸 → 爱心眼
  star: { blush: 0.5, mouth: 'laugh', marks: ['sparkles'] },                  // 摸嗨了 → 星星眼 + 大笑
}

export default function PetFace({ stage = 0, expr = 'bliss', className = '', species = 'cat' }) {
  const cfg = EXPRESSIONS[expr]
  if (!cfg) return null
  // 物种决定三样：墨色 / 眼珠色 / 锚点（猫用 petFace.js，狗用 dogFace.js —— 两套别混）
  const ink = species === 'dog' ? DOG_FACE_INK : FACE_INK
  const eye = species === 'dog' ? DOG_FACE_EYE : FACE_EYE
  const a = (species === 'dog' ? dogFaceAnchor : faceAnchor)(stage)

  const W = 720, H = 812
  const eL = [a.eyeL[0] * W, a.eyeL[1] * H]
  const eR = [a.eyeR[0] * W, a.eyeR[1] * H]
  const rx = (a.eyeW * W) / 2
  const ry = (a.eyeH * H) / 2
  const gap = a.gap * W
  const mid = [(eL[0] + eR[0]) / 2, (eL[1] + eR[1]) / 2]
  const nose = [a.nose[0] * W, a.nose[1] * H]

  return (
    <svg
      className={`pet-face pet-face-${expr} ${className}`}
      viewBox={`0 0 ${W} ${H}`}
      stroke={ink}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* 腮红画在眼睛之下、毛色之上 */}
      {cfg.blush > 0 && (
        <g fill={BLUSH} opacity={cfg.blush}>
          <Ellipse cx={eL[0] - rx * 1.15} cy={eL[1] + ry * 1.35} rx={rx * 1.05} ry={ry * 0.62} rot={a.tilt} />
          <Ellipse cx={eR[0] + rx * 1.15} cy={eR[1] + ry * 1.35} rx={rx * 1.05} ry={ry * 0.62} rot={a.tilt} />
        </g>
      )}

      {/* 两只眼睛：各自平移 + 按 tilt 旋转。
          类名 `pf-eye` 是给验收脚本用的**明确钩子** —— 别让探针靠「带 transform 的 <g>」去猜，
          那样以后往表情层里再加任何一层带 transform 的 <g>（比如嘴）都会把眼睛数错。 */}
      {[['L', eL], ['R', eR]].map(([side, [cx, cy]]) => (
        <g key={side} className="pf-eye" transform={`translate(${cx} ${cy}) rotate(${a.tilt})`}>
          <Eye expr={expr} rx={rx} ry={ry} side={side} ink={ink} eye={eye} />
        </g>
      ))}

      {/* 嘴：位置由鼻子推出来，不是量出来的（原图本来没有嘴）。
          ⚠️ 外面这层 <g> 只放 SVG 的 transform 属性，里面 .pf-mouth 才留给 CSS 动画 ——
          CSS 的 transform 会**盖掉** SVG 的 transform 属性，两层混在一起嘴会跳回原点。 */}
      {cfg.mouth && (
        <g transform={`translate(${nose[0]} ${nose[1] + ry * 0.85}) rotate(${a.tilt})`}>
          <g className={`pf-mouth pf-mouth-${cfg.mouth}`}>
            <Mouth kind={cfg.mouth} w={rx * 1.6} ry={ry} />
          </g>
        </g>
      )}

      {/* 浮空小记号 */}
      <g className="pf-marks" stroke={ink} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {cfg.marks.map((m, i) => (
          <Mark key={m} kind={m} mid={mid} gap={gap} rx={rx} ry={ry} idx={i} />
        ))}
      </g>
    </svg>
  )
}

/* ---------- 嘴（原图没有，全是我们画的） ---------- */

/**
 * 嘴形。局部坐标以**嘴心**为原点，w = 半宽，ry = 眼睛半高（当作这一阶段的「面部尺度」）。
 *
 * 为什么纵向不用固定像素、要跟 ry 挂钩：
 *   第一版把嘴的幅度写成 `眼距 * 0.078`，结果 `flat`（摸耳朵时那条浅弧）只有
 *   **3 个 viewBox 单位高** —— 换到宠物页 150px 的软软身上还不到 1 个 CSS 像素，
 *   等于没画。眼睛本身就是 32x44（约 7x9 CSS px）这个量级，嘴只能跟它同一个尺度说话。
 *
 * 形状要按类分：细弧 / 中弧 / 波浪 / 小圆 / 张口（实心）。
 * 光靠「弧度深浅」区分是不够的 —— 缩到 150px 就是同一个嘴。
 */
function Mouth({ kind, w, ry }) {
  if (kind === 'wave') {
    // ω 嘴：呼噜时嘴角是软的。两段都要走满 w（-w → 0 → +w）。
    // ⚠️ 第一版第二段只写 w/1.5，整条路径止于 +0.33w → ω 整体偏到鼻子左边
    //    （约 1/3 个嘴宽），小尺寸下就是「嘴歪了」。
    const dip = ry * 0.45
    return <path d={`M${-w},0 q ${w / 2},${dip * 2} ${w},0 q ${w / 2},${dip * 2} ${w},0`} strokeWidth={SW * 0.8} />
  }
  if (kind === 'o') {
    // 惊：小小的圆嘴（空心的，比实心更「呆住」）
    return <ellipse cx={0} cy={ry * 0.34} rx={w * 0.32} ry={ry * 0.42} strokeWidth={SW * 0.75} />
  }
  if (kind === 'grin' || kind === 'laugh') {
    // 张口笑：口线是直的，下半鼓出去 —— 中间填口腔色
    const h2 = kind === 'laugh' ? ry * 0.95 : ry * 0.56
    const hw = kind === 'laugh' ? w * 1.1 : w * 0.85
    return (
      <g>
        <path d={`M${-hw},0 Q 0,${h2 * 1.9} ${hw},0 Z`} fill={MOUTH_IN} strokeWidth={SW * 0.78} />
        {/* 一点舌头：不填会读成一个黑洞 */}
        {kind === 'laugh' && (
          <path d={`M${-hw * 0.4},${h2 * 0.62} Q 0,${h2 * 1.5} ${hw * 0.4},${h2 * 0.62} Z`} fill={TONGUE} stroke="none" />
        )}
      </g>
    )
  }
  // flat / smile：上弯的弧，只是深浅不同。
  // 二次贝塞尔的顶点在 t=.5 处 = 控制点的一半，所以控制点要写 dip*2 才得到 dip 的下沉量。
  const dip = kind === 'smile' ? ry * 0.62 : ry * 0.34
  return <path d={`M${-w},0 Q 0,${dip * 2} ${w},0`} strokeWidth={SW * 0.85} />
}

/* ---------- 眼睛 ---------- */

function Eye({ expr, rx, ry, side = 'L', ink, eye }) {
  const sp = side === 'L' ? 1 : -1   // 朝向脸中心：左眼朝右、右眼朝左
  // 弧线用二次贝塞尔：顶点在 t=.5 处，y = (P0.y + 2*P1.y + P2.y)/4
  const arc = (a0, apex) => {
    const b = 2 * apex - a0
    return <path d={`M${-rx},${a0} Q0,${b} ${rx},${a0}`} strokeWidth={SW} />
  }

  if (expr === 'heart') {
    return <Heart cx={0} cy={0} r={rx * 0.95} fill={EYE_HEART} stroke={ink} strokeWidth={SW * 0.66} />
  }
  if (expr === 'star') {
    return <Sparkle cx={0} cy={0} r={rx * 1.25} fill={EYE_STAR} stroke={ink} strokeWidth={SW * 0.66} />
  }
  if (expr === 'startle') {
    // 受惊：**睁大的眼白 + 缩小的瞳孔**。
    // 第一版是「把原来的黑眼珠放大一圈 + 高光」，问题是这样跟平时的脸几乎一样
    // （软软本来的眼睛就是深色椭圆加高光），点了看不出变化。
    // 缩小瞳孔是插画里表示「惊」的固定画法，一眼就能分辨。
    const pr = rx * 0.44
    return (
      <g>
        <ellipse cx={0} cy={0} rx={rx * 1.06} ry={ry * 1.16} fill="#FFFDF8" strokeWidth={SW * 0.72} />
        <circle cx={0} cy={0} r={pr} fill={eye} />
        <circle cx={-pr * 0.42} cy={-pr * 0.42} r={pr * 0.34} fill="#FFFDF8" />
      </g>
    )
  }
  // ⚠️ 下面这几种**必须长得明显不一样**：第一版四种全是弧线，只是弧度不同，
  //    看上去就是同一个「闭眼」，等于白做。所以按形状分成四类：
  //    实心细缝（眯）/ ∩ 弧（满足地闭眼）/ ＞＜（害羞地挤眼）/ ◡ 弧（舒服）
  if (expr === 'squint') {
    // 半眯：眼睛还在，只是压成一条缝（点耳朵被痒到）
    return (
      <g>
        <ellipse cx={0} cy={0} rx={rx * 0.94} ry={ry * 0.3} fill={eye} />
        <path d={`M${-rx * 1.05},${-ry * 0.42} L${-rx * 0.35},${-ry * 0.62}`} strokeWidth={SW * 0.6} opacity=".7" />
        <path d={`M${rx * 1.05},${-ry * 0.42} L${rx * 0.35},${-ry * 0.62}`} strokeWidth={SW * 0.6} opacity=".7" />
      </g>
    )
  }
  if (expr === 'smile') {
    // ＞＜：被摸到腮帮子，害羞地挤起眼。**必须逐眼镜像** ——
    // 否则两只眼睛是同一个朝向，看着像抽搐而不是挤眼。
    return (
      <path
        d={`M${-rx * 1.02 * sp},${-ry * 0.86} L${rx * 0.5 * sp},0 L${-rx * 1.02 * sp},${ry * 0.86}`}
        strokeWidth={SW}
      />
    )
  }
  if (expr === 'purr') return arc(-ry * 0.16, ry * 0.45)     // 弯月 ◡
  return arc(ry * 0.4, -ry * 0.7)                            // bliss：闭眼 ∩
}

/* ---------- 浮空小记号 ---------- */

function Mark({ kind, mid, gap, rx, ry }) {
  const [mx, my] = mid
  // 头大约有 2.7 个眼距宽 —— 想让记号落在**脸的外面**，横向就得推到 ±1.35gap 以上。
  // 第一版放在 ±0.98gap，结果呼噜弧线压在脸颊上、汗滴糊在耳朵上。
  if (kind === 'purr') {
    // 呼噜：脸颊外侧各三圈弧线（像在震动）
    return (
      <g opacity={0.5} strokeWidth={SW * 0.62}>
        {[0, 1, 2].map((i) => {
          const k = 1 + i * 0.42
          return (
            <g key={i}>
              <path d={`M${mx - gap * (1.34 + i * 0.1)},${my - gap * 0.24} q ${-16 * k},${gap * 0.24} 0,${gap * 0.48}`} />
              <path d={`M${mx + gap * (1.34 + i * 0.1)},${my - gap * 0.24} q ${16 * k},${gap * 0.24} 0,${gap * 0.48}`} />
            </g>
          )
        })}
      </g>
    )
  }
  if (kind === 'shock') {
    // 受惊：右上角一滴汗 + 左上角两道「惊」线（都在头的外侧）
    return (
      <g strokeWidth={SW * 0.72}>
        <path
          d={`M${mx + gap * 1.42},${my - gap * 0.34} c ${-11},${16} ${-11},${26} 0,${26} c ${11},0 ${11},${-10} 0,${-26} z`}
          fill="#BFD8EA"
        />
        <path d={`M${mx - gap * 1.34},${my - gap * 0.6} l ${-13},${-16}`} />
        <path d={`M${mx - gap * 1.12},${my - gap * 0.94} l ${-5},${-20}`} />
      </g>
    )
  }
  // 小爱心 / 小星星：绕着脑袋浮着
  const spots = {
    heart1: [[-0.62, -0.95, 0.85], [0.68, -0.62, 0.6]],
    hearts: [[-0.78, -0.92, 0.8], [0.74, -0.78, 0.62], [-0.2, -1.16, 0.5]],
    sparkle: [[-0.66, -0.98, 0.8], [0.72, -0.7, 0.55]],
    sparkles: [[-0.8, -1.0, 0.85], [0.78, -0.86, 0.7], [0.06, -1.2, 0.55], [-0.42, -0.66, 0.45]],
  }
  const list = spots[kind] || []
  const isHeart = kind.startsWith('hearts') || kind === 'heart1'
  return (
    <g>
      {list.map(([dx, dy, k], i) => {
        const cx = mx + gap * dx
        const cy = my + gap * dy
        const r = rx * 1.25 * k
        return (
          <g key={i} className="pf-mark" style={{ animationDelay: `${i * 70}ms` }}>
            {isHeart
              ? <Heart cx={cx} cy={cy} r={r} fill="#F2A0B4" stroke="#D0728A" strokeWidth={1.6} />
              : <Sparkle cx={cx} cy={cy} r={r} fill="#EFC97A" stroke="#C39A63" strokeWidth={1.4} />}
          </g>
        )
      })}
    </g>
  )
}

/* ---------- 小零件 ---------- */

function Ellipse({ cx, cy, rx, ry, rot = 0 }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined} />
}

function Heart({ cx, cy, r, fill, stroke, strokeWidth = 0 }) {
  return (
    <path
      d={`M${cx},${cy + r} C${cx - r * 1.5},${cy - r * 0.2} ${cx - r * 0.55},${cy - r * 1.25} ${cx},${cy - r * 0.34} C${cx + r * 0.55},${cy - r * 1.25} ${cx + r * 1.5},${cy - r * 0.2} ${cx},${cy + r} Z`}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  )
}

function Sparkle({ cx, cy, r, fill, stroke, strokeWidth = 0 }) {
  return (
    <path
      d={`M${cx},${cy - r} L${cx + r * 0.32},${cy - r * 0.32} L${cx + r},${cy} L${cx + r * 0.32},${cy + r * 0.32} L${cx},${cy + r} L${cx - r * 0.32},${cy + r * 0.32} L${cx - r},${cy} L${cx - r * 0.32},${cy - r * 0.32} Z`}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  )
}
