#!/usr/bin/env node
// 拍「软软 / 团团 两只都在、可切换」的对比图（09-24 用户「两个都要在，切换用哪个」）。
// 跑法：先起 dist 预览 8080 + Chrome CDP 9222，再 node 本脚本。
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/'
const OUT = process.env.OUT_DIR || '预览截图'

const CDP = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(BASE), { method: 'PUT' }).then(r => r.json())
const ws = new WebSocket(CDP.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0; const pending = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const one = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })) })
const js = async (expr) => (await one('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value
const shot = async (file) => { const { data } = await one('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(data, 'base64')); console.log('  →', file) }
const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(expr)) return true; await sleep(120) } return false }

await one('Page.enable')
await one('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
await one('Page.navigate', { url: BASE })
await sleep(2000)
await js(`localStorage.removeItem('soft-life-pets-v1'); localStorage.removeItem('soft-life-pet-v1'); localStorage.removeItem('soft-life-last-screen')`)
await one('Page.navigate', { url: BASE })
await sleep(2000)
if (await js(`!!document.querySelector('.ob-backdrop')`)) { await js(`document.querySelector('.ob-skip')?.click()`); await sleep(500) }

// 进 pet 页
await waitFor(`!!document.querySelector('.tabbar-pp-item')`)
await js(`[...document.querySelectorAll('.tabbar-pp-item')].find(b => b.textContent.includes('软软'))?.click()`)
await waitFor(`!!document.querySelector('.pet-hero')`)
await shot(`${OUT}/2026-09-24-软软小屋-切换器.png`)

// 切狗
await js(`[...document.querySelectorAll('.pet-species-btn')].find(b => b.textContent.includes('团团'))?.click()`)
await sleep(800)
await shot(`${OUT}/2026-09-24-团团小屋-切换器.png`)

ws.close(); process.exit(0)
