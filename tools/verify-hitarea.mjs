// 验证加购按钮命中区：.add-button 31px 视觉不变，::before 撑到 44px+
import { writeFile } from 'node:fs/promises'

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

await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(1400)
await js('localStorage.clear()')
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2600)
await js("document.querySelectorAll('.shop-row')[0].click()"); await sleep(1300)

const probe = await js(`(() => {
  const btn = document.querySelector('.add-button')
  if (!btn) return 'NO BUTTON'
  const cs = getComputedStyle(btn)
  const before = getComputedStyle(btn, '::before')
  const r = btn.getBoundingClientRect()
  return JSON.stringify({
    position: cs.position,
    size: r.width.toFixed(1) + 'x' + r.height.toFixed(1),
    beforeContent: before.content,
    beforePosition: before.position,
    beforeInsetTop: before.top,
    hitDiameter: (r.width + 14).toFixed(0)
  })
})()`)
console.log('加购按钮命中区探针:', probe)

await send('Target.disposeBrowserContext', { browserContextId: ctx }, null).catch(() => {})
sock.close(); process.exit(0)
