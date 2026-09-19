// 抓「今天」这一条的两种态（2026-09-19）。
// 态 B = 今天还什么都没发生（新的一天第一眼）；态 A = 今天已经下过一单。
// 两个态各开一套干净的 localStorage，直接注入，不靠真走单（走单要等 2 分钟）。
//
// 用法：node tools/shot-today.mjs [url] [输出目录]
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const outDir = process.argv[3] || '/tmp/today-shot'

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
let sessionId
socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (!m.id) return
  const req = pending.get(m.id)
  if (!req) return
  clearTimeout(req.timer)
  pending.delete(m.id)
  m.error ? req.reject(new Error(JSON.stringify(m.error))) : req.resolve(m.result)
})

function send(method, params = {}, session = sessionId) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 25000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
  })
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ready = `document.readyState === "complete" && !!document.querySelector('.amb-today')`

async function shot(name) {
  // ⚠️ 不要用 clip + captureBeyondViewport：它和 Emulation.setDeviceMetricsOverride
  //    一起用会捕到一张空白纸（背景色在、内容全无）。直接截视口最稳，
  //    要哪一块后面用 Pillow 裁。
  await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' }); 'ok'`)
  // 让切页进场动画彻底走完（.26s）+ 一点余量。
  // ⚠️ 别卡着 260 这个数字用：动画末尾几帧 opacity 还在 0.x，
  //    截出来就是「背景色在、内容全无」的一张空白纸（踩过）。
  await sleep(700)
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${outDir}/${name}.png`, Buffer.from(data, 'base64'))
  const lines = await evaluate(`document.querySelector('.amb-today')?.innerText || ''`)
  const greet = await evaluate(`document.querySelector('.amb-greet b')?.innerText || ''`)
  console.log(`\n=== ${name} ===`)
  console.log('问候:', greet)
  console.log(lines)
  return lines
}

await mkdir(outDir, { recursive: true })

async function openClean() {
  const ctx = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  return ctx
}

try {
  const ctxB = await openClean()
  await send('Page.navigate', { url })
  await send('Runtime.evaluate', { expression: `localStorage.setItem('soft-life-visited-v1','1')` })
  await send('Page.navigate', { url })
  await evaluate(ready)
  await shot('1-态B-今天还没发生什么')

  // 态 A：注入「今天已经下过一单」的全部痕迹。
  // 日期口径：patience 用 YYYY-MM-DD，journal 用 YYYY-MM-DD，charity/rescue 用 ISO 时间戳。
  await evaluate(`(() => {
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const dayKey = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    localStorage.setItem('soft-life-patience-v1', JSON.stringify({ date: dayKey, used: 0, waited: 2 }))
    localStorage.setItem('soft-life-journal-v1', JSON.stringify({
      days: { [dayKey]: { items: [{ name: '冰抹茶拿铁', id: 'matcha-latte' }], note: '', mood: '' } }
    }))
    localStorage.setItem('soft-life-charity-v1', JSON.stringify({
      grams: 480, amount: 4.8, orders: 1,
      records: [{ id: 'don-x', grams: 480, amount: 4.8, ratio: 30, shop: '慢活茶铺', at: d.toISOString() }],
      settled: [],
    }))
    return dayKey
  })()`)
  await send('Page.navigate', { url })
  await evaluate(ready)
  await shot('2-态A-今天已经下过一单')

  console.log('\n产物目录:', outDir)
} finally {
  socket.close()
}
