#!/usr/bin/env node
/**
 * 世界菜单 chip 守卫（09-24 用户「放在甜一点旁边，做成同一个按钮家族」）
 * 断言三件事：
 *   ① 首页首屏：.mood-chip.is-world 可见（齿孔虚线边 + 空运 · 城市）；
 *   ② 点它直达 world 页；
 *   ③ 防回归：旧悬浮邮戳 .world-stamp 已拆干净（DOM/CSS 都不该再有）。
 * 跑法：先起 dist 预览 8080 + Chrome CDP 9222，再 node 本脚本。
 */
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/'

const ok = (name, cond, extra = '') =>
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`)

const CDP = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(BASE), { method: 'PUT' }).then(r => r.json())
const ws = new WebSocket(CDP.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let id = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const one = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id
  pending.set(i, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)))
  ws.send(JSON.stringify({ id: i, method, params }))
})
const js = async (expr) => {
  const r = await one('Runtime.evaluate', { expression: expr, returnByValue: true })
  return r.result.value
}
const waitFor = async (expr, ms = 8000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await js(expr)) return true
    await sleep(120)
  }
  return false
}

await one('Page.enable')
await one('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
await one('Page.navigate', { url: BASE })
await sleep(2200)
if (await js(`!!document.querySelector('.ob-backdrop')`)) {
  await js(`document.querySelector('.ob-skip')?.click()`)
  await sleep(500)
}
await js(`document.fonts.ready.then(()=>true)`)
await sleep(400)

// ① chip 在首屏心情行排尾、可见
const chip = await js(`(() => {
  const c = document.querySelector('.mood-chip.is-world')
  if (!c) return { exists: false }
  const r = c.getBoundingClientRect()
  const cs = getComputedStyle(c)
  return {
    exists: true,
    text: c.textContent.trim(),
    onscreen: r.top >= 0 && r.top < innerHeight,
    dashed: cs.borderTopStyle === 'dashed',
    height: Math.round(r.height),
  }
})()`)
ok('① 心情行排尾的世界 chip 可见', chip.exists && chip.onscreen && chip.dashed, `text=${chip.text} dashed=${chip.dashed} h=${chip.height}`)
ok('① chip 高度与心情 chips 同族（≤40px）', chip.height <= 40, `h=${chip.height}`)

// ② 点它直达 world
await js(`document.querySelector('.mood-chip.is-world').click()`)
const onWorld = await waitFor(`!!document.querySelector('.world-page')`)
ok('② 点 chip 直达世界菜单', onWorld)

// ③ 防回归：旧悬浮邮戳拆干净
await one('Page.navigate', { url: BASE })
await sleep(1800)
if (await js(`!!document.querySelector('.ob-backdrop')`)) {
  await js(`document.querySelector('.ob-skip')?.click()`)
  await sleep(400)
}
const stampGone = await js(`!document.querySelector('.world-stamp')`)
ok('③ 旧悬浮邮戳已拆干净', stampGone)

ws.close()
process.exit(0)
