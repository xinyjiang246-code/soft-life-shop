import { PET_COLORWAYS } from '../data.js'
import PetFace from './PetFace.jsx'

/**
 * SoftPet —— 慢活小铺的虚拟伙伴「软软」
 * 形象：小猫「软软」（2026-09-14 用户敲定的猫咪，图片素材优先；下方 SVG 是兔熊旧版兜底）
 *
 * ⚠️ 2026-09-14 风格定版（按用户给的日式手绘参考图重画，v3）
 *   参考特征（务必保持）：
 *   · 描边：暖可可棕（不是纯黑、不是无描边），中等粗细，圆头圆角接头 —— 手绘针管笔感
 *   · 填色：奶白平涂、几乎留白，只用粉内耳 / 粉腮红 / 小装饰点缀
 *   · 比例：1:1 超 Q —— 大包子脸（脸颊鼓出来）+ 小团子身体 + 小圆爪
 *   · 五官：豆豆眼（实心椭圆 + 白高光）、小粉鼻、ω 嘴、柔边腮红
 *   · 气质：日式松弛、印章 / 贴纸感
 *   ⛔ 别退回「无描边纯色块」或「伪立体渐变」—— 两版都被用户否决过。
 *
 * AI 生图模式（PET_ART）仍然优先：有素材用图片，这份 SVG 是兜底。
 *
 * props:
 *   stage  0-4 成长阶段（体型、耳朵长度、配饰、眼睛颜色）
 *   mood   happy | sleepy | angry | love | sparkle
 *   colorway cream | pink | blue
 *   size   像素宽度
 */

const PALETTES = {
  cream: {
    fur: '#FFFDF6', stroke: '#8A5638',
    earInner: '#F8CFD5', blush: '#F5C2CA', nose: '#E9A8B4',
    ribbon: '#F2B7C5', ribbonDeep: '#D98BA3',
    eye: '#5E4030', ruby: '#C4455A',
    gold: '#EFC97A', flower: '#F6DE9B',
    petal: '#FBE0E7', petalDeep: '#EFB9C9', leaf: '#B9CE9E',
  },
  pink: {
    fur: '#FEF3F5', stroke: '#A6606A',
    earInner: '#F6C6D0', blush: '#F2B8C4', nose: '#E4A0AE',
    ribbon: '#EFA6BB', ribbonDeep: '#D6839C',
    eye: '#5F3F44', ruby: '#C4455A',
    gold: '#EBC77F', flower: '#F4DA95',
    petal: '#F8DCE4', petalDeep: '#EDB9C9', leaf: '#B4C99A',
  },
  blue: {
    fur: '#F4F9FD', stroke: '#5F7A92',
    earInner: '#F3D2DA', blush: '#F0C0CA', nose: '#E0A4B0',
    ribbon: '#BFD8EA', ribbonDeep: '#96BBD6',
    eye: '#3F4E5C', ruby: '#C4455A',
    gold: '#E9C87E', flower: '#F1DC9C',
    petal: '#F2E0E8', petalDeep: '#DCC3D2', leaf: '#AEC49A',
  },
}

const SW = 3.0   // 主轮廓：要够粗，缩到 44px 还能看见
const SW2 = 2.2  // 细节线（五官、内耳）

export const STAGE_LOOK = [
  // 0 兔熊幼崽：坐在花苞里，只有一对小圆耳
  { scale: 0.78, ear: 'stub', earLen: 1.0, bud: true, collar: false, bow: 'none', flower: false, twinBow: false, sparkle: false, ruby: false },
  // 1 小兔熊：花苞谢了，小圆耳长高一点，戴上细项圈
  { scale: 0.88, ear: 'stub', earLen: 1.18, bud: false, collar: true, bow: 'none', flower: false, twinBow: false, sparkle: false, ruby: false },
  // 2 垂耳兔熊：耳朵第一次垂下来（还短），项圈 + 一小朵花
  { scale: 0.95, ear: 'floppy', earLen: 0.78, bud: false, collar: true, bow: 'small', flower: true, twinBow: false, sparkle: false, ruby: false },
  // 3 小脾气兔熊：耳朵垂到下巴，胸口打个结
  { scale: 1.0, ear: 'floppy', earLen: 0.9, bud: false, collar: true, bow: 'small', flower: true, twinBow: false, sparkle: false, ruby: false },
  // 4 缎带兔熊：耳朵垂到身侧，双耳蝴蝶结 + 红宝石眼 + 星星
  { scale: 1.05, ear: 'floppy', earLen: 1.0, bud: false, collar: true, bow: 'big', flower: true, twinBow: true, sparkle: true, ruby: true },
]

export function SoftPet({ stage = 0, mood = 'happy', colorway = 'cream', size = 120, className = '', faces = false, face = null, faceTick = 0 }) {
  const p = PALETTES[colorway] || PALETTES.cream
  const look = STAGE_LOOK[Math.max(0, Math.min(STAGE_LOOK.length - 1, stage))]
  const eyeColor = look.ruby ? p.ruby : p.eye
  const s = look.scale
  const transform = `translate(${110 * (1 - s)} ${234 * (1 - s)}) scale(${s})`

  // AI 形象图优先；没有对应素材时才走 SVG 手绘
  const artStyle = getPetArtStyle()
  const art = petArtUrl(artStyle, colorway, stage)
  if (art) {
    // 画表情时：底图换成「无眼底图」，再在上面画新五官（见 components/PetFace.jsx）
    // ⚠️ 只有 faces=true 的实例才挂无眼底图 —— 首页那只溜达猫（58px，眼睛才 4px）
    //    永远用不上表情，挂上去等于白拉一张图、还会截走点击（实测命中到 .pet-noeye）。
    const noEye = faces ? petNoEyeUrl(artStyle, colorway, stage) : null
    const showFace = Boolean(face && noEye)
    // 透明底版（*-t.webp）去掉相框，猫咪是「活的」；带底版保留相纸卡
    return (
      <div
        className={`pet-photo pet-photo-${colorway} ${art.cut ? 'is-cut' : ''} ${className}`}
        style={{ width: size, height: Math.round((size * 248) / 220) }}
        role="img"
        aria-label={`虚拟伙伴软软，${showFace ? '正在被摸' : mood}`}
      >
        <img src={art.url} alt="" draggable={false} />
        {/* 无眼底图常驻 DOM（只是透明）—— 临时插进来会有一帧解码空窗，看着像闪一下 */}
        {noEye && (
          <img
            className={`pet-noeye${showFace ? ' is-on' : ''}`}
            src={noEye}
            alt=""
            draggable={false}
            aria-hidden="true"
          />
        )}
        {showFace && <PetFace key={`${face}-${faceTick}`} stage={stage} expr={face} />}
        {!showFace && <MoodSticker mood={mood} />}
      </div>
    )
  }

  return (
    <svg
      className={`softpet softpet-${colorway} ${className}`}
      viewBox="0 0 220 248"
      width={size}
      height={(size * 248) / 220}
      role="img"
      aria-label={`虚拟伙伴软软，${mood}`}
    >
      {/* 落地投影（贴纸感） */}
      <ellipse cx="110" cy="238" rx={44 * s} ry={6.5 * s} fill="rgba(150,116,86,.13)" />

      <g transform={transform}>
        {/* 耳朵画在头后面：头盖住耳根，只留垂在脸颊两侧的部分 */}
        <g className="sp-ear-l">
          <g transform={`translate(0 ${60 * (1 - look.earLen)}) scale(1 ${look.earLen})`}>
            {look.ear === 'floppy' ? <DroopyEar p={p} side="l" /> : <StubEar p={p} side="l" />}
          </g>
        </g>
        <g className="sp-ear-r">
          <g transform={`translate(0 ${60 * (1 - look.earLen)}) scale(1 ${look.earLen})`}>
            {look.ear === 'floppy' ? <DroopyEar p={p} side="r" /> : <StubEar p={p} side="r" />}
          </g>
        </g>

        {/* 这一组统一继承描边颜色/粗细，子元素只写 fill */}
        <g
          className="sp-breathe"
          stroke={p.stroke}
          strokeWidth={SW}
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {/* 身体：小团子 */}
          <ellipse cx="110" cy="198" rx="40" ry="33" fill={p.fur} />
          {/* 小圆手（参考图：圆点短棒，不分化手指） */}
          <circle cx="74" cy="207" r="12.5" fill={p.fur} />
          <circle cx="146" cy="207" r="12.5" fill={p.fur} />
          {/* 只露一点点的小脚 */}
          <ellipse cx="90" cy="227" rx="15" ry="8.5" fill={p.fur} />
          <ellipse cx="130" cy="227" rx="15" ry="8.5" fill={p.fur} />

          {/* 幼崽的花苞：花瓣从下面兜住身体 */}
          {look.bud && <PetalBud p={p} />}

          {/* 项圈（画在头之前，只露脖子那一条） */}
          {look.collar && <Collar wide={look.bow === 'big'} />}

          {/* 头：包子脸 —— 脸颊鼓出来、下巴圆 */}
          <path
            d="M110,38 C152,38 176,64 176,102 C176,128 168,150 153,162 C140,172 127,175 110,175 C93,175 80,172 67,162 C52,150 44,128 44,102 C44,64 68,38 110,38 Z"
            fill={p.fur}
          />

          {/* 脸 */}
          <Face p={p} mood={mood} eyeColor={eyeColor} />

          {/* 胸口缎带结 */}
          {look.bow !== 'none' && <Bow p={p} big={look.bow === 'big'} cx={110} cy={190} />}

          {/* 头顶的小花（呼应参考图那朵小黄花） */}
          {look.flower && <Flower p={p} x={148} y={54} r={10} />}

          {/* 满级的双耳结 */}
          {look.twinBow && (
            <>
              <Bow p={p} cx={62} cy={82} scale={0.44} />
              <Bow p={p} cx={158} cy={82} scale={0.44} />
            </>
          )}

          {/* 缎带兔熊的星星 */}
          {look.sparkle && (
            <g fill={p.gold} stroke={p.stroke} strokeWidth="1.2">
              <Sparkle x={30} y={100} r={6.5} />
              <Sparkle x={196} y={84} r={5} />
              <Sparkle x={188} y={146} r={3.6} />
            </g>
          )}
        </g>
      </g>
    </svg>
  )
}

/* ---------- 耳朵 ---------- */

// 幼崽 / 小兔熊期：头顶一对小圆耳（竖椭圆，耳内粉）
function StubEar({ p, side }) {
  const cx = side === 'l' ? 76 : 144
  const rot = side === 'l' ? -18 : 18
  return (
    <g transform={`rotate(${rot} ${cx} 66)`}>
      <ellipse cx={cx} cy="40" rx="15" ry="27" fill={p.fur} stroke={p.stroke} strokeWidth={SW} />
      <ellipse cx={cx} cy="46" rx="7.6" ry="15" fill={p.earInner} stroke="none" />
    </g>
  )
}

// 长大后：贴着脸颊垂下来的长兔耳。
// 三个关键：① 外缘要**明显鼓出去**（比头轮廓宽），否则和头并成一条平行的边 = 蘑菇头；
//          ② 耳尖要**收窄**，不能是一整条等宽的带子；
//          ③ 耳尖要垂到**下巴以下**（头底 y=175，耳尖到 y≈196），否则下缘齐平像方块。
const EAR_OUTER_L = 'M94,42 C68,22 34,36 25,78 C16,118 20,160 32,186 C38,200 56,200 60,182 C64,160 58,120 64,88 C70,58 84,48 96,46 Z'
const EAR_INNER_L = 'M88,56 C70,42 46,54 38,86 C30,120 34,154 43,176 C48,188 56,186 58,172 C61,152 56,120 62,92 C67,68 78,60 88,62 Z'

function mirrorX(d) {
  return d.replace(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g, (pair) => {
    const [x, y] = pair.split(',').map(Number)
    return `${220 - x},${y}`
  })
}

function DroopyEar({ p, side }) {
  const outer = side === 'l' ? EAR_OUTER_L : mirrorX(EAR_OUTER_L)
  const inner = side === 'l' ? EAR_INNER_L : mirrorX(EAR_INNER_L)
  return (
    <g>
      <path d={outer} fill={p.fur} stroke={p.stroke} strokeWidth={SW} />
      <path d={inner} fill={p.earInner} stroke="none" />
    </g>
  )
}

/* ---------- 项圈 / 蝴蝶结 / 小花 ---------- */

function Collar({ wide }) {
  const e = wide ? 6 : 0
  return (
    <path
      d={`M${70 - e},184 C90,174 130,174 ${150 + e},184`}
      fill="none"
      strokeWidth={SW * 0.95}
    />
  )
}

function Bow({ p, cx = 110, cy = 190, scale = 1 }) {
  const k = scale
  return (
    <g transform={`translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`}>
      <path
        d={`M${cx - 4},${cy} C${cx - 16},${cy - 13} ${cx - 31},${cy - 8} ${cx - 29},${cy + 3} C${cx - 27},${cy + 13} ${cx - 11},${cy + 13} ${cx - 2},${cy + 3} Z`}
        fill={p.ribbon}
        stroke={p.ribbonDeep}
        strokeWidth="2"
      />
      <path
        d={`M${cx + 4},${cy} C${cx + 16},${cy - 13} ${cx + 31},${cy - 8} ${cx + 29},${cy + 3} C${cx + 27},${cy + 13} ${cx + 11},${cy + 13} ${cx + 2},${cy + 3} Z`}
        fill={p.ribbon}
        stroke={p.ribbonDeep}
        strokeWidth="2"
      />
      <circle cx={cx} cy={cy + 1} r="5.4" fill={p.ribbonDeep} stroke="none" />
      <circle cx={cx - 1.5} cy={cy - 0.6} r="1.6" fill={p.ribbon} stroke="none" />
    </g>
  )
}

function Flower({ p, x, y, r }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx={x}
          cy={y - r * 0.68}
          rx={r * 0.44}
          ry={r * 0.6}
          fill={p.flower}
          stroke={p.stroke}
          strokeWidth={1.4}
          transform={`rotate(${a} ${x} ${y})`}
        />
      ))}
      <circle cx={x} cy={y} r={r * 0.32} fill={p.gold} stroke={p.stroke} strokeWidth={1.4} />
    </g>
  )
}

/* ---------- 幼崽的花苞 ---------- */

function PetalBud({ p }) {
  return (
    <g>
      {/* 后层花瓣：从左右两侧兜住下半身 */}
      <ellipse cx="70" cy="212" rx="27" ry="25" fill={p.petal} />
      <ellipse cx="150" cy="212" rx="27" ry="25" fill={p.petal} />
      {/* 前层花瓣 */}
      <ellipse cx="91" cy="228" rx="25" ry="20" fill={p.petalDeep} />
      <ellipse cx="129" cy="228" rx="25" ry="20" fill={p.petalDeep} />
      {/* 中央花瓣 */}
      <ellipse cx="110" cy="234" rx="19" ry="16" fill={p.petal} />
      {/* 两片小叶 */}
      <ellipse cx="52" cy="236" rx="15" ry="8" fill={p.leaf} transform="rotate(-20 52 236)" />
      <ellipse cx="168" cy="236" rx="15" ry="8" fill={p.leaf} transform="rotate(20 168 236)" />
    </g>
  )
}

/* ---------- 脸（豆豆眼 + ω 嘴，位置低、间距宽） ---------- */

function Face({ p, mood, eyeColor }) {
  const lx = 84
  const rx = 136
  const ey = 118

  return (
    <g>
      {/* 腮红：贴在脸颊外缘 */}
      <ellipse cx="64" cy="137" rx="13" ry="8.5" fill={p.blush} stroke="none" />
      <ellipse cx="156" cy="137" rx="13" ry="8.5" fill={p.blush} stroke="none" />

      {mood === 'sleepy' && (
        <g>
          <path d={`M${lx - 7.5},${ey} q7.5,7 15,0`} fill="none" strokeWidth={SW2} />
          <path d={`M${rx - 7.5},${ey} q7.5,7 15,0`} fill="none" strokeWidth={SW2} />
          <Nose p={p} />
          <path d="M102,138 q4,5.5 8,0 q4,5.5 8,0" fill="none" strokeWidth={SW2} />
          <g fill={p.stroke} stroke="none" fontFamily="Cormorant Garamond, Georgia, serif" fontStyle="italic">
            <text x="162" y="58" fontSize="17">z</text>
            <text x="175" y="42" fontSize="12">z</text>
          </g>
        </g>
      )}

      {mood === 'angry' && (
        <g>
          <path d={`M${lx - 9},${ey - 13} L${lx + 6},${ey - 7}`} fill="none" strokeWidth={SW2} />
          <path d={`M${rx + 9},${ey - 13} L${rx - 6},${ey - 7}`} fill="none" strokeWidth={SW2} />
          <circle cx={lx} cy={ey + 3} r="5" fill={eyeColor} stroke="none" />
          <circle cx={rx} cy={ey + 3} r="5" fill={eyeColor} stroke="none" />
          <Nose p={p} />
          <path d="M102,141 q8,-5 16,0" fill="none" strokeWidth={SW2} />
        </g>
      )}

      {mood === 'love' && (
        <g>
          <Heart cx={lx} cy={ey} r={7.5} fill="#E4708A" />
          <Heart cx={rx} cy={ey} r={7.5} fill="#E4708A" />
          <Nose p={p} />
          <path d="M102,138 q4,5.5 8,0 q4,5.5 8,0" fill="none" strokeWidth={SW2} />
        </g>
      )}

      {(mood === 'happy' || mood === 'sparkle') && (
        <g>
          {/* 豆豆眼：实心椭圆 + 白高光 */}
          <ellipse cx={lx} cy={ey} rx="6.4" ry="7.6" fill={eyeColor} stroke="none" />
          <ellipse cx={rx} cy={ey} rx="6.4" ry="7.6" fill={eyeColor} stroke="none" />
          <circle cx={lx - 2.3} cy={ey - 2.8} r="2.4" fill="#fff" stroke="none" />
          <circle cx={rx - 2.3} cy={ey - 2.8} r="2.4" fill="#fff" stroke="none" />
          <Nose p={p} />
          <path d="M102,138 q4,5.5 8,0 q4,5.5 8,0" fill="none" strokeWidth={SW2} />
          {mood === 'sparkle' && (
            <g fill={p.gold} stroke={p.stroke} strokeWidth="1.2">
              <Sparkle x={166} y={78} r={6} />
              <Sparkle x={56} y={70} r={4.2} />
            </g>
          )}
        </g>
      )}
    </g>
  )
}

function Nose({ p }) {
  return <ellipse cx="110" cy="132" rx="3.8" ry="2.9" fill={p.nose} stroke="none" />
}

/* ---------- 图片版的心情浮层（AI 图模式的角标贴纸） ---------- */

function MoodSticker({ mood }) {
  if (mood === 'happy') return null
  return (
    <svg className="pet-photo-mood" viewBox="0 0 40 40" aria-hidden="true">
      {mood === 'sleepy' && (
        <g fill="#8A7A66" fontFamily="Cormorant Garamond, Georgia, serif" fontStyle="italic">
          <text x="2" y="32" fontSize="21">z</text>
          <text x="19" y="17" fontSize="14">z</text>
        </g>
      )}
      {mood === 'love' && (
        <g fill="#E4708A">
          <Heart cx={13} cy={25} r={8.5} />
          <Heart cx={28} cy={13} r={5.5} />
        </g>
      )}
      {mood === 'sparkle' && (
        <g fill="#E7C88D">
          <Sparkle x={12} y={22} r={9} />
          <Sparkle x={29} y={11} r={5.5} />
        </g>
      )}
      {mood === 'angry' && (
        <g stroke="#D9827E" strokeWidth="2.8" strokeLinecap="round" fill="none">
          <path d="M6,7 L13,13" />
          <path d="M20,3 L21.5,11" />
          <path d="M34,7 L27,13" />
          <path d="M4,21 L12,21" />
        </g>
      )}
    </svg>
  )
}

/* ---------- 小零件 ---------- */

function Heart({ cx, cy, r, fill }) {
  return (
    <path
      d={`M${cx},${cy + r * 1.05} C${cx - r * 1.5},${cy - r * 0.2} ${cx - r * 0.55},${cy - r * 1.3} ${cx},${cy - r * 0.35} C${cx + r * 0.55},${cy - r * 1.3} ${cx + r * 1.5},${cy - r * 0.2} ${cx},${cy + r * 1.05} Z`}
      fill={fill}
    />
  )
}

function Sparkle({ x, y, r }) {
  return <path d={`M${x},${y - r} L${x + r * 0.34},${y - r * 0.34} L${x + r},${y} L${x + r * 0.34},${y + r * 0.34} L${x},${y + r} L${x - r * 0.34},${y + r * 0.34} L${x - r},${y} L${x - r * 0.34},${y - r * 0.34} Z`} />
}

// ============================================================
//  AI 形象图模式（图片优先，SVG 兜底）
//  原始 AI 生图经 tools/petForge.py 处理后落到 src/assets/pets/：
//    {画风a|b}-{毛色cream|pink|blue}-stage{0-4}.webp   ← 会成长的伙伴「软软」
//    neighbor*.webp                                    ← 不会成长的邻居猫
//  2026-09-14 起形象 = 用户敲定的两只猫（原来的兔熊 SVG 只作为「一张图都没有」时的兜底）。
// ============================================================
const PET_ART = import.meta.glob('../assets/pets/*.webp', { eager: true, query: '?url', import: 'default' })
const PET_ART_STYLE_KEY = 'soft-life-pet-art-style'

export function getPetArtStyle() {
  try {
    const saved = localStorage.getItem(PET_ART_STYLE_KEY)
    if (saved === 'a' || saved === 'b') {
      const other = saved === 'a' ? 'b' : 'a'
      const keys = Object.keys(PET_ART)
      const hasSaved = keys.some((k) => k.includes(`/${saved}-`))
      const hasOther = keys.some((k) => k.includes(`/${other}-`))
      if (!hasSaved && hasOther) return other
      return saved
    }
  } catch { /* localStorage 不可用就走自动探测 */ }
  const keys = Object.keys(PET_ART)
  if (keys.some((k) => k.includes('/a-'))) return 'a'
  if (keys.some((k) => k.includes('/b-'))) return 'b'
  return 'a'
}

export function setPetArtStyle(style) {
  try { localStorage.setItem(PET_ART_STYLE_KEY, style) } catch { /* 忽略 */ }
}

function petArtUrl(style, colorway, stage) {
  const styles = [style, style === 'a' ? 'b' : 'a']
  const colorways = [colorway, 'cream']
  for (const st of styles) {
    for (const cw of colorways) {
      // 优先透明底版（tools/petKnockout.py 产出 *-t.webp）：猫咪能脱离相框活动
      // 注意：Vite 会把 URL 变成 xxx-t-HASH.webp，所以不能靠 endsWith 判断，返回时带上 cut 标记
      const cut = PET_ART[`../assets/pets/${st}-${cw}-stage${stage}-t.webp`]
      if (cut) return { url: cut, cut: true }
      const hit = PET_ART[`../assets/pets/${st}-${cw}-stage${stage}.webp`]
      if (hit) return { url: hit, cut: false }
    }
  }
  return null
}

// 「无眼底图」（tools/petFace.py 产出，放在 assets/pets/noeye/ 子目录）。
// 只在画表情时用：表情画在它上面，就不必去盖原图的眼睛。
// ⚠️ 子目录是刻意的 —— PET_ART 的 glob 是 assets/pets/*.webp（不递归），
//    放同一层会被当成又一个画风素材，污染 petArtUrl 的遍历。
const PET_NOEYE = import.meta.glob('../assets/pets/noeye/*.webp', { eager: true, query: '?url', import: 'default' })

export function petNoEyeUrl(style, colorway, stage) {
  const styles = [style, style === 'a' ? 'b' : 'a']
  const colorways = [colorway, 'cream']
  for (const st of styles) {
    for (const cw of colorways) {
      const hit = PET_NOEYE[`../assets/pets/noeye/${st}-${cw}-stage${stage}-t.webp`]
      if (hit) return hit
    }
  }
  return null
}

// 邻居猫：不参与成长，只有一张图（petForge 用 --out-name neighbor 产出）。
const NEIGHBOR_ART = import.meta.glob('../assets/pets/neighbor*.webp', { eager: true, query: '?url', import: 'default' })
export function neighborArtUrl() {
  // ⚠️ 必须用 key 去取 value：glob 的 key 是**源路径**（../assets/pets/…），
  //    直接塞进 <img src> 会解析成 /assets/pets/neighbor-t.webp → 404。
  //    实测：首页那只串门猫一直是一张破图（neighbor-t.webp 404）。
  //    顺序 = 透明底版优先（猫咪脱离相纸框），其次带底版，最后任意一张兜底。
  const cut = NEIGHBOR_ART['../assets/pets/neighbor-t.webp']
  if (cut) return cut
  return NEIGHBOR_ART['../assets/pets/neighbor.webp'] || Object.values(NEIGHBOR_ART)[0] || null
}

// 心情 emoji（petLinesByStage 的 mood 字段）→ 表情
const MOOD_MAP = {
  '💭': 'happy', '☁️': 'happy', '✨': 'sparkle', '🌙': 'sleepy', '💤': 'sleepy',
  '🥹': 'happy', '🥛': 'happy', '👀': 'happy', '😺': 'happy', '😽': 'love',
  '😼': 'angry', '🛋️': 'sleepy', '🥢': 'happy', '🪟': 'happy', '📖': 'happy',
  '🌿': 'happy', '🧋': 'love', '🍵': 'sleepy', '🎀': 'love',
}

export function moodFromEmoji(emoji) {
  return MOOD_MAP[emoji] || 'happy'
}

export const COLORWAYS = PET_COLORWAYS

export default SoftPet
