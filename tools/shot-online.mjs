// 从**线上**真机走一遍并截图 —— 发布以后用它验收「朋友扫码看到的到底长什么样」。
//
// 用法：node tools/shot-online.mjs <线上URL> <输出.png> [waitMode]
//   waitMode: road（帮他看路，默认） / walk / offline / 空=只截首页
//
// 为什么不能直接把 shot-page.mjs 指到线上：
//   光 compare 首页看不出问题，本产品的关键页面（等待页 · 结算页）**必须走完一趟下单**
//   才进得去，所以这里把「一路点进去」的链路固化下来。
//
// ⚠️ 一定要带 ?v= ：线上 CDN 按 Accept-Encoding 分条目缓存裸 `/`，TTL 约 29 分钟。
//    不带参数去截，很可能截到**上一版**，看着像发布没生效（这是假警报）。
// ⚠️ 前置：9222 上要有带调试端口的浏览器（见 skill「环境」一节）。
import { writeFile } from 'node:fs/promises'

const url = process.argv[2]
const out = process.argv[3]
const mode = process.argv[4] || 'road'
if (!url || !out) { console.error('用法: node tools/shot-online.mjs <URL> <out.png> [road|walk|offline]'); process.exit(1) }

// 自己加 v=：没它就等着看旧版
const target = url.includes('?') ? `${url}&v=${Date.now()}` : `${url}?v=${Date.now()}`

const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const tab = list.find((t) => t.type === 'page') ||
  await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((x) => x.json())

const ws = new WebSocket(tab.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
await new Promise((res) => ws.addEventListener('open', res))
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  }
})
const send = (method, params = {}) =>
  new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => {
  const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  if (o.exceptionDetails) throw new Error(JSON.stringify(o.exceptionDetails).slice(0, 240))
  return o.result.value
}
const waitFor = async (expr, ms = 30000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await js(`!!(${expr})`)) return true
    await sleep(300)
  }
  throw new Error('等不到: ' + expr)
}
const clickWhen = async (sel, ms = 20000) => {
  await waitFor(`document.querySelector(${JSON.stringify(sel)})`, ms)
  await js(`document.querySelector(${JSON.stringify(sel)}).click()`)
}
const clickTextWhen = async (re, ms = 20000) => {
  await waitFor(`[...document.querySelectorAll('button')].some(x=>${re}.test(x.textContent))`, ms)
  await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>${re}.test(x.textContent)); b&&b.click()})()`)
}
// 引导层会盖住整个首屏 —— 进来先跳过，否则后面每一步都点不到
const skipOnboarding = async () => {
  const has = await js(`!!document.querySelector('.ob-skip')`)
  if (has) { await js(`document.querySelector('.ob-skip').click()`); await sleep(500) }
}

await send('Page.enable')
await send('Runtime.enable')
await send('Network.enable')
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

await send('Page.navigate', { url: target })
await sleep(1800)
await js(`localStorage.clear()`)
await send('Page.navigate', { url: target })
await sleep(2200)
await skipOnboarding()

if (mode) {
  // 走到等待页：每一步都必须「先等元素出现再点」，冷启动时会点空
  await waitFor(`document.querySelectorAll('.shop-row').length > 0`, 20000)
  await clickWhen('.shop-row')
  await waitFor(`document.querySelectorAll('.add-button').length > 0`, 20000)
  await js(`[...document.querySelectorAll('.add-button')].slice(0,2).forEach(b=>b.click())`)
  await sleep(400)
  await clickWhen('.cart-button')
  await clickTextWhen('/去结账|结算|下单/')
  await clickTextWhen('/确认|下单|提交/')
  await waitFor(`document.querySelector('.skip-wait-button')`, 30000)
  const idx = { walk: 0, road: 1, offline: 2 }[mode] ?? 1
  await js(`document.querySelectorAll('.wait-mode')[${idx}].click()`)
  await sleep(900)
}

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await writeFile(out, Buffer.from(shot.data, 'base64'))
console.log('已截图', out)
ws.close()
