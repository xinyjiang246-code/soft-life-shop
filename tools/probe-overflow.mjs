// 探针：量世界菜单 .world-card 横向溢出的根因（哪个子元素撑宽了卡片）
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
  if (o.exceptionDetails) throw new Error(JSON.stringify(o.exceptionDetails).slice(0, 300))
  return o.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:8080/?v=' + Date.now() })
await sleep(2000)
await js(`localStorage.clear()`)
await send('Page.navigate', { url: 'http://127.0.0.1:8080/?v=' + Date.now() })
await sleep(2200)
await js(`(() => { const b = document.querySelector('.ob-skip'); if (b) b.click(); return true })()`)
await sleep(600)

// 进世界菜单
await js(`(() => { const b = document.querySelector('.world-entry'); if (b) b.click(); return true })()`)
await sleep(1500)

const result = await js(`(() => {
  const cards = Array.from(document.querySelectorAll('.world-card'))
  const detail = cards.map((c, i) => {
    const kids = Array.from(c.children).map((k) => {
      const r = k.getBoundingClientRect()
      return {
        cls: (k.className || '').toString().slice(0, 24),
        w: Math.round(r.width),
        sw: k.scrollWidth,
        right: Math.round(r.right),
      }
    })
    const cr = c.getBoundingClientRect()
    return {
      i,
      cardW: Math.round(cr.width),
      cardScrollW: c.scrollWidth,
      kids,
    }
  })
  return detail
})()`)
console.log(JSON.stringify(result, null, 1).slice(0, 4000))
ws.close()
