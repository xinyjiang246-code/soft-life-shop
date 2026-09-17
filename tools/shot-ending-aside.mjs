import { writeFile } from 'node:fs/promises'
const out = process.argv[2] || '/tmp/ending-aside.png'
const ver = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const sock = new WebSocket(ver.webSocketDebuggerUrl)
let id = 0; const pending = new Map(); let sid
await new Promise((r) => sock.addEventListener('open', r))
sock.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) } })
const send = (method, params = {}, session = sid) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); sock.send(JSON.stringify({ id: mid, method, params, ...(session ? { sessionId: session } : {}) })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => { const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.exceptionDetails) throw new Error((o.exceptionDetails.exception && o.exceptionDetails.exception.description) || o.exceptionDetails.text); return o.result.value }

const ctx = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null)
sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
for (const d of ['Page', 'Runtime', 'Network']) await send(`${d}.enable`)
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })
// 强制走 warm 结局（ENDINGS[0]，那条带英文小语的）
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Math.random = function () { return 0 }' })
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(1400)
await js('localStorage.clear()')
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2600)
await js("document.querySelectorAll('.shop-row')[0].click()"); await sleep(1300)
await js("[...document.querySelectorAll('.add-button')].slice(0, 1).forEach(function (b) { b.click() })"); await sleep(400)
await js("document.querySelector('.cart-button').click()"); await sleep(800)
await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /去结账|结算|下单/.test(x.textContent)}); b&&b.click()})()"); await sleep(800)
await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /确认|下单|提交/.test(x.textContent)}); b&&b.click()})()"); await sleep(1200)
for (let t = 0; t < 30000; t += 600) { if (await js("!!document.querySelector('.skip-wait-button')")) break; await sleep(600) }
await js("document.querySelector('.skip-wait-button').click()"); await sleep(800)
await js("document.querySelector('.exchange-option').click()"); await sleep(2600)
for (let t = 0; t < 15000; t += 500) { if (await js("!!document.querySelector('.ending-card')")) break; await sleep(500) }
await sleep(900)
console.log('结局:', await js("JSON.stringify({标题:document.querySelector('.ending-title').innerText, 正文:document.querySelector('.ending-body').innerText, 小语:document.querySelector('.ending-aside')?document.querySelector('.ending-aside').innerText:'（无）', 小语字体:document.querySelector('.ending-aside')?getComputedStyle(document.querySelector('.ending-aside')).fontFamily.split(',')[0]+' '+getComputedStyle(document.querySelector('.ending-aside')).fontWeight+getComputedStyle(document.querySelector('.ending-aside')).fontStyle:'-'})"))
const { data } = await send('Page.captureScreenshot', { format: 'png' })
await writeFile(out, Buffer.from(data, 'base64'))
console.log('SCREENSHOT', out)
await send('Target.disposeBrowserContext', { browserContextId: ctx }, null).catch(() => {})
sock.close(); process.exit(0)
