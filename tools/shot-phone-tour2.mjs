// 补充取景：世界菜单页 + 软软的小屋（宠物页），手机竖屏 390×844 @3x。
// 用法：node tools/shot-phone-tour2.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const url = 'http://127.0.0.1:8080/'
const outDir = '/tmp/phone-tour2'

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const sock = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => { sock.addEventListener('open', res, { once: true }); sock.addEventListener('error', rej, { once: true }) })

let nextId = 0
const pending = new Map()
let sid
sock.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject, timer } = pending.get(m.id)
    clearTimeout(timer); pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
  }
})
const send = (method, params = {}, session = sid) => new Promise((resolve, reject) => {
  const id = ++nextId
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')) }, 60000)
  pending.set(id, { resolve, reject, timer })
  sock.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
})
const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = (expr, t = 30000) => js(`new Promise((res, rej)=>{const s=performance.now();const c=()=>{if(${expr})return res(true);if(performance.now()-s>${t})return rej(new Error('等不到 '+${JSON.stringify(expr)}));setTimeout(c,120)};c()})`)

const one = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(outDir, name + '.png'), Buffer.from(r.data, 'base64')); console.log('ONE ', name) }
const full = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(outDir, name + '.png'), Buffer.from(r.data, 'base64')); console.log('FULL', name) }

await mkdir(outDir, { recursive: true })

const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true }, null)
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId }, null)
sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{ Math.random=()=>0; })();` })

await send('Page.navigate', { url })
await waitFor(`document.querySelector('.home-page')`)
await js(`localStorage.clear()`)
await send('Page.navigate', { url })
await waitFor(`document.querySelector('.home-page')`)
await js(`document.fonts.ready.then(()=>true)`)
await sleep(800)

// 跳过引导
if (await js(`!!document.querySelector('.ob-backdrop')`)) {
  await js(`document.querySelector('.ob-skip').click()`)
  await waitFor(`!document.querySelector('.ob-backdrop')`)
  await sleep(500)
}

// ===== 世界菜单 =====
await waitFor(`document.querySelector('.world-entry')`)
await js(`document.querySelector('.world-entry').click()`)
await waitFor(`document.querySelector('.world-page')`)
await js(`document.fonts.ready.then(()=>true)`)
await sleep(1000)
await one('01_世界菜单_首屏')      // 空运来信明信片 + 城市 chips

// 菜卡区（世界菜单整页图多，captureBeyondViewport 易超时 → 滚到菜卡网格截一屏）
await js(`document.querySelector('.product-grid').scrollIntoView({block:'start'})`)
await sleep(600)
await one('02_世界菜单_菜卡')

// 翻面：点第一张菜卡，AI 想象图 → 手绘卡（DishArt）
const hasFlip = await js(`!!document.querySelector('.world-card .flip-toggle')`)
if (hasFlip) {
  await js(`document.querySelector('.world-card .flip-toggle').click()`)
  await sleep(700)
  await js(`document.querySelector('.world-card').scrollIntoView({block:'center'})`)
  await sleep(400)
  await one('03_世界菜单_翻面')
}

// 返回首页
await js(`document.querySelector('.world-page .menu-button').click()`)
await waitFor(`document.querySelector('.home-page')`)
await sleep(600)

// ===== 软软的小屋 =====
await js(`[...document.querySelectorAll('.tabbar-pp button')].find(b => /软软/.test(b.textContent)).click()`)
await waitFor(`document.querySelector('.pet-hero')`)
await js(`document.fonts.ready.then(()=>true)`)
await sleep(900)
await one('04_软软小屋_首屏')
await full('05_软软小屋_整页')

await send('Target.disposeBrowserContext', { browserContextId }, null).catch(() => {})
sock.close()
console.log('DONE →', outDir)
