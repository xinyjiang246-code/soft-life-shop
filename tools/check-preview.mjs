// 使用已启动的 Chrome 调试端口，在独立无痕上下文测试，不接触用户标签或存档。
// node tools/check-preview.mjs <url> '[{"click":"selector"}]' [screenshot.png]
import { writeFile } from 'node:fs/promises'
import { get as httpGet } from 'node:http'
import assert from 'node:assert/strict'

// ⚠️ 探「图坏没坏」**不能用全局 fetch**（2026-09-21 修）。
//    Node 的 undici 会复用 keep-alive 连接，而 `python3 -m http.server` 是 HTTP/1.0、
//    每次响应后关连接 → undici 复用到的死连接让它在 Parser.finish 里
//    `assert(!this.paused)` 抛错，**直接崩掉整个进程**（不是 reject，没法 catch）。
//    换一个刚起的新服务器一样复现，所以不是「服务器跑久了」。
//    `agent: false` + `connection: close` = 每个请求一条新连接，绕开复用。
function probeStatus(url) {
  return new Promise((resolve, reject) => {
    const req = httpGet(url, { agent: false, headers: { connection: 'close' } }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(10000, () => req.destroy(new Error(`probe timeout: ${url}`)))
  })
}

const url = process.argv[2] || 'http://127.0.0.1:5173/'
const steps = JSON.parse(process.argv[3] || '[]')
const screenshot = process.argv[4]
const version = await fetch('http://127.0.0.1:9222/json/version').then(r => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let nextId = 0
const pending = new Map()
const errors = []
const failedResponses = []
let sessionId
let contextId
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.id) {
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(message.id)
    if (message.error) request.reject(new Error(JSON.stringify(message.error)))
    else request.resolve(message.result)
  } else if (message.sessionId === sessionId) {
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails
      errors.push(detail.exception?.description || detail.text)
    }
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      failedResponses.push({ url: message.params.response.url, status: message.params.response.status })
    }
  }
})
function send(method, params = {}, session = sessionId) {
  const id = ++nextId
  if (process.env.DEBUG_PREVIEW) console.log('CDP', method)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 20000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
async function waitFor(expression, timeout = 8000) {
  return evaluate(`new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (${expression}) return resolve(true);
      if (performance.now() - started > ${timeout}) return reject(new Error('Page condition timed out'));
      setTimeout(check, 80);
    }; check();
  })`)
}
try {
  contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  for (const step of steps) {
    if (step.click) {
      await waitFor(`document.querySelector(${JSON.stringify(step.click)})`)
      await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(step.click)}); if (el.disabled) throw new Error('Disabled button'); el.click(); })()`)
    }
    if (step.fill) {
      await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(step.fill)});
        if (!el) throw new Error('Input not found');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(step.value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`)
    }
    if (step.evaluate) console.log('CHECK', JSON.stringify(await evaluate(step.evaluate)))
    if (step.reload) await send('Page.reload')
    if (step.waitFor) await waitFor(step.waitFor, step.timeout || 8000)
    if (step.assert) assert.ok(await evaluate(step.assert), step.label || step.assert)
  }
  await evaluate('document.fonts.ready.then(() => true)')
  // ⚠️ 磁贴图是 loading="lazy"，headless Chrome 里程序化滚动**经常不触发**懒加载
  // （实测：charity 加载了、archive/myshop 反复扫十遍也不加载）——
  // 所以「图坏没坏」不能靠 naturalWidth 碰运气：给两轮滚动机会之后，
  // 直接 fetch 每个 src 验 HTTP 200，这才是要断言的东西。
  await evaluate(`(async () => {
    const sweep = () => new Promise((resolve) => {
      let y = 0; const step = () => {
        y += 600; window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 60);
        else { window.scrollTo(0, 0); setTimeout(resolve, 150); }
      }; step();
    })
    await sweep(); await sweep()
    return true
  })()`)
  // 坏图 = fetch 不回来的图（懒加载没触发 ≠ 坏 —— 别拿 naturalWidth 误报）
  const imgSrcs = await evaluate(`Array.from(document.images).map(i => i.src).filter(Boolean)`)
  const brokenImages = []
  for (const src of imgSrcs) {
    // data: / blob: 是内联的，没有「取不回来」这回事 —— 探针只对 http(s) 有意义
    if (!/^https?:/.test(src)) continue
    try { const status = await probeStatus(src); if (status !== 200) brokenImages.push(`${src} → HTTP ${status}`) }
    catch { brokenImages.push(src) }
  }
  const snapshot = await evaluate(`({
    url: location.href,
    title: document.title,
    text: document.body.innerText,
    controls: Array.from(document.querySelectorAll('button, input, [role="button"], a')).map(el => ({
      tag: el.tagName, text: el.innerText?.trim(), label: el.getAttribute('aria-label'),
      class: el.className, placeholder: el.getAttribute('placeholder'), disabled: !!el.disabled
    })),
    brokenImages: ${JSON.stringify(brokenImages)},
    overflow: document.documentElement.scrollWidth > innerWidth
  })`)
  console.log(JSON.stringify({ snapshot, errors, failedResponses }, null, 2))
  if (screenshot) {
    // 避免全页捕获与翻面层组合时部分 Chrome 版本的合成问题。
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(screenshot, Buffer.from(data, 'base64'))
    console.log(`SCREENSHOT ${screenshot}`)
  }
  if (errors.length || snapshot.brokenImages.length) process.exitCode = 1
} catch (error) {
  console.error('Preview check failed:', error)
  process.exitCode = 1
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null).catch(error => console.error('Context cleanup:', error.message))
  socket.close()
  for (const request of pending.values()) clearTimeout(request.timer)
}
