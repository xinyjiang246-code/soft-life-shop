// 用 CDP 的 CSS.getPlatformFontsForNode 查「真正落笔的那支字」。
// 为什么要这个：getComputedStyle().fontFamily 只告诉你第一顺位是谁，
// 中文会被后面的 Songti/PingFang 兜走 —— 只看 computed 会把「宋体标题」误判成 Fraunces。
// getPlatformFontsForNode 返回的是渲染器实际使用的字体，附带用了几个字形。
const url = process.argv[2] || 'http://127.0.0.1:8080/'
const click = process.argv[3] || null
const targets = (process.argv[4] || '.brand,.section-title,.hero-copy h1,.store-head h1,.menu-price,.menu-desc').split(',')

const ver = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const sock = new WebSocket(ver.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
let sid
await new Promise((r) => sock.addEventListener('open', r))
sock.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  }
})
const send = (method, params = {}, session = sid) =>
  new Promise((res, rej) => {
    const mid = ++id
    pending.set(mid, { res, rej })
    sock.send(JSON.stringify({ id: mid, method, params, ...(session ? { sessionId: session } : {}) }))
  })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => {
  const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  if (o.exceptionDetails) throw new Error((o.exceptionDetails.exception && o.exceptionDetails.exception.description) || o.exceptionDetails.text)
  return o.result.value
}

const ctx = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null)
sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
for (const d of ['Page', 'Runtime', 'Network', 'DOM', 'CSS']) await send(`${d}.enable`)
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' })
await sleep(1500)
await js('localStorage.clear()')
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' })
await sleep(2600)
await js('document.fonts.ready.then(() => true)')
if (click) {
  await js(`document.querySelector(${JSON.stringify(click)}).click()`)
  await sleep(1600)
}

// 每个选择器：取到 nodeId → 查平台字体
const doc = await send('DOM.getDocument', { depth: -1, pierce: true })
for (const sel of targets) {
  const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel }).catch(() => null)
  if (!q || !q.nodeId) {
    console.log(`${sel.padEnd(20)} — 页面上没有`)
    continue
  }
  const info = await js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const s=getComputedStyle(e);const r=e.getBoundingClientRect();return [s.fontFamily,s.fontWeight,s.fontStyle,parseFloat(s.fontSize),Math.round(r.width),JSON.stringify(s.fontVariationSettings),e.innerText.slice(0,18)]})()`)
  const fonts = await send('CSS.getPlatformFontsForNode', { nodeId: q.nodeId })
  const used = (fonts.fonts || []).map((f) => `${f.familyName}(${f.glyphCount})`).join(' + ')
  console.log(`${sel}`)
  console.log(`   声明 ${info[1]} ${info[2]} ${info[3]}px  vf=${info[5]}`)
  console.log(`   实际落笔 → ${used || '（无文字）'}   ← 文本「${info[6]}」宽 ${info[4]}px`)
}
await send('Target.disposeBrowserContext', { browserContextId: ctx }, null).catch(() => {})
sock.close()
process.exit(0)
