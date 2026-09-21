// 扫 src/assets/world/*.webp → 生成 src/worldArt.js（静态 import 表）。
//
// 为什么要有这一步：
//   Vite 只能静态分析 `import x from './assets/world/xxx.webp'` —— 用
//   `import.meta.glob` 或字符串拼路径都会让图片悄悄不进 dist（构建还照样绿）。
//   122 张手写 import 一定会漏，所以让脚本生成。
//
// 用法：
//   node tools/world-art-map.mjs          # 生成/更新 src/worldArt.js
//   node tools/world-art-map.mjs --check  # 只检查有没有新图没进表（CI/守卫用）
import { readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'

const DIR = new URL('../src/assets/world/', import.meta.url)
const OUT = new URL('../src/worldArt.js', import.meta.url)

const files = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => f.endsWith('.webp')).sort()
  : []

if (!files.length) {
  console.error('❌ src/assets/world/ 里一张 .webp 都没有 —— 先跑 tools/worldArt.py 出图')
  process.exit(1)
}

const keys = files.map((f) => f.replace(/\.webp$/, ''))
const varOf = (key) => `w_${key.replace(/-/g, '_')}`

const lines = [
  '// ⚠️ 这个文件由 tools/world-art-map.mjs **自动生成**，不要手改 ——',
  '//    新增/替换世界菜单配图后重跑：`node tools/world-art-map.mjs`。',
  '//',
  '// 键 = `${城市id}-${drinks|eats|sweets}-${主料英文 slug}`（见 tools/world-art-manifest.mjs）。',
  '// 图挂在**主料**这一维上，因为菜名每天现编、只有主料是稳定的。',
  ...files.map((f, i) => `import ${varOf(keys[i])} from './assets/world/${f}'`),
  '',
  'export const WORLD_ART = {',
  ...keys.map((k) => `  '${k}': ${varOf(k)},`),
  '}',
  '',
  `// 已入库张数（清单总数 122，见 tools/world-art-manifest.mjs）`,
  `export const WORLD_ART_COUNT = ${keys.length}`,
  '',
]

const text = lines.join('\n')

if (process.argv.includes('--check')) {
  const old = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (old !== text) {
    console.error(`❌ src/worldArt.js 和 src/assets/world/ 不一致（磁盘上 ${keys.length} 张）—— 重跑 node tools/world-art-map.mjs`)
    process.exit(1)
  }
  console.log(`✅ src/worldArt.js 与 ${keys.length} 张图一致`)
  process.exit(0)
}

writeFileSync(OUT, text)
console.log(`✅ src/worldArt.js 已更新：${keys.length} 张`)
