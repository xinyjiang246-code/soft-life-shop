// 一条一条跑守卫 —— 每条之前先把 9222 里残留的 page tab 全部清掉、重开一个干净的 about:blank。
//
// 为什么要这个包装：守卫之间会互相污染。守卫用
//   fetch('http://127.0.0.1:9222/json/list').find(t => t.type === 'page' && /8080/.test(t.url))
// 找标签页 —— **跑完不关**。于是第二条守卫 attach 到第一条留下的那个页，
// 而那个页可能已经走到结算页 / 已经 localStorage 记住了访问状态 →
// 表现为莫名其妙的「等不到 .home-page」「等不到 .tabbar-pp-item」，看着像产品坏了。
// 2026-09-21 全套连跑时 7 条连红，查下来全是这个（改的产品代码没问题）。
//
// 用法：
//   node tools/run-guards.mjs                    # 跑全部
//   node tools/run-guards.mjs verify-home-cover  # 只跑名字里含这个的

import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const CDP = 'http://127.0.0.1:9222'
const filter = process.argv[2] || ''
const url = process.argv[3] || 'http://127.0.0.1:8080/'

const j = async (p) => fetch(CDP + p).then((r) => r.json())

/** 关掉所有 page tab，再开一个干净的 about:blank —— 每条守卫都从同一。一。的起点出发。 */
async function resetTabs() {
  const list = await j('/json/list').catch(() => [])
  for (const t of list) {
    if (t.type !== 'page') continue
    await fetch(`${CDP}/json/close/${t.id}`).catch(() => {})
  }
  await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).catch(() => {})
  await new Promise((r) => setTimeout(r, 350))
}

const files = (await readdir('tools'))
  .filter((f) => /^verify-.*\.mjs$/.test(f) || /^(health-check|check-preview)\.mjs$/.test(f))
  .filter((f) => !filter || f.includes(filter))
  .sort()

const run = (file) =>
  new Promise((res) => {
    const p = spawn(process.execPath, [`tools/${file}`, url], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => res({ code, out }))
  })

let green = 0
const failed = []
for (const f of files) {
  await resetTabs()
  const { code, out } = await run(f)
  const tail = out.split('\n').filter((l) => l.trim()).slice(-1)[0]?.slice(0, 78) || '(无输出)'
  if (code === 0) {
    green += 1
    console.log(`  ✅ ${f.padEnd(30)} ${tail}`)
  } else {
    failed.push(f)
    console.log(`  ❌ ${f.padEnd(30)} ${tail}`)
    console.log(out.split('\n').filter((l) => l.trim()).slice(-14).map((l) => `       ${l.slice(0, 100)}`).join('\n'))
  }
}

console.log(`\n合计：通过 ${green} / 失败 ${failed.length}`)
if (failed.length) console.log('失败：', failed.join(', '))
process.exit(failed.length ? 1 : 0)
