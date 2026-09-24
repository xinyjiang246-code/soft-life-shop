/**
 * 从慢活小铺前端源码 (src/data.js) 抽取真实的店铺与菜单，生成种子数据。
 *
 * 为什么要「改写再求值」而不是直接 import：
 *   data.js 里每件商品都 import 了 .webp 图片，Node 认不了这种导入。
 *   所以我们把 `import X from './x.webp'` 改写成 `const X = './x.webp'`（字符串），
 *   抹掉 `export` 关键字，再用 new Function 求值，把 counters / menuItems 取出来。
 *
 * ⚠️ 这是单向同步：小铺前端仍是数据的「源」，数据库只是副本。
 *    改了菜单要重跑：npm run extract-seed && npm run seed
 *
 * 用法：node scripts/extract-seed.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(SERVER_ROOT, '..')

const DATA_JS = path.join(REPO_ROOT, 'src', 'data.js')
const SEEDS_DIR = path.join(SERVER_ROOT, 'seeds')

if (!fs.existsSync(DATA_JS)) {
  console.error(`找不到源文件：${DATA_JS}`)
  process.exit(1)
}

const source = fs.readFileSync(DATA_JS, 'utf8')

// ① import 默认导入 → 字符串常量；② 去掉 export 关键字
// ⚠️ 替换时要**把引号补回去**：正则的第 2 组是引号本身，第 3 组是不含引号的路径。
//    直接写 `const $1 = $3;` 会生成 `const X = ./assets/x.webp` → 语法错误。
const transformed = source
  .replace(/^import\s+([A-Za-z0-9_$]+)\s+from\s+(['"])([^'"]+)\2;?\s*$/gm, "const $1 = '$3';")
  .replace(/^export\s+/gm, '')

let counters
let menuItems

try {
  // new Function 等价于在模块顶层执行这段代码，再把我们关心的两个变量 return 出来
  const evaluate = new Function(`${transformed}\n;return { counters, menuItems };`)
  ;({ counters, menuItems } = evaluate())
} catch (err) {
  console.error('求值 src/data.js 失败：', err.message)
  process.exit(1)
}

if (!Array.isArray(counters) || !Array.isArray(menuItems)) {
  console.error('未从 data.js 中解析出 counters / menuItems 数组')
  process.exit(1)
}

// —— 店铺 ——
const stores = counters.map((c, index) => ({
  id: c.id,
  name: c.name,
  nameEn: c.nameEn ?? c.id.toUpperCase(),
  tagline: c.tagline ?? '',
  sortOrder: index + 1,
}))

// —— 商品 ——
const yuan = (v) => Math.round(Number(v) * 100)

const items = menuItems.map((m) => ({
  // 原 id（m1 / m13 …）全局唯一，直接当 sku：改价改名都不该动它
  sku: String(m.id).toUpperCase(),
  name: m.name,
  nameCn: m.cn,
  priceCents: yuan(m.price),
  storeId: m.counterId,
  category: m.category,
  tags: Array.isArray(m.tags) ? m.tags : [],
  description: m.description ?? '',
  inStock: true,
  isActive: true,
}))

// —— 自检：种子里不能有重复 sku / 重复「店+名」/ 悬空的 storeId ——
const problems = []
const seenSku = new Set()

for (const item of items) {
  if (seenSku.has(item.sku)) problems.push(`重复 sku：${item.sku}`)
  seenSku.add(item.sku)

  if (!stores.some((s) => s.id === item.storeId)) {
    problems.push(`${item.sku} 的 storeId「${item.storeId}」不在店铺列表里`)
  }
  if (!Number.isInteger(item.priceCents) || item.priceCents < 0) {
    problems.push(`${item.sku} 的价格异常：${item.priceCents}`)
  }
}

const dupName = new Map()
for (const item of items) {
  const key = `${item.storeId}::${item.name}`
  if (dupName.has(key)) problems.push(`同店重名：${key}（${dupName.get(key)} 与 ${item.sku}）`)
  dupName.set(key, item.sku)
}

if (problems.length > 0) {
  console.error('种子数据自检未通过：')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

fs.mkdirSync(SEEDS_DIR, { recursive: true })
fs.writeFileSync(
  path.join(SEEDS_DIR, 'stores.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), source: 'src/data.js#counters', data: stores }, null, 2)}\n`,
)
fs.writeFileSync(
  path.join(SEEDS_DIR, 'items.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), source: 'src/data.js#menuItems', data: items }, null, 2)}\n`,
)

console.log(`✓ 抽取完成：${stores.length} 家店 / ${items.length} 件商品`)
for (const store of stores) {
  const n = items.filter((i) => i.storeId === store.id).length
  console.log(`    ${store.id.padEnd(8)} ${store.name.padEnd(8)} ${String(n).padStart(2)} 件`)
}
console.log(`→ 已写入 ${path.relative(REPO_ROOT, SEEDS_DIR)}/`)
