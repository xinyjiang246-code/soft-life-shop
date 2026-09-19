#!/usr/bin/env node
/**
 * snapshot.mjs —— 项目完整性快照 / 校验
 *
 * 用途：**在你做任何「删除」动作之前留一份底**，删完立刻验证有没有东西被连带删掉。
 * 典型场景：删掉某个 AI agent / 编辑器 / 会话之后，担心它改过的文件跟着消失。
 *
 *   node tools/snapshot.mjs save     生成快照：源码快照/校验清单.txt（每个文件的 md5）+ 一份 tar.gz
 *   node tools/snapshot.mjs check    对比清单，报出「少了 / 变了 / 多了」
 *
 * 退出码：check 发现任何「少了」或「变了」都返回 1，方便接进脚本。
 *
 * 覆盖范围：项目里**除了** node_modules / dist / published-site 之外的一切
 * （含 .workbuddy 笔记、生图原始、预览截图——这些不在 git 里，删了就真没了，
 *   所以是本工具重点保护的对象）。
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ⚠️ 必须用 fileURLToPath，不能用 new URL(import.meta.url).pathname。
//    pathname 是按 URL 规则**百分号编码**的：项目路径里有中文时，
//    它给出 /Users/s/Desktop/%E8%99%9A%E6%8B%9F…，
//    脚本会在桌面上真建出一个乱码目录，而且 existsSync 还会返回 true
//    （因为那个乱码目录确实被建出来了）—— 2026-09-20 实际踩过。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, '源码快照')
const MANIFEST = path.join(OUT_DIR, '校验清单.txt')

// 可再生产物与依赖：丢了也能重建，不进快照（否则快照几百 MB、还全是噪声）
const SKIP_DIRS = new Set(['node_modules', 'dist', 'published-site', '源码快照', '.git'])

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(p, out)
    } else if (e.isFile()) {
      out.push(p)
    }
  }
  return out
}

function md5(file) {
  const h = createHash('md5')
  h.update(fs.readFileSync(file))
  return h.digest('hex')
}

function scan() {
  const map = new Map()
  for (const f of walk(ROOT)) {
    const rel = path.relative(ROOT, f)
    map.set(rel, { md5: md5(f), size: fs.statSync(f).size })
  }
  return map
}

const [cmd] = process.argv.slice(2)

if (cmd === 'save') {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const map = scan()
  const lines = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rel, v]) => `${v.md5}  ${String(v.size).padStart(10)}  ${rel}`)
  fs.writeFileSync(MANIFEST, lines.join('\n') + '\n', 'utf-8')

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const zip = path.join(OUT_DIR, `项目快照_${stamp}.tar.gz`)
  // 用 tar 而不是 zip：macOS 的 tar 是 bsdtar，中文文件名不会乱码
  // ⚠️ 必须排除 .git：它现在是 170MB（历史里还压着已清除的 50MB 参考图）。
  //    快照要保护的是**工作区文件**，git 历史由 git 自己负责，不必重复打包。
  execFileSync('tar', [
    '-czf', zip,
    '--exclude=node_modules', '--exclude=dist', '--exclude=published-site',
    '--exclude=源码快照', '--exclude=.git',
    '-C', ROOT, '.',
  ])
  const mb = (fs.statSync(zip).size / 1e6).toFixed(1)
  console.log(`✅ 快照完成`)
  console.log(`   清单：${path.relative(ROOT, MANIFEST)}（${map.size} 个文件）`)
  console.log(`   压缩包：${path.relative(ROOT, zip)}（${mb} MB）`)
  console.log(`\n   删完东西后跑：node tools/snapshot.mjs check`)
} else if (cmd === 'check') {
  if (!fs.existsSync(MANIFEST)) {
    console.error(`❌ 找不到 ${path.relative(ROOT, MANIFEST)}，先跑 node tools/snapshot.mjs save`)
    process.exit(2)
  }
  const want = new Map()
  for (const line of fs.readFileSync(MANIFEST, 'utf-8').split('\n')) {
    // ⚠️ 不能用 indexOf('  ') 切：size 是右对齐补位过的，前面就是空格，
    //    会切在数字前头。必须用正则一次抓到底。
    const m = line.match(/^([0-9a-f]{32})\s+(\d+)\s+(.*)$/)
    if (!m) continue
    want.set(m[3], { md5: m[1], size: Number(m[2]) })
  }
  const now = scan()

  const missing = [...want.keys()].filter((k) => !now.has(k))
  const changed = [...want.keys()].filter((k) => now.has(k) && now.get(k).md5 !== want.get(k).md5)
  const added = [...now.keys()].filter((k) => !want.has(k))

  const say = (title, list, max = 20) => {
    if (!list.length) return
    console.log(`\n${title}（${list.length}）`)
    for (const x of list.slice(0, max)) console.log(`   ${x}`)
    if (list.length > max) console.log(`   …还有 ${list.length - max} 个`)
  }

  if (!missing.length && !changed.length) {
    console.log(`✅ 快照里的 ${want.size} 个文件一个没少、一个没变。`)
  } else {
    say('🔴 少了（这是最要紧的）', missing)
    say('🟡 内容变了', changed)
  }
  if (added.length) say('ℹ️ 新增（正常，可能就是你刚改的）', added)

  // 顺带报一下那几个「不在 git 里、删了就真没了」的目录还在不在
  const precious = ['宠物生图原始', '图标生图原始', '商品生图原始', '参考图', '.workbuddy/memory', '预览截图']
  const gone = precious.filter((d) => !fs.existsSync(path.join(ROOT, d)))
  console.log(
    gone.length
      ? `\n🔴 这几个「不在 git 里、删了就真没了」的目录不见了：${gone.join('、')}`
      : `\n✅ 未进 git 的原始素材目录都在：${precious.join('、')}`
  )

  process.exit(missing.length || changed.length ? 1 : 0)
} else {
  console.log('用法：node tools/snapshot.mjs save | check')
  process.exit(2)
}
