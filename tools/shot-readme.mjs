// 为 README 截一组产品关键屏：home / cart / checkout / wait
// 走完整下单链路到各个节点各截一张。用法：
//   node tools/shot-readme.mjs <BASE_URL> <OUTDIR>
import { writeFile, mkdir } from 'node:fs/promises'

const BASE = process.argv[2] || 'http://127.0.0.1:8080/'
const OUTDIR = process.argv[3] || '/Users/s/Desktop/虚拟外卖模拟器/screenshots'
await mkdir(OUTDIR, { recursive: true })
const base = BASE.endsWith('/') ? BASE : BASE + '/'
const target = `${base}?v=${Date.now()}`

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
const skipOnboarding = async () => {
  if (await js(`!!document.querySelector('.ob-skip')`)) {
    await js(`document.querySelector('.ob-skip').click()`); await sleep(500)
  }
}
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(`${OUTDIR}/${name}.png`, Buffer.from(s.data, 'base64'))
  console.log('  截', name)
}

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

await send('Page.navigate', { url: target }); await sleep(1800)
await js(`localStorage.clear()`)
await send('Page.navigate', { url: target }); await sleep(2200)
await skipOnboarding(); await sleep(600)
await shot('home')

// 加购 2 件 → 进购物袋
await waitFor(`document.querySelectorAll('.shop-row').length > 0`, 20000)
await clickWhen('.shop-row')
await waitFor(`document.querySelectorAll('.add-button').length > 0`, 20000)
await js(`[...document.querySelectorAll('.add-button')].slice(0,2).forEach(b=>b.click())`)
await js(`[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())`)
await sleep(400)
await clickWhen('.cart-button'); await sleep(800)
await shot('cart')

// 去结账 → 截结算页（支付前）
await clickTextWhen('/去结账|结算|下单/'); await sleep(800)
await shot('checkout')

// 确认 → 模拟支付 → 等待页（road 模式）
await clickTextWhen('/确认|下单|提交/')
await waitFor(`document.querySelector('.pay-confirm')`, 15000)
await js(`document.querySelector('.pay-confirm').click()`)
await waitFor(`document.querySelectorAll('.pay-key').length > 0`, 15000)
for (let i = 0; i < 6; i++) {
  await js(`(() => { const ks = [...document.querySelectorAll('.pay-key')].filter(k => !k.classList.contains('blank')); ks[0] && ks[0].click() })()`)
  await sleep(150)
}
await waitFor(`document.querySelector('.skip-wait-button')`, 30000)
await js(`document.querySelectorAll('.wait-mode')[1].click()`); await sleep(900)
await shot('wait')

console.log('完成，输出在', OUTDIR)
ws.close()
process.exit(0)
