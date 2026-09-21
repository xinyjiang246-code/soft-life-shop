// 从 src/dishForge.js 里**解析**出「世界菜单每一道菜可能需要的那张图」清单。
//
// 为什么不手抄：10 座城市 × (drinks + eats + sweets) 一共 122 条，
// 手抄一定会漏/会错，而且以后改了 dishForge 就对不上了。
//
// 用法：
//   node tools/world-art-manifest.mjs            # 打印统计 + 缺图清单
//   node tools/world-art-manifest.mjs --json     # 输出完整 JSON（给生成脚本用）
//
// 关键设计（2026-09-20）：
//   世界菜单的菜每天用「城市 × 主料 × 手法 × 形态」现编，菜名天天变。
//   要让「图」和「菜名」永远对得上，图就必须挂在**最稳定**的那个维度上 —— 主料。
//   所以键 = `${cityId}-${pool}-${slug(ingredientEn)}`，一共 122 张，
//   而同一天同一桌里 8 道菜的主料互不相同（index 轮转保证），所以不会撞图。
import { readFileSync } from 'node:fs'

const SRC = new URL('../src/dishForge.js', import.meta.url)
const text = readFileSync(SRC, 'utf8')

/** 把英文名变成文件名能用的 slug：'YU TOFU' → 'yu-tofu' */
export function slug(en) {
  return String(en).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// 粗切出每个城市对象：从 { id: '...' 开始，到下一个同级 } 结束
const cityBlocks = [...text.matchAll(/\{\s*\n\s*id: '([a-z]+)',[\s\S]*?\n  \},/g)]
if (cityBlocks.length !== 10) {
  console.error(`❌ 期望解析出 10 座城市，实际 ${cityBlocks.length} —— dishForge.js 的写法变了，先修这个解析器`)
  process.exit(1)
}

const POOLS = [
  ['drinks', '饮品'],
  ['eats', '咸食'],
  ['sweets', '甜点'],
]

const manifest = []
for (const m of cityBlocks) {
  const block = m[0]
  const id = m[1]
  const city = (block.match(/city: '([^']+)'/) || [])[1]
  const cityEn = (block.match(/cityEn: '([^']+)'/) || [])[1]
  const hex = (block.match(/hex: '([^']+)'/) || [])[1]
  if (!city || !cityEn) {
    console.error(`❌ 城市 ${id} 解析不出 city / cityEn`)
    process.exit(1)
  }

  for (const [pool, poolCn] of POOLS) {
    // ⚠️ 数组里嵌着数组，`[\s\S]*?` 会停在第一个内层 `]` 上。
    //    所以用「外层 `],` 后面跟换行」当结束锚点（源码里的排版就是这么写的）。
    const arr = block.match(new RegExp(`${pool}: \\[([\\s\\S]*?)\\],\\n`))
    if (!arr) { console.error(`❌ 城市 ${id} 找不到 ${pool}`); process.exit(1) }
    const pairs = [...arr[1].matchAll(/\['([^']+)', '([^']+)'\]/g)]
    if (!pairs.length) { console.error(`❌ 城市 ${id} 的 ${pool} 是空的`); process.exit(1) }
    for (const p of pairs) {
      const [, cn, en] = p
      manifest.push({ cityId: id, city, cityEn, hex, pool, poolCn, cn, en, slug: slug(en), key: `${id}-${pool}-${slug(en)}` })
    }
  }
}

// 同一个 (city, pool) 里 slug 不能撞 —— 撞了就说明两个食材会共用一张图
const seen = new Map()
for (const it of manifest) {
  if (seen.has(it.key)) {
    console.error(`❌ 键重复：${it.key}（${seen.get(it.key)} / ${it.cn}）`)
    process.exit(1)
  }
  seen.set(it.key, it.cn)
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(manifest, null, 0))
  process.exit(0)
}

// ---------------------------------------------------------------- 生图 prompt
// 风格必须和已上的 13 款商品图 / 12 杯特调 / 10 城照片是**同一只手**：
// 暖米色桌面 + 左侧窗光 + 低饱和土色 + 浅景深。
// 变的是「拍法」——每座城市 4~5 张要一起出现在同一屏，所以至少让机位和桌面轮着换，
// 不然 8 张卡片会像同一张图复制出来的。
const CITY_PROP = {
  kyoto: 'Japanese handmade ceramic ware, unlacquered wood, a folded linen napkin, wabi-sabi restraint',
  seoul: 'dark stone bowl, brass chopsticks, matte black tableware, generous portions',
  bangkok: 'colourful enamel ware, banana leaf, small condiment bowls, tropical warmth',
  hanoi: 'worn metal tray, fresh herb sprigs, small ceramic dishes, old-quarter corner-shop feel',
  taipei: 'small porcelain bowls, bamboo steamer lid nearby, night-market ease',
  chaoshan: 'white porcelain gongfu tea set, tiny cups, clean and precise plating',
  istanbul: 'hammered copper, small tulip glasses, patterned tile, generous spice bowls',
  lisbon: 'blue-and-white painted tile, rustic white ceramic, simple honest plating',
  mexico: 'terracotta ware, woven cloth, dried chillies, saturated colour',
  naples: 'rustic Italian ceramic, plain white plates, olive oil, sunlit simplicity',
}
const SURFACES = ['warm cream linen tablecloth', 'light oak wood', 'pale beige ceramic tile', 'off-white paper placemat']
const ANGLES = [
  'three-quarter angle, the vessel placed slightly off-centre',
  'shot straight on at eye level',
  'close overhead crop, filling most of the frame',
  'slightly from the side, a little negative space on the left',
]
const STYLE = 'soft natural daylight from a window on the left, gentle shadow, muted earthy palette, shallow depth of field, quiet magazine food styling, no people, no text, no logo, no watermark'

function subjectFor(it) {
  const en = it.en.toLowerCase()
  if (it.pool === 'drinks') return `a glass of ${en} drink`
  if (it.pool === 'eats') return `a small ceramic bowl of ${en}, a savoury dish`
  return `a small plate of ${en} dessert`
}

if (process.argv.includes('--prompts')) {
  const lines = []
  manifest.forEach((it, i) => {
    const prompt = [
      `Photograph: ${subjectFor(it)}.`,
      `${it.cityEn} home cooking — ${CITY_PROP[it.cityId]}.`,
      `On a ${SURFACES[i % SURFACES.length]}, ${ANGLES[i % ANGLES.length]}.`,
      STYLE + '.',
    ].join(' ')
    lines.push(`### ${it.key}|${it.city}${it.poolCn}·${it.cn}`)
    lines.push(prompt)
  })
  console.log(lines.join('\n'))
  process.exit(0)
}

// 紧凑清单：给「一条条去生图」的时候对着念，一行一条
if (process.argv.includes('--list')) {
  manifest.forEach((it, i) => {
    console.log(`${String(i + 1).padStart(3)} ${it.key.padEnd(30)} ${it.city} ${it.poolCn} ${it.cn} / ${it.en}`)
  })
  process.exit(0)
}

const byCity = {}
for (const it of manifest) byCity[it.cityId] = (byCity[it.cityId] || 0) + 1
console.log(`共 ${manifest.length} 条（10 城）：`)
for (const [k, v] of Object.entries(byCity)) {
  const c = manifest.find((x) => x.cityId === k)
  console.log(`  ${String(v).padStart(3)}  ${k.padEnd(10)} ${c.city}`)
}

// 顺手看有多少已经生成好了
import { readdirSync, existsSync } from 'node:fs'
const dir = new URL('../src/assets/world/', import.meta.url)
const have = existsSync(dir) ? new Set(readdirSync(dir).map((f) => f.replace(/\.webp$/, ''))) : new Set()
const missing = manifest.filter((it) => !have.has(it.key))
console.log(`\n已有 ${manifest.length - missing.length} / ${manifest.length}，缺 ${missing.length}`)
if (missing.length && missing.length <= 40) {
  for (const m of missing) console.log(`  缺 ${m.key}  (${m.city} ${m.cn} / ${m.en})`)
}
