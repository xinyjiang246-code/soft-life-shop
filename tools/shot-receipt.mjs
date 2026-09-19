// 取景：把「等待凭证」那张纸拍下来 —— 屏幕上那张（DOM）和真的存下来的那张（PNG）。
//
// 为什么要两张：这一版的承诺是「看到什么就存到什么」。DOM 那张纸和 Canvas 画出来的
//   是两套渲染（一份 CSS、一份 2D），最容易出现的坑就是「长得不像」。两张都摊出来才看得见。
//
// ⚠️ 怎么走到「等满」：真实等满是 120 秒，取景不该花 2 分钟。
//    这里在页面加载前**注入**一个计时器改写（只改两个确定的时长：
//    等待页每秒的倒计时 1000 → 20，预演每步 3000 → 150）。
//    这纯粹是取景/验收的加速手段，**产品代码一个字没动** ——
//    真实 120 秒那条路由 tools/verify-wait-modes.mjs 覆盖。
//
// 用法：node tools/shot-receipt.mjs [url] [输出目录]
import { mkdir, writeFile, readdir, copyFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const outDir = process.argv[3] || '/tmp/receipt-shot'

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  socket.addEventListener('open', res, { once: true })
  socket.addEventListener('error', rej, { once: true })
})

let nextId = 0
const pending = new Map()
const pageErrors = []
const downloadEvents = []
let sessionId
socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject, timer } = pending.get(m.id)
    clearTimeout(timer)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    return
  }
  // 存图失败时不能只看到「磁盘上没有文件」—— 页面里到底报没报错必须一起摊出来
  if (m.method === 'Runtime.exceptionThrown') {
    pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)
  }
  if (m.method === 'Browser.downloadWillBegin') downloadEvents.push(m.params.suggestedFilename)
})
const send = (method, params = {}, session = sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 30000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
  })

const js = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
const waitFor = (expr, t = 30000) => js(`new Promise((res, rej) => {
  const s = performance.now();
  const c = () => { if (${expr}) return res(true); if (performance.now() - s > ${t}) return rej(new Error('等不到: ' + ${JSON.stringify(expr)})); setTimeout(c, 100) }; c();
})`)
const clickText = (re) => `(()=>{const b=[...document.querySelectorAll('button')].find(x=>${re}.test(x.textContent)); if(!b) return false; b.click(); return true})()`

await mkdir(outDir, { recursive: true })
const dlDir = join(outDir, 'download')
await rm(dlDir, { recursive: true, force: true })
await mkdir(dlDir, { recursive: true })

const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true }, null)
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId }, null)
sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
await send('Runtime.enable')
await send('Page.enable')
// ⚠️ 下载行为必须**连 browserContextId 一起给**：只给 downloadPath 的话策略落在默认上下文上，
//    我们这个页面在自己新建的 context 里 —— 结果是 Browser.downloadWillBegin 照样触发（看得见），
//    但文件哪都没落。头号坑：日志一路绿灯，磁盘空空。
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, eventsEnabled: true, browserContextId }, null)
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    Math.random = () => 0;                     // 天气与结局都定死，取景才可复现
    const si = window.setInterval, st = window.setTimeout;
    window.setInterval = (fn, ms, ...a) => si(fn, ms === 1000 ? 20 : ms, ...a);   // 等待页每秒倒计时
    window.setTimeout = (fn, ms, ...a) => st(fn, ms === 3000 ? 150 : ms, ...a);   // 预演每步 3 秒
  })();`,
})

await send('Page.navigate', { url })
await waitFor(`document.querySelector('.home-page')`)
await js(`localStorage.clear()`)
await send('Page.navigate', { url })
await waitFor(`document.querySelector('.home-page')`)
await js(`document.fonts.ready.then(() => true)`)

console.log('[1] 首页 → 店铺 → 加购')
await waitFor(`document.querySelectorAll('.shop-row').length > 0`)
await js(`document.querySelector('.shop-row').click()`)
await waitFor(`document.querySelectorAll('.add-button').length > 0`)
await js(`[...document.querySelectorAll('.add-button')].slice(0, 2).forEach(b => b.click())`)
await waitFor(`document.querySelector('.bag-button')`)
await js(`document.querySelector('.bag-button').click()`)
await waitFor(`[...document.querySelectorAll('button')].some(x => /去结账|结算|下单/.test(x.textContent))`)
await js(clickText('/去结账|结算|下单/'))
await waitFor(`[...document.querySelectorAll('button')].some(x => /确认|下单|提交/.test(x.textContent))`)
await js(clickText('/确认|下单|提交/'))

console.log('[2] 等满（倒计时被加速）→ 结局页')
await waitFor(`document.querySelector('.wait-pet-btn')`, 20000)
await waitFor(`document.querySelector('.ending-card')`, 60000)
await waitFor(`document.querySelector('.wait-receipt')`, 15000)
await js(`document.fonts.ready.then(() => true)`)
await js(`document.querySelector('.wait-receipt').scrollIntoView({ block: 'center' })`)
await js(`new Promise(r => setTimeout(r, 700))`)

const info = await js(`(() => {
  const paper = document.querySelector('.wr-paper');
  const box = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) } };
  const acc = document.querySelector('.wr-accent');
  const cs = acc ? getComputedStyle(acc) : null;
  return {
    纸: box('.wr-paper'),
    大数字: document.querySelector('.wr-big')?.innerText.replace(/\\n/g, ' '),
    条目: [...document.querySelectorAll('.wr-row')].map(r => r.innerText.replace(/\\n/g, ' ')),
    小字: document.querySelector('.wr-fine')?.innerText,
    重音: acc?.innerText,
    重音样式: cs ? [cs.fontFamily.split(',')[0].replace(/["']/g, ''), cs.fontWeight, cs.fontStyle, cs.fontVariationSettings].join(' / ') : null,
    中文那句: document.querySelector('.wr-quote')?.innerText,
    印章: document.querySelector('.wr-seal')?.innerText,
    行数: document.querySelectorAll('.wr-row').length,
  };
})()`)
console.log('  纸:', JSON.stringify(info.纸))
console.log('  大数字:', info.大数字)
console.log('  条目:', info.条目.join(' | '))
console.log('  小字:', info.小字)
console.log('  重音:', info.重音, '→', info.重音样式)
console.log('  中文那句:', info.中文那句)
console.log('  印章:', info.印章)

const shot = async (name, clip) => {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) })
  const p = join(outDir, name)
  await writeFile(p, Buffer.from(r.data, 'base64'))
  console.log('  SHOT', p)
}

// 整页（看它在结局页里的位置和分量）
await shot('1-ending-full.png')
// 只要这张纸（看排版细节）
const paper = await js(`(() => { const r = document.querySelector('.wait-receipt').getBoundingClientRect(); return { x: r.left - 8, y: r.top + scrollY - 8, width: r.width + 16, height: r.height + 16, scale: 1 } })()`)
await shot('2-paper.png', paper)

console.log('[3] 点「存成图片」→ 真的落一个 PNG 到磁盘')
await js(`document.querySelector('.wr-save').click()`)
const waitFile = async (dir, ms = 15000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const files = await readdir(dir).catch(() => [])
    const png = files.find((f) => f.endsWith('.png') && !f.endsWith('.crdownload'))
    if (png) return join(dir, png)
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}
const downloaded = await waitFile(dlDir)
if (!downloaded) {
  const state = await js(`(() => ({
    按钮: document.querySelector('.wr-save')?.innerText,
    提示: document.querySelector('.wr-save-note')?.innerText || null,
  }))()`)
  console.log('  页面现场:', JSON.stringify(state))
  console.log('  下载事件:', JSON.stringify(downloadEvents))
  console.log('  页面报错:', pageErrors.length ? pageErrors.join(' / ') : '(无)')
  throw new Error('点了「存成图片」但磁盘上没有落文件')
}
const head = Buffer.alloc(24)
const fh = await import('node:fs/promises').then((m) => m.open(downloaded, 'r'))
await fh.read(head, 0, 24, 0)
await fh.close()
console.log('  落盘:', downloaded, `${head.readUInt32BE(16)}×${head.readUInt32BE(20)}px`)
await copyFile(downloaded, join(outDir, '3-saved.png'))
console.log('  SHOT', join(outDir, '3-saved.png'))

const saved = await js(`(() => ({
  按钮文案: document.querySelector('.wr-save').innerText,
  提示: document.querySelector('.wr-save-note')?.innerText || null,
}))()`)
console.log('  存完之后的现场:', JSON.stringify(saved))

if (!existsSync(join(outDir, '3-saved.png'))) console.log('!! 没复制成功')

await send('Target.disposeBrowserContext', { browserContextId }, null).catch(() => {})
socket.close()
