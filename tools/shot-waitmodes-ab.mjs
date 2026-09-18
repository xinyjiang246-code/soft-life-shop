// 三态前后对照：8091 = 改动前（6b32f98 构建）· 8080 = 改动后
// 每张都截「从三个标签开始、往下 560px」——这一段正好能看出「选完到底有没有变化」
import { writeFile } from 'node:fs/promises'

const ver = await fetch('http://127.0.0.1:9222/json/version').then(r => r.json())
const sock = new WebSocket(ver.webSocketDebuggerUrl)
let id = 0; const pending = new Map(); let sid
await new Promise(r => sock.addEventListener('open', r))
sock.addEventListener('message', ev => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) }
})
const send = (method, params = {}, session = sid) => new Promise((res, rej) => {
  const mid = ++id; pending.set(mid, { res, rej })
  sock.send(JSON.stringify({ id: mid, method, params, ...(session ? { sessionId: session } : {}) }))
})
const sleep = ms => new Promise(r => setTimeout(r, ms))
const js = async e => {
  const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  if (o.exceptionDetails) throw new Error((o.exceptionDetails.exception && o.exceptionDetails.exception.description) || o.exceptionDetails.text)
  return o.result.value
}
const waitFor = async (e, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js('!!(' + e + ')')) return true; await sleep(240) } throw new Error('等不到 ' + e) }

async function runPort(port, tag) {
  const ctx = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null)
  sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  for (const d of ['Page', 'Runtime', 'Network']) await send(`${d}.enable`)
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }); await sleep(1500)
  await js('localStorage.clear()')
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }); await sleep(2700)
  await waitFor(`document.querySelector('.shop-row')`)
  await js(`document.querySelectorAll('.shop-row')[0].click()`); await sleep(1200)
  await js(`[...document.querySelectorAll('.add-button')].slice(0,1).forEach(b=>b.click())`); await sleep(450)
  await js(`(function(){var bs=[...document.querySelectorAll('.cart-button')];bs[bs.length-1].click()})()`); await sleep(850)
  await waitFor(`[...document.querySelectorAll('button')].find(x=>/去结账|结算|下单/.test(x.textContent))`)
  await js(`[...document.querySelectorAll('button')].find(x=>/去结账|结算|下单/.test(x.textContent)).click()`); await sleep(900)
  await waitFor(`[...document.querySelectorAll('button')].find(x=>/确认|下单|提交/.test(x.textContent))`)
  await js(`[...document.querySelectorAll('button')].find(x=>/确认|下单|提交/.test(x.textContent)).click()`); await sleep(1300)
  await waitFor(`document.querySelector('.skip-wait-button')`, 32000)

  for (const [key, word] of [['walk', '陪他走'], ['road', '帮他看路'], ['offline', '先下线']]) {
    await js(`[...document.querySelectorAll('.wait-mode')].find(c=>c.textContent.includes(${JSON.stringify(word)})).click()`)
    await sleep(1100)
    const y = Math.round(await js(`document.querySelector('.wait-modes').getBoundingClientRect().top + window.scrollY`))
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y, width: 390, height: 560, scale: 2 } })
    await writeFile(`/tmp/wmab-${tag}-${key}.png`, Buffer.from(data, 'base64'))
    console.log(`  ${tag}/${key}`)
  }

  await send('Target.disposeBrowserContext', { browserContextId: ctx }, null).catch(() => {})
}

console.log('[before] 8091')
await runPort(8091, 'before')
console.log('[after] 8080')
await runPort(8080, 'after')

sock.close(); process.exit(0)
