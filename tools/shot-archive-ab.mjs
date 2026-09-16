// 出「同一份 DOM 的 A/B」：AI 面板在旧卡片里被裁掉 vs 修好之后整块可见。
//
// 为什么不用两张不同时间的截图对比：那样两张图里连内容都不一样，证明不了什么。
// 这里上传一次照片，然后**只切一个类名**（`.archive-card` 上的 `has-ai`）——
// 去掉它就回到旧的 `.archive-card { aspect-ratio: 3/4; overflow: hidden }`，
// 是同一份 DOM、同一段文案，唯一变量就是那条规则。A/B 有可比性。
//
// 用法：node tools/shot-archive-ab.mjs [url] [输出目录]
import { writeFile, mkdir } from 'node:fs/promises'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const outDir = process.argv[3] || '/tmp/archive-ab/'

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  socket.addEventListener('open', res, { once: true })
  socket.addEventListener('error', rej, { once: true })
})

let nextId = 0
const pending = new Map()
let sessionId

socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id)
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
  }
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
async function waitFor(expression, timeout = 20000) {
  return evaluate(`new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (${expression}) return resolve(true);
      if (performance.now() - started > ${timeout}) return reject(new Error('等不到: ' + ${JSON.stringify(expression)}));
      setTimeout(check, 100);
    }; check();
  })`)
}
async function click(selector) {
  await waitFor(`document.querySelector(${JSON.stringify(selector)})`)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}
async function shot(name) {
  await mkdir(outDir, { recursive: true }).catch(() => {})
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(`${outDir}${name}.png`, Buffer.from(data, 'base64'))
}

let contextId
try {
  contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

  await send('Page.navigate', { url })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await click('.corner-grid .corner-tile:nth-child(3)')
  await waitFor(`document.querySelector('.aw')`)

  await evaluate(`(async () => {
    const c = document.createElement('canvas');
    c.width = 900; c.height = 1200;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 1200);
    g.addColorStop(0, '#E8E0CE'); g.addColorStop(1, '#C9BFA6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 900, 1200);
    ctx.fillStyle = 'rgba(120,150,105,.85)'; ctx.beginPath(); ctx.ellipse(450, 700, 200, 250, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(232,240,222,.9)'; ctx.beginPath(); ctx.ellipse(450, 640, 140, 175, 0, 0, Math.PI*2); ctx.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    const file = new File([blob], '窗边那杯.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('.archive-page .file-input');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`)

  await waitFor(`document.querySelector('.ai-footer-note')`)
  await evaluate('new Promise(r => setTimeout(r, 600))')
  // 把卡片滚到视口顶部，两次截图取同一段
  await evaluate(`document.querySelector('.archive-card').scrollIntoView({ block: 'start' })`)
  await evaluate('new Promise(r => setTimeout(r, 400))')

  const measure = () => evaluate(`(() => {
    const card = document.querySelector('.archive-card');
    const foot = document.querySelector('.ai-footer-note');
    return {
      卡片高: Math.round(card.getBoundingClientRect().height),
      内容高: Math.round(card.scrollHeight),
      被裁: card.scrollHeight - card.clientHeight,
      页脚可见: foot.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom + 1,
    };
  })()`)

  // A：旧行为（去掉 has-ai 就回到 aspect-ratio 3/4 + overflow:hidden）
  await evaluate(`document.querySelector('.archive-card').classList.remove('has-ai')`)
  await evaluate('new Promise(r => setTimeout(r, 300))')
  const before = await measure()
  console.log('改进前:', JSON.stringify(before))
  // 把**真实的几何**交给拼图脚本 —— 标注不能在拼图那边再靠肉眼估一个比例
  // （第一版就是估的，红线画到了标签行，而真正的裁切边界是卡片的下边缘）。
  const geom = await evaluate(`(() => {
    const r = document.querySelector('.archive-card').getBoundingClientRect();
    const p = document.querySelector('.archive-ai-panel').getBoundingClientRect();
    const f = document.querySelector('.ai-footer-note').getBoundingClientRect();
    // getBoundingClientRect 是 CSS px，截图是 2 倍图 → 乘 2 换成设备像素
    const k = 2;
    return {
      卡片: { top: r.top * k, bottom: r.bottom * k },
      面板底: p.bottom * k,
      页脚底: f.bottom * k,
      视口高: innerHeight * k,
    };
  })()`)
  await shot('A_改进前')

  // B：修好之后
  await evaluate(`document.querySelector('.archive-card').classList.add('has-ai')`)
  await evaluate('new Promise(r => setTimeout(r, 300))')
  const after = await measure()
  console.log('改进后:', JSON.stringify(after))
  const geomAfter = await evaluate(`(() => {
    const r = document.querySelector('.archive-card').getBoundingClientRect();
    const k = 2;
    return { 卡片: { top: r.top * k, bottom: r.bottom * k } };
  })()`)
  await shot('B_改进后')

  await mkdir(outDir, { recursive: true }).catch(() => {})
  await writeFile(`${outDir}ab.json`, JSON.stringify({ before, after, geomBefore: geom, geomAfter }, null, 2))
  console.log('几何写入', `${outDir}ab.json`)
  console.log('输出目录', outDir)
} catch (e) {
  console.error('出图失败:', e.message)
  process.exitCode = 1
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null).catch(() => {})
  socket.close()
  for (const p of pending.values()) clearTimeout(p.timer)
}
