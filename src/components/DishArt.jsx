import { useId } from 'react'
import { shadeHex as shade, tintHex as tint } from '../dishForge.js'

/**
 * DishArt —— 给「世界上并不存在的菜」画一张手绘卡片
 *
 * AI 现编的菜没有实物照片，所以不能让它们显示 emoji 或空白。
 * 这里用 SVG 按菜品形态（杯 / 碗 / 盘 / 蛋糕 / 面包）画蜡笔质感的小画：
 *   · 城市主色 hex → 杯身 / 碗身 / 盘子 / 背景渐变
 *   · 主料 main → 配料颜色（红豆是红点点、抹茶是绿粉、柠檬是黄切片…）
 *   · 形态后缀 shape → 同一种容器的画法变体（奶盖/气泡/拿铁/特调…）
 * 三个输入都是确定性种子的一部分，所以同一道菜永远画同一张图。
 */

const CREAM = '#FBF7F0'

/* ---------- 主料配色 ---------- */

// 覆盖 10 座城市厨房里出现过的主料；没命中的主料走 hash → 色环取一个粉彩色
const INGREDIENTS = {
  抹茶: '#8FAE74', 焙茶: '#B08A5E', 黑芝麻: '#5A5048', 玄米: '#C9B98D', 柚子: '#E8C95C',
  红豆: '#A65B5B', 味噌: '#C2955F', 山椒: '#7C9464', 汤豆腐: '#EFEDE3', 柴鱼: '#B98A5A',
  栗子: '#9B6B4A', 白玉: '#EFE9DC', 蕨饼: '#C9B4A0',
  泡菜: '#C75B4A', 年糕: '#EDE3D2', 牛骨: '#E8DCC4', 紫苏: '#7A9B6C', 部队: '#D97B5A',
  蜂蜜黄油: '#E5B96B', 米糕: '#EFE8D8', 柚子蜜: '#E8C45C', 米酒: '#EDE0C0', 五味子: '#B55A6E', 玉米须: '#D6BE7E',
  泰奶: '#E0A96D', 香茅: '#B9C77E', 罗望子: '#A86A4E', 椰青: '#CDE3C4',
  冬阴功: '#C96A45', 打抛: '#8FA866', 青咖喱: '#9BB07A', 青木瓜: '#D9E3A8', 南姜: '#C7A17A',
  芒果: '#EFB75B', 椰浆: '#F1EDE2', 香蕉: '#EFD98F',
  滴漏咖啡: '#8A6248', 炼乳: '#F2EDE0', 荷花茶: '#DCAAB6', 甘蔗: '#CFD8A8',
  河粉: '#EFE7D4', 春卷: '#EAD9A8', 法棍: '#D0A468', 鱼露: '#C9A05E', 香草: '#9DBE86',
  绿豆: '#A8B87E', 椰丝: '#EFEAE0',
  珍珠: '#6E5B4E', 冬瓜: '#D8E4C4', 芋圆: '#C4A8D8', 青草: '#7E9B72',
  卤肉: '#A9704F', 牛肉面: '#B07A55', 蚵仔: '#C9B8A6', 麻油: '#B98A4E', 担仔: '#C08A5A',
  凤梨: '#F0C75C', 芋泥: '#C7AEDB',
  单丛: '#C9B98D', 老香黄: '#D8B45C', 杏仁: '#E8D5BC', 擂茶: '#A3B578',
  牛肉丸: '#B57A5E', 沙茶: '#C2854E', 白粥: '#F2EEE3', 卤味: '#AE7350', 粿条: '#EFE8D6', 糖葱: '#EFD9A8',
  红茶: '#A85F48', 咖啡: '#7E5B44', 石榴: '#C75B62', 酸奶: '#EFEAE0',
  烤肉: '#A96848', 茄子: '#8E6E9E', 鹰嘴豆: '#D9BE8C', 番茄: '#D97B62', 羊肉: '#B57A66',
  开心果: '#A8C07E', 玫瑰: '#D8A0B0', 蜂蜜: '#E8C45C',
  波特: '#8E4E5E', 青柠: '#BFD98A', 橙花: '#EFD9C4',
  鳕鱼: '#EFEDE3', 沙丁鱼: '#A8A8B4', 章鱼: '#C98A94', 蛋挞: '#E8B872', 肉桂: '#A5714C',
  巧克力: '#7A5642', 洛神: '#C25B6E', 玉米: '#E8C45C',
  牛油果: '#9BB570', 黑豆: '#63594E', 辣椒: '#C75B45', 猪肩: '#C08A72', 奇亚: '#8E8478', 焦糖牛奶: '#D09A5E',
  浓缩: '#6E4E3C', 柠檬: '#EAD96C', 血橙: '#D06A5C', 海鲜: '#C9988A', 罗勒: '#7FA05F', 玛格丽特: '#C96A5A', 乳清干酪: '#EFEAE0',
}

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * c).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// 主料 → { fill 主色, deep 深色, light 高光 }；没登记的主料按名字 hash 出一个粉彩
function ingredient(main) {
  const fill = INGREDIENTS[main] || hsl(hashStr(main || 'x') % 360, 0.38, 0.7)
  return { fill, deep: shade(fill, 0.32), light: tint(fill, 0.42) }
}

/* ---------- 五种形态 · 各自的画法变体 ---------- */

function Cup({ p, ing, shape }) {
  return (
    <g>
      <ellipse cx="150" cy="244" rx="52" ry="10" fill="#000" opacity=".07" />
      {/* 杯身 */}
      <path d="M110,114 L190,114 L181,230 Q150,244 119,230 Z" fill={p.body} stroke={p.line} strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="124" y="156" width="7" height="44" rx="3.5" fill="#fff" opacity=".34" />

      {shape === '气泡' ? (
        <g>
          {/* 气泡水：上升的小泡 */}
          {[[128, 208], [142, 188], [158, 214], [166, 178], [136, 158], [152, 142]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 2 ? 3.4 : 5} fill="none" stroke="#fff" strokeWidth="1.8" opacity=".6" />
          ))}
          <ellipse cx="150" cy="114" rx="40" ry="10" fill={p.light} stroke={p.line} strokeWidth="2.2" />
          {/* 杯口一片主料切片 */}
          <circle cx="182" cy="106" r="13" fill={ing.fill} stroke={ing.deep} strokeWidth="2" />
          <path d="M182,106 m-8,0 a8,8 0 0 1 16,0" fill="none" stroke={ing.deep} strokeWidth="1.4" opacity=".55" />
        </g>
      ) : shape === '拿铁' ? (
        <g>
          <ellipse cx="150" cy="114" rx="40" ry="10" fill={CREAM} stroke={p.line} strokeWidth="2.2" />
          {/* 拿铁拉花：主料色画一片叶子 */}
          <path d="M150,112 q-4,-8 4,-14 q10,-7 3,-15" fill="none" stroke={ing.fill} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M150,112 q-1,-7 2,-12" fill="none" stroke={ing.deep} strokeWidth="1.6" strokeLinecap="round" opacity=".6" />
          <path d="M124,86 q6,-14 0,-26 M176,84 q6,-14 0,-26" stroke={p.deep} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".35" />
        </g>
      ) : (
        <g>
          {/* 奶盖 / 特调：奶盖层 + 顶上撒主料 */}
          <path d="M113,124 L187,124 L184,152 Q150,164 116,152 Z" fill={CREAM} opacity=".94" />
          <ellipse cx="150" cy="114" rx="40" ry="10" fill={CREAM} stroke={p.line} strokeWidth="2.2" />
          <g opacity=".85">
            <circle cx="136" cy="112" r="3.2" fill={ing.deep} />
            <circle cx="148" cy="109" r="2.6" fill={ing.fill} />
            <circle cx="160" cy="113" r="3" fill={ing.deep} />
            <circle cx="170" cy="109" r="2.2" fill={ing.fill} />
          </g>
          {/* 杯底的主料（珍珠 / 谷粒） */}
          <circle cx="136" cy="212" r="6" fill={ing.deep} opacity=".72" />
          <circle cx="152" cy="219" r="6" fill={ing.deep} opacity=".72" />
          <circle cx="167" cy="210" r="6" fill={ing.deep} opacity=".72" />
        </g>
      )}
    </g>
  )
}

function Bowl({ p, ing, shape }) {
  return (
    <g>
      <ellipse cx="150" cy="238" rx="62" ry="11" fill="#000" opacity=".07" />
      {/* 碗身 */}
      <path d="M90,168 C96,232 204,232 210,168 Z" fill={p.body} stroke={p.line} strokeWidth="2.4" strokeLinejoin="round" />
      <ellipse cx="150" cy="168" rx="60" ry="15" fill={p.mid} stroke={p.line} strokeWidth="2.2" />

      {shape === '炊饭' ? (
        <g>
          {/* 米饭山：颗粒 + 主料配料 */}
          <ellipse cx="150" cy="162" rx="47" ry="13" fill={CREAM} />
          {[[124, 158], [138, 152], [152, 157], [166, 151], [178, 158], [132, 165], [148, 164], [164, 166]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="4" ry="2.4" fill="#E4DCCB" />
          ))}
          <circle cx="140" cy="156" r="5" fill={ing.fill} stroke={ing.deep} strokeWidth="1.2" />
          <circle cx="158" cy="153" r="4.4" fill={ing.fill} stroke={ing.deep} strokeWidth="1.2" />
          <circle cx="170" cy="159" r="4.8" fill={ing.fill} stroke={ing.deep} strokeWidth="1.2" />
        </g>
      ) : shape === '浓汤' ? (
        <g>
          {/* 浓汤：漩涡 + 香草碎 + 奶花 */}
          <ellipse cx="150" cy="168" rx="47" ry="10" fill={ing.light} opacity=".95" />
          <path d="M118,168 q18,-9 34,0 q16,9 30,0" fill="none" stroke={ing.fill} strokeWidth="4" strokeLinecap="round" opacity=".8" />
          <path d="M132,164 q10,-5 22,0" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity=".55" />
          <circle cx="176" cy="163" r="2.6" fill={ing.deep} />
          <circle cx="126" cy="171" r="2.2" fill={ing.deep} />
          <circle cx="146" cy="172" r="2.4" fill={ing.deep} />
        </g>
      ) : (
        <g>
          {/* 汤面 / 暖碗：面条 + 主料切片 */}
          <ellipse cx="150" cy="168" rx="47" ry="10" fill={ing.light} opacity=".92" />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M${116 + i * 12},166 q9,7 18,0 q9,-7 18,0`}
              stroke={CREAM}
              strokeWidth="2.8"
              fill="none"
              strokeLinecap="round"
              opacity=".9"
            />
          ))}
          <circle cx="132" cy="161" r="6.5" fill={ing.fill} stroke={ing.deep} strokeWidth="1.4" />
          <circle cx="132" cy="161" r="2.4" fill={ing.light} />
          <circle cx="170" cy="162" r="6.5" fill={ing.fill} stroke={ing.deep} strokeWidth="1.4" />
          <circle cx="170" cy="162" r="2.4" fill={ing.light} />
          <path d="M128,140 q8,-16 0,-30 q-8,-14 0,-28 M172,142 q8,-16 0,-30" stroke={p.deep} strokeWidth="2.6" fill="none" strokeLinecap="round" opacity=".35" />
        </g>
      )}
      <ellipse cx="150" cy="232" rx="24" ry="6" fill={p.deep} opacity=".3" />
    </g>
  )
}

function Plate({ p, ing }) {
  return (
    <g>
      <ellipse cx="150" cy="240" rx="72" ry="10" fill="#000" opacity=".06" />
      <circle cx="150" cy="182" r="64" fill={p.body} stroke={p.line} strokeWidth="2.4" />
      <circle cx="150" cy="182" r="51" fill={CREAM} opacity=".92" />
      {/* 三样菜：主料团 + 配菜块 + 绿叶 */}
      <circle cx="130" cy="168" r="19" fill={ing.fill} stroke={ing.deep} strokeWidth="1.8" />
      <circle cx="124" cy="162" r="6" fill="#fff" opacity=".35" />
      <rect x="150" y="150" width="34" height="28" rx="9" fill={ing.light} stroke={p.line} strokeWidth="1.6" />
      <path d="M163,201 q18,-18 36,-3 q-16,14 -36,3 Z" fill={p.body} stroke={p.line} strokeWidth="1.6" />
      <path d="M165,199 q17,-9 32,-1" stroke={p.line} strokeWidth="1.2" fill="none" opacity=".45" />
      {/* 撒的主料碎 */}
      <circle cx="110" cy="199" r="3.6" fill={ing.deep} opacity=".65" />
      <circle cx="192" cy="178" r="3" fill={ing.deep} opacity=".65" />
      <circle cx="146" cy="205" r="2.6" fill={ing.deep} opacity=".55" />
    </g>
  )
}

function Cake({ p, ing, shape }) {
  return (
    <g>
      <ellipse cx="150" cy="240" rx="76" ry="12" fill="#000" opacity=".07" />
      <ellipse cx="150" cy="236" rx="72" ry="12" fill={p.mid} stroke={p.line} strokeWidth="1.8" />

      {shape === '挞' ? (
        <g>
          {/* 塔壳 + 卡士达 + 主料水果 */}
          <path d="M104,168 q0,50 46,56 q46,-6 46,-56 l-6,-6 q-40,12 -80,0 Z" fill={p.deep} stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
          <ellipse cx="150" cy="160" rx="42" ry="14" fill="#F2D9A6" stroke={p.line} strokeWidth="2" />
          <circle cx="134" cy="157" r="7.5" fill={ing.fill} stroke={ing.deep} strokeWidth="1.4" />
          <circle cx="152" cy="152" r="8.5" fill={ing.fill} stroke={ing.deep} strokeWidth="1.4" />
          <circle cx="168" cy="159" r="6.5" fill={ing.fill} stroke={ing.deep} strokeWidth="1.4" />
          <ellipse cx="150" cy="148" rx="16" ry="4" fill="#fff" opacity=".4" />
        </g>
      ) : shape === '布丁' ? (
        <g>
          {/* 焦糖布丁：穹顶 + 焦糖淋面 */}
          <path d="M112,208 Q112,138 150,138 Q188,138 188,208 Z" fill="#F2D9A6" stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M116,158 Q150,142 184,158 Q186,172 150,176 Q114,172 116,158 Z" fill={ing.deep} opacity=".82" />
          <path d="M150,176 q-3,14 -12,20 M150,176 q4,12 14,16" stroke={ing.deep} strokeWidth="3" fill="none" strokeLinecap="round" opacity=".5" />
          <circle cx="150" cy="128" r="8" fill={ing.fill} stroke={ing.deep} strokeWidth="1.4" />
          <path d="M150,120 q4,-12 13,-15" stroke={ing.deep} strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      ) : shape === '奶冻' ? (
        <g>
          {/* 奶冻：倒模圆柱 + 主料酱池 */}
          <ellipse cx="150" cy="222" rx="58" ry="12" fill={ing.fill} opacity=".55" />
          <path d="M116,150 L184,150 L176,214 Q150,224 124,214 Z" fill={CREAM} stroke={p.line} strokeWidth="2.2" strokeLinejoin="round" />
          <ellipse cx="150" cy="150" rx="34" ry="10" fill="#fff" opacity=".7" stroke={p.line} strokeWidth="1.8" />
          <path d="M132,158 q10,8 24,2 q12,-5 20,4" stroke={ing.fill} strokeWidth="3.4" fill="none" strokeLinecap="round" opacity=".8" />
          <circle cx="150" cy="140" r="7" fill={ing.fill} stroke={ing.deep} strokeWidth="1.4" />
        </g>
      ) : (
        <g>
          {/* 蛋糕：分层切块 + 奶油 + 主料莓果 */}
          <path d="M105,152 L195,152 L195,224 Q150,238 105,224 Z" fill={p.body} stroke={p.line} strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M126,176 L126,216 M150,172 L150,224 M174,176 L174,216" stroke="#fff" strokeOpacity=".3" strokeWidth="3" strokeLinecap="round" />
          <path
            d="M103,152 q9,-15 19,-6 q9,-17 19,-5 q9,-17 20,-5 q10,-15 20,-6 q11,-10 14,22 Z"
            fill={CREAM}
            stroke={p.line}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="150" cy="116" r="11" fill={ing.fill} stroke={ing.deep} strokeWidth="1.6" />
          <circle cx="146" cy="112" r="3" fill="#fff" opacity=".5" />
          <path d="M150,106 q4,-13 13,-17" stroke={ing.deep} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </g>
      )}
    </g>
  )
}

function Bread({ p, ing, shape }) {
  return (
    <g>
      <ellipse cx="150" cy="240" rx="66" ry="11" fill="#000" opacity=".07" />
      {shape === '薄饼' ? (
        <g>
          {/* 卷饼：两根斜放的卷 + 露出的主料馅 */}
          <g transform="rotate(-14 150 190)">
            <rect x="92" y="164" width="116" height="40" rx="20" fill="#EFD9A8" stroke={p.line} strokeWidth="2.2" />
            <ellipse cx="202" cy="184" rx="8" ry="16" fill={ing.fill} stroke={ing.deep} strokeWidth="1.6" />
            <path d="M110,172 q40,-6 80,0 M110,196 q40,6 80,0" stroke={p.line} strokeWidth="1.2" fill="none" opacity=".3" />
          </g>
          <circle cx="112" cy="216" r="5" fill={ing.fill} opacity=".8" />
          <circle cx="128" cy="224" r="4" fill={ing.deep} opacity=".6" />
        </g>
      ) : shape === '面包' ? (
        <g>
          {/* 圆面包：割纹 + 面粉 + 主料点缀 */}
          <ellipse cx="150" cy="188" rx="62" ry="52" fill={p.deep} stroke={p.line} strokeWidth="2.4" />
          <path d="M118,166 q22,18 8,44 M150,158 q-8,26 6,46 M182,168 q-20,18 -6,42" stroke={p.line} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".5" />
          <ellipse cx="132" cy="158" rx="6" ry="3" fill="#fff" opacity=".5" />
          <ellipse cx="170" cy="150" rx="4.4" ry="2.4" fill="#fff" opacity=".4" />
          <circle cx="150" cy="232" r="5.5" fill={ing.fill} stroke={ing.deep} strokeWidth="1.4" />
        </g>
      ) : (
        <g>
          {/* 吐司：黄油块用主料色 */}
          <path
            d="M99,156 q0,-54 51,-54 q51,0 51,54 l0,70 q0,15 -15,15 l-72,0 q-15,0 -15,-15 Z"
            fill={p.deep}
            stroke={p.line}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path
            d="M112,160 q0,-39 38,-39 q38,0 38,39 l0,62 q0,11 -11,11 l-54,0 q-11,0 -11,-11 Z"
            fill={CREAM}
            stroke={p.line}
            strokeWidth="1.5"
            opacity=".96"
          />
          <rect x="128" y="176" width="46" height="24" rx="6" fill={ing.fill} stroke={ing.deep} strokeWidth="1.4" />
          <circle cx="151" cy="188" r="3.4" fill={ing.light} />
          <path d="M118,216 q32,7 64,0" stroke={p.line} strokeWidth="1.4" fill="none" opacity=".3" />
          <ellipse cx="134" cy="150" rx="4" ry="2.6" fill={ing.deep} opacity=".45" />
          <ellipse cx="156" cy="142" rx="4" ry="2.6" fill={ing.deep} opacity=".45" />
          <ellipse cx="172" cy="156" rx="4" ry="2.6" fill={ing.deep} opacity=".45" />
        </g>
      )}
    </g>
  )
}

const DRAW = { cup: Cup, bowl: Bowl, plate: Plate, cake: Cake, bread: Bread }

// 不同形态用不同深浅的城市底色 —— 否则同一座城市的 8 张卡会是一模一样的色块
const BG_TINT = { cup: 0.9, bowl: 0.8, plate: 0.85, cake: 0.74, bread: 0.92 }

export default function DishArt({
  kind = 'cup',
  hex = '#A9B98F',
  city = '',
  cityEn = '',
  main = '',
  shape = '',
  code = '',
  label = '',
  en = '',
  compact = false,
}) {
  const raw = useId()
  const gid = raw.replace(/[^a-zA-Z0-9]/g, '')
  const Body = DRAW[kind] || Cup
  const ing = ingredient(main)

  const p = {
    body: hex,
    light: tint(hex, 0.42),
    mid: tint(hex, 0.18),
    deep: shade(hex, 0.3),
    line: shade(hex, 0.55),
  }

  // 同城不同菜再抖一点底色深浅（确定性：主料+形态 hash）
  const jitter = (hashStr(`${main}${shape}`) % 5) * 0.028
  const bgTint = Math.min(0.96, (BG_TINT[kind] || 0.88) + jitter)

  return (
    <svg
      className={`dish-art${compact ? ' is-compact' : ''}`}
      viewBox="0 0 300 300"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label ? `${label} 手绘插图` : 'AI 手绘菜品'}
    >
      <defs>
        <linearGradient id={`bg${gid}`} x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0" stopColor={tint(hex, Math.min(0.96, bgTint + 0.06))} />
          <stop offset="1" stopColor={tint(hex, Math.max(0.5, bgTint - 0.14))} />
        </linearGradient>
        <filter id={`grain${gid}`} x="0" y="0" width="300" height="300">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      <rect x="0" y="0" width="300" height="300" fill={`url(#bg${gid})`} />

      <Body p={p} ing={ing} shape={shape} />

      {/* 纸纹 / 蜡笔颗粒 */}
      <rect
        x="0"
        y="0"
        width="300"
        height="300"
        filter={`url(#grain${gid})`}
        opacity=".13"
        style={{ mixBlendMode: 'multiply' }}
      />

      {/* 手写体菜名 */}
      <g className="da-text">
        <text x="20" y="34" fontSize="10" letterSpacing="1.6" fill={shade(hex, 0.5)} opacity=".72" fontFamily="Nunito, Verdana, sans-serif">
          {cityEn}
        </text>
        <text x="280" y="34" fontSize="10" textAnchor="end" letterSpacing="1.2" fill={shade(hex, 0.5)} opacity=".6" fontFamily="Nunito, Verdana, sans-serif">
          {code}
        </text>
        <path d="M20,252 L280,252" stroke={shade(hex, 0.45)} strokeWidth="1" opacity=".2" />
        <text x="150" y="276" fontSize="21" textAnchor="middle" fill="#3D3832" fontFamily="Kaiti SC, STKaiti, KaiTi, PingFang SC, serif">
          {label}
        </text>
        <text x="150" y="291" fontSize="8.5" textAnchor="middle" letterSpacing="1.1" fill={shade(hex, 0.45)} opacity=".7" fontFamily="Nunito, Verdana, sans-serif">
          {en}
        </text>
      </g>
    </svg>
  )
}
