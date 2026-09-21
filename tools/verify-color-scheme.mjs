// 验证「小铺只做浅色」这件事真的成立 —— 手机深色模式下不会被自动反色。
//
// 用法：
//   node tools/verify-color-scheme.mjs [url] [--prove]
//
// 为什么要有这个（2026-09-21 加的）：
//   用户发来一张截图：「如果屏幕或者风格换成深色后猫咪就成这样了」—— 奶白的软软变成了一只
//   只剩描边的黑猫。根因不是我们的深色样式写坏了，而是**我们从没声明过 color-scheme**：
//   手机 / 微信的「自动深色主题」（Chromium Auto Dark Theme）会把整页当「没适配深色的网站」
//   做算法反色，**连图片像素一起反**（实测整页平均亮度 237 → 44）。
//
//   这类问题的可怕之处：**构建永远绿、本地永远正常** —— 只有在深色模式的手机上才看得见，
//   而且它会把整套暖米色纸感（产品的命根子）一次抹掉。
//
//   修法只有两层声明（缺一层就少一道保险）：
//     ① index.html  <meta name="color-scheme" content="only light">   ← 完全阻止，连闪烁都没有
//     ② :root { color-scheme: only light }                            ← 兜底（微信某些版本只读 CSS）
//   ⚠️ 千万别改成 `light dark` —— 那等于主动请求「请把整页反色」。
//
//   判定用的「尺子」：Auto Dark Theme 生效时，一张没有声明的米色页会被反到亮度 ~44；
//   声明之后保持 ~237。守卫先量**这把尺子准不准**，再量产品，避免环境不对时假绿。
import { readFileSync, readdirSync } from 'node:fs'

const args = process.argv.slice(2)
const prove = args.includes('--prove')
const url = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8080/'

const LIGHT_MIN = 150   // 米色纸面 ≈ 237；被反色 ≈ 44。150 是两者中间的安全线
const CANDIDATE_ASSETS = 'dist/assets'

let pass = 0
let fail = 0
const failures = []
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; failures.push(label); console.log(`  ❌ ${label}${detail ? `  —— ${detail}` : ''}`) }
}

// ---------------------------------------------------------------- 1 源码声明
console.log('【1】源码里声明了「只做浅色」')
const indexHtml = readFileSync('index.html', 'utf8')
const metaMatch = /<meta\s+name="color-scheme"\s+content="([^"]*)"/.exec(indexHtml)
check('index.html 有 <meta name="color-scheme">', Boolean(metaMatch), '一行都没有 = 手机深色下整页连图片一起被反色')
check('meta 的值是 only light（不是 light dark）',
  Boolean(metaMatch) && /only\s+light/.test(metaMatch[1]),
  metaMatch ? `现在是 "${metaMatch[1]}"` : '')
check('meta 在 <head> 内（不是 body 里）', /<head>[\s\S]*?name="color-scheme"[\s\S]*?<\/head>/.test(indexHtml))

const css = readFileSync('src/styles.css', 'utf8')
const rootBlock = (css.match(/:root\s*\{[\s\S]*?\n\}/) || [''])[0]
check('styles.css 的 :root 里有 color-scheme: only light',
  /color-scheme:\s*only\s+light/.test(rootBlock),
  'CSS 这层是微信某些版本唯一认的那道保险')

// ---------------------------------------------------------------- 2 构建产物
console.log('\n【2】声明进了构建产物')
let distHtml = ''
let distCss = ''
try {
  distHtml = readFileSync('dist/index.html', 'utf8')
  const cssFiles = readdirSync(CANDIDATE_ASSETS).filter((f) => f.endsWith('.css'))
  distCss = cssFiles.map((f) => readFileSync(`${CANDIDATE_ASSETS}/${f}`, 'utf8')).join('\n')
} catch (e) {
  console.log(`  ⚠️ 读不到 dist（先 npm run build）：${e.message}`)
}
check('dist/index.html 带着 meta', /name="color-scheme"[^>]*only\s+light/.test(distHtml))
check('dist 的 CSS 带着 color-scheme（minify 后是 light only）',
  /color-scheme:\s*(only\s+)?light(\s+only)?[;}]/.test(distCss))

// ---------------------------------------------------------------- 3 真机渲染
const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json()).catch(() => null)
if (!version) {
  console.log('\n❌ 连不上 9222 调试口（需要带 --remote-debugging-port=9222 --enable-features=AutoDarkMode 的 Chrome）')
  process.exit(1)
}
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
  if (m.id) {
    const r = pending.get(m.id)
    if (r) { pending.delete(m.id); m.error ? r.reject(new Error(JSON.stringify(m.error))) : r.resolve(m.result) }
  }
})
function send(method, params = {}, session = sessionId) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
  })
}
const evaluate = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.value
const sleep = (ms) => evaluate(`new Promise(r => setTimeout(r, ${ms}))`)
const click = (expr) => evaluate(`(() => { ${expr} return true })()`)

/** 量一块区域的「平均亮度」：截图 → data URL 传回页面用 canvas 读像素（不需要任何图形库） */
async function brightness(clip) {
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })
  const out = await evaluate(`(async () => {
    const img = new Image()
    img.src = 'data:image/png;base64,${s.data}'
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    let sum = 0, n = 0
    for (let i = 0; i < d.length; i += 4) { sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++ }
    return Math.round(sum / n)
  })()`)
  return out
}

const ctx = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null)
sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
await send('Runtime.enable'); await send('Page.enable')
// ⚠️ 必须禁缓存：守卫要在同一个页面上反复导航（--prove 还会临时改产物），
//    不禁的话浏览器会拿缓存里的旧 index.html / CSS —— 于是「摘掉声明」测不出来，
//    守卫变成永远绿的摆设（第一次写就是这样假的）。
await send('Network.enable')
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
let autoDarkOk = true
try { await send('Emulation.setAutoDarkModeOverride', { enabled: true }) } catch { autoDarkOk = false }

console.log('\n【3】先校准尺子：没有声明的米色页在自动变暗下必须真的变暗')
const naked = 'data:text/html,' + encodeURIComponent('<meta charset="utf-8"><style>html,body{margin:0;background:#F6F1E8;height:100vh}</style>')
await send('Page.navigate', { url: naked })
await sleep(700)
const nakedL = await brightness({ x: 0, y: 0, width: 200, height: 300 })
check(`自动变暗开关可用（当前 Chrome 支持 setAutoDarkModeOverride）`, autoDarkOk, '用 --enable-features=AutoDarkMode 启动 Chrome')
check(`无声明页确实被反暗了（亮度 ${nakedL} < ${LIGHT_MIN}）`, nakedL < LIGHT_MIN,
  '如果这条不红，说明这台 Chrome 的自动变暗没生效 —— 后面的绿灯不算数，别当成通过')
const rulerOk = autoDarkOk && nakedL < LIGHT_MIN

console.log('\n【4】产品：深色模式下纸面必须还是米色')
await send('Page.navigate', { url })
await sleep(2600)
await evaluate('document.fonts.ready.then(() => true)')
await click(`const s = Array.from(document.querySelectorAll('button')).find(b => /先随便逛逛|随便逛逛/.test(b.textContent)); if (s) s.click();`)
await sleep(700)
const homeL = await brightness({ x: 0, y: 0, width: 390, height: 500 })
check(`首页是米色纸面（亮度 ${homeL} ≥ ${LIGHT_MIN}）`, homeL >= LIGHT_MIN, rulerOk ? '整页被反色了' : '（尺子没校准，这条不可信）')

// 进「软软的小屋」—— 用户报的就是这一页
await click(`const e = document.querySelector('.pet-visit-btn'); if (e) { e.scrollIntoView({ block: 'center', behavior: 'instant' }); e.click(); }`)
await sleep(500)
await click(`const e = Array.from(document.querySelectorAll('.pet-visit-bubble [role="button"]')).find(x => /小屋/.test(x.textContent)); if (e) e.click();`)
await sleep(1200)
const onPet = await evaluate(`!!document.querySelector('.pet-pat-btn')`)
check('走到了软软的小屋', onPet)
if (onPet) {
  await evaluate(`(async () => { for (let y = 0; y < 900; y += 400) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 180)) } window.scrollTo({ top: 0, behavior: 'instant' }); return true })()`)
  await sleep(400)
  const petL = await brightness({ x: 0, y: 0, width: 390, height: 420 })
  check(`软软的小屋是米色纸面（亮度 ${petL} ≥ ${LIGHT_MIN}）`, petL >= LIGHT_MIN,
    '这一页被反色 = 软软又会变成那只只剩描边的黑猫')

  // 猫图本身有没有被反色：奶白猫的像素应该偏亮
  const catL = await evaluate(`(async () => {
    const el = document.querySelector('.pet-photo')
    if (!el) return -1
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    return 1
  })()`)
  if (catL === 1) {
    await sleep(400)
    const raw = await evaluate(`(() => { const e = document.querySelector('.pet-photo'); const r = e.getBoundingClientRect(); return JSON.stringify({ x: Math.max(0, r.x + 8), y: Math.max(0, r.y + 8), width: Math.max(40, r.width - 16), height: Math.max(40, r.height - 16) }) })()`)
    const l = await brightness(JSON.parse(raw))
    check(`猫图本身没被反色（亮度 ${l} ≥ ${LIGHT_MIN}）`, l >= LIGHT_MIN, '奶白的软软被反成了黑猫')
  }
}

// ---------------------------------------------------------------- 5 反向自证
if (prove) {
  console.log('\n【5】--prove：把声明摘掉，守卫必须报警（证明它不是永远绿的摆设）')
  console.log('      （改的是 dist 产物，跑完 npm run build 即可恢复）')
  const cssFiles = readdirSync(CANDIDATE_ASSETS).filter((f) => f.endsWith('.css'))
  const backups = []
  const { writeFileSync } = await import('node:fs')
  const stripped = distHtml.replace(/\s*<meta name="color-scheme"[^>]*>/, '')
  check('能构造出「无声明」的产物来测', stripped !== distHtml)
  writeFileSync('dist/index.html', stripped)
  for (const f of cssFiles) {
    const p = `${CANDIDATE_ASSETS}/${f}`
    const t = readFileSync(p, 'utf8')
    backups.push([p, t])
    writeFileSync(p, t.replace(/color-scheme:\s*(only\s+)?light(\s+only)?;/g, ''))
  }
  await send('Page.navigate', { url })
  await sleep(2200)
  const brokeL = await brightness({ x: 0, y: 0, width: 390, height: 500 })
  check(`摘掉声明后首页确实被反暗（亮度 ${brokeL}）—— 守卫抓得到这个回归`, brokeL < LIGHT_MIN)
  for (const [p, t] of backups) writeFileSync(p, t)
  writeFileSync('dist/index.html', distHtml)
  console.log('      已还原产物')
}

await send('Target.disposeBrowserContext', { browserContextId: ctx }, null)
socket.close()

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} 过 / ${fail} 红`)
if (fail) {
  console.log('红的是：', failures.join(' · '))
  process.exit(1)
}
if (!rulerOk) {
  console.log('⚠️ 注意：尺子没校准（这台 Chrome 的自动变暗没生效），上面的绿灯不算数。')
  process.exit(2)
}
