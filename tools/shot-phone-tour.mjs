// 手机取景：走完整一单（引导 → 首页 → 菜单 → 加购 → 购物袋 → 结算 → 支付 → 配送 → 等满拿凭证 → 评价卡），
// 逐屏出「手机竖屏」截图（390×844 @3x，输出 1170 宽），供分享/小红书配图用。
//
// ⚠️ 等满拿凭证靠注入计时器加速（等待页每秒 1000→20，真实 120 秒约 2 秒走完），产品代码没动。
// 用法：node tools/shot-phone-tour.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const url = 'http://127.0.0.1:8080/'
const outDir = '/tmp/phone-tour'

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
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')) }, 30000)
  pending.set(id, { resolve, reject, timer })
  sock.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
})
const js = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = (expr, t = 30000) => js(`new Promise((res, rej)=>{const s=performance.now();const c=()=>{if(${expr})return res(true);if(performance.now()-s>${t})return rej(new Error('等不到 '+${JSON.stringify(expr)}));setTimeout(c,120)};c()})`)
const clickText = (re) => `(()=>{const b=[...document.querySelectorAll('button')].find(x=>${re}.test(x.textContent));if(!b)return false;b.click();return true})()`

const one = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(outDir, name + '.png'), Buffer.from(r.data, 'base64')); console.log('ONE ', name) }
const full = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(outDir, name + '.png'), Buffer.from(r.data, 'base64')); console.log('FULL', name) }
const clip = async (name, sel, pad = 16) => {
  const box = await js(`(()=>{const e=document.querySelector('${sel}');if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.max(0,r.left-${pad}),y:r.top+scrollY-${pad},width:r.width+${pad*2},height:r.height+${pad*2},scale:1}})()`)
  if (!box) { console.log('CLIP SKIP (no ' + sel + ')'); return }
  const r = await send('Page.captureScreenshot', { format: 'png', clip: box })
  await writeFile(join(outDir, name + '.png'), Buffer.from(r.data, 'base64'))
  console.log('CLIP', name)
}

await mkdir(outDir, { recursive: true })

const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true }, null)
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId }, null)
sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(()=>{ Math.random=()=>0; const si=window.setInterval; window.setInterval=(fn,ms,...a)=>si(fn, ms===1000?20:ms, ...a); })();`,
})

await send('Page.navigate', { url })
await waitFor(`document.querySelector('.home-page')`)
await js(`localStorage.clear()`)
await send('Page.navigate', { url })
await waitFor(`document.querySelector('.home-page')`)
await js(`document.fonts.ready.then(()=>true)`)
await sleep(800)

// 1) 引导页（首次进入的 overlay，占满一屏 → 单屏）
if (await js(`!!document.querySelector('.ob-backdrop')`)) {
  await one('01_引导页')
  await js(`document.querySelector('.ob-skip').click()`)
  await waitFor(`!document.querySelector('.ob-backdrop')`)
  await sleep(500)
} else {
  console.log('（无引导 overlay，跳过）')
}

// 2) 首页：首屏单屏（封面）+ 整页长图
await one('02_首页_首屏')
await full('02_首页_长图')

// 3) 进店 → 菜单
await waitFor(`document.querySelectorAll('.shop-row').length > 0`)
await js(`document.querySelector('.shop-row').click()`)
await waitFor(`document.querySelectorAll('.add-button').length > 0`)
await sleep(500)
await full('03_店铺菜单')

// 4) 加购 → 购物袋
await js(`[...document.querySelectorAll('.add-button')].slice(0,2).forEach(b=>b.click())`)
await sleep(150)
await js(`[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())`)
await waitFor(`document.querySelector('.bag-button')`)
await js(`document.querySelector('.bag-button').click()`)
await waitFor(`[...document.querySelectorAll('button')].some(x=>/去结账|结算|下单/.test(x.textContent))`)
await sleep(500)
await full('04_购物袋')

// 5) 结算页（地址卡 + 揭晓真相那句 + 提交）
await js(clickText('/去结账|结算|下单/'))
await waitFor(`[...document.querySelectorAll('button')].some(x=>/确认|下单|提交/.test(x.textContent))`)
await sleep(700)
await full('05_结算页')

// 6) 支付面板 → 配送等待页（单屏：骑手 + 额度）
await js(clickText('/确认|下单|提交/'))
await waitFor(`document.querySelector('.pay-confirm')`, 15000)
await js(`document.querySelector('.pay-confirm').click()`)
await waitFor(`document.querySelectorAll('.pay-key').length > 0`, 15000)
for (let i = 0; i < 6; i++) { await js(`(()=>{const ks=[...document.querySelectorAll('.pay-key')].filter(k=>!k.classList.contains('blank'));ks[0]&&ks[0].click()})()`); await sleep(150) }
await waitFor(`document.querySelector('.wait-pet-btn')`, 20000)
await sleep(900)
await one('06_配送等待页')

// 7) 等满 → 结局页凭证（整页长图 + 凭证滚到视口单屏）
await waitFor(`document.querySelector('.ending-card')`, 60000)
await waitFor(`document.querySelector('.wait-receipt')`, 20000)
await js(`document.fonts.ready.then(()=>true)`)
await sleep(700)
await full('07_结局凭证页')
await js(`document.querySelector('.wait-receipt').scrollIntoView({block:'center'})`)
await sleep(500)
await one('08_凭证特写')

// 8) 评价卡（结局页里的「这一单，说点什么」）
if (await js(`!!document.querySelector('.review-card')`)) {
  await js(`document.querySelector('.review-card').scrollIntoView({block:'center'})`)
  await sleep(500)
  await one('09_评价卡')
} else {
  console.log('（无评价卡）')
}

await send('Target.disposeBrowserContext', { browserContextId }, null).catch(() => {})
sock.close()
console.log('DONE →', outDir)
