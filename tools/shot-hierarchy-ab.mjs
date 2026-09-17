// 字阶层前后对照：同一套页面、同一套选择器，分别从「改造前」(8090) 与「改造后」(8080) 各抓一张整页图。
//
// 为什么开两个端口：
//   「改造前」不是我把规则改回去猜出来的 —— 那是 git worktree 检出的 6957262（印刷层完成版）
//   真实构建产物。字阶层改的是**字重与斜体**，正体 500 和斜体 800 的差别在缩略图里
//   几乎看不出来，只有拿真版本并排比才作数。
//
// 输出：/tmp/full-<side>-<view>.png（整页）+ /tmp/hier-rects.json（各元素在**页面坐标**里的位置）
import { writeFile } from 'node:fs/promises'

const SIDES = [
  { side: 'before', port: 8090 },
  { side: 'after', port: 8080 },
]
const VIEWS = [
  { key: 'brand', clicks: [], els: ['.brand'] },
  { key: 'section', clicks: [], els: ['.section-title'] },
  { key: 'hero', clicks: [], els: ['.hero-copy h1'] },
  { key: 'shop', clicks: ['.shop-row'], els: ['.store-head h1', '#store-menu-heading'] },
  { key: 'charity', clicks: ['.corner-tile:nth-of-type(2)'], els: ['.charity-hero-num', '.charity-stat-num'] },
  {
    key: 'ending',
    // 走一单到结局页；用 Math.random 覆写强制走 warm（唯一带英文小语的那版）
    clicks: [
      '.shop-row',
      { addButtons: 1 },
      '.cart-button',
      { text: '/去结账|结算|下单/' },
      { text: '/确认|下单|提交/' },
      { skipWait: true },
      '.exchange-option',
      { wait: '.ending-card' },
    ],
    els: ['.ending-title', '.ending-aside'],
  },
]

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
const waitFor = async (expr, ms = 25000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await js(`!!(${expr})`)) return true; await sleep(250) }
  throw new Error('等不到: ' + expr)
}

const rects = {}
for (const { side, port } of SIDES) {
  const ctx = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null)
  sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  for (const d of ['Page', 'Runtime', 'Network']) await send(`${d}.enable`)
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Math.random = function () { return 0 }' })

  for (const v of VIEWS) {
    const url = `http://127.0.0.1:${port}/`
    await send('Page.navigate', { url })
    await sleep(1500)
    await js('localStorage.clear()')
    await send('Page.navigate', { url })
    await sleep(2400)
    await js('document.fonts.ready.then(() => true)')
    await waitFor(`document.querySelectorAll('.shop-row').length > 0`)
    for (const c of v.clicks) {
      if (typeof c === 'string') { await waitFor(`document.querySelector('${c}')`); await js(`document.querySelector('${c}').click()`); await sleep(1100) }
      else if (c.addButtons) { await waitFor(`document.querySelectorAll('.add-button').length > 0`); await js(`[...document.querySelectorAll('.add-button')].slice(0,${c.addButtons}).forEach(b=>b.click())`); await sleep(500) }
      else if (c.text) { await waitFor(`[...document.querySelectorAll('button')].some(x=>${c.text}.test(x.textContent))`); await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>${c.text}.test(x.textContent)); b&&b.click()})()`); await sleep(900) }
      else if (c.skipWait) { await waitFor(`document.querySelector('.skip-wait-button')`, 35000); await js(`document.querySelector('.skip-wait-button').click()`); await sleep(900) }
      else if (c.wait) { await waitFor(`document.querySelector('${c.wait}')`, 20000); await sleep(900) }
    }
    await js('document.fonts.ready.then(() => true)')
    await sleep(600)
    // 元素在**页面坐标**里的位置（整页截图用得上）
    // ⚠️ 选择器数组必须赋给变量：`const out = {}` 后面紧跟一行以 `[` 开头，
    //    JS 会按 ASI 把两行连成 `{}[".brand"].forEach` → undefined.forEach 报错。
    const info = JSON.parse(await js(`JSON.stringify((()=>{
      const out = {}
      const sels = ${JSON.stringify(v.els)}
      sels.forEach((sel) => {
        const el = document.querySelector(sel)
        if (!el) { out[sel] = null; return }
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        out[sel] = { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height),
                     字体: cs.fontFamily.split(',')[0].replace(/["']/g, ''), 重: cs.fontWeight, 斜: cs.fontStyle, 号: parseFloat(cs.fontSize) }
      })
      return { els: out, pageH: document.documentElement.scrollHeight }
    })())`))
    rects[`${side}-${v.key}`] = info
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(`/tmp/full-${side}-${v.key}.png`, Buffer.from(data, 'base64'))
    console.log(`${side.padEnd(6)} ${v.key.padEnd(8)} ${Object.entries(info.els).map(([k, r]) => `${k}${r ? `=${r.重}${r.斜 === 'italic' ? 'i' : ''}/${r.号}px` : '=无'}`).join('  ')}`)
  }
  await send('Target.disposeBrowserContext', { browserContextId: ctx }, null).catch(() => {})
}
await writeFile('/tmp/hier-rects.json', JSON.stringify(rects, null, 1))
console.log('\nrects → /tmp/hier-rects.json')
sock.close()
process.exit(0)
