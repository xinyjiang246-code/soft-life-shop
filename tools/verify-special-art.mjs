// 验证「今日特调 12 杯」与「世界菜单 10 城」的图真的进了产品、真的渲染出来了。
//
// 用法：node tools/verify-special-art.mjs [url]
//
// 为什么要有这个（2026-09-20 加的）：
//   用户问「每日特调是没有生成图片的，不知道为什么」—— 因为当初它跟世界菜单
//   被归成同一类「AI 现编、世界上并不存在」，所以只画手绘卡。
//   现在两层分开：特调 12 杯是**真实存在的饮料**（配实拍 + 油画棒两张），
//   世界菜单的菜才是现编的（给城市配图，菜品仍是手绘卡）。
//   ⚠️ 这条链有四段会在不同地方悄悄断掉，必须分开验：
//     ① dist 里有没有这 34 张图（构建/导入断了）—— 静态就能查
//     ② 首页特调卡有没有真的 <img>、两张图有没有解码成功
//     ③ 点一下能不能翻到油画棒那张（ItemArt 走的是哪条分支）
//     ④ 茶饮铺菜单 / 世界菜单明信片 / 首页入口有没有跟着出图
//   「build 绿 ≠ 接线对」在这里尤其成立：少一个 imageReal 字段，页面不会报错，
//   只会安静地退回手绘卡 —— 肉眼很容易当成「本来就这样」。
import { readdirSync } from 'node:fs'

const url = process.argv[2] || 'http://127.0.0.1:8080/'

// ⚠️ 顺序必须与 src/data.js 的 dailySpecials 一致 —— 首页特调按 dateSeed() % 12 取
const SLUGS = ['osmanthus-cold-brew', 'torched-milk-cap', 'grape-soda-americano', 'jasmine-milk-green',
  'mochi-brown-sugar', 'peach-oolong-fizz', 'tangerine-red-bean', 'coconut-ash-latte',
  'salted-yolk-cap', 'plum-green-tea', 'thick-cocoa-milk', 'sakura-salt-soda']
const CITIES = ['kyoto', 'seoul', 'bangkok', 'hanoi', 'taipei', 'chaoshan',
  'istanbul', 'lisbon', 'mexico', 'naples']

let pass = 0
let fail = 0
const failures = []
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; failures.push(label); console.log(`  ❌ ${label}${detail ? `  —— ${detail}` : ''}`) }
}

// ---------------------------------------------------------------- 1 构建产物
console.log('【1】34 张新图有没有真的进 dist（12 杯 × 2 + 10 城）')
let assets = []
try { assets = readdirSync('dist/assets') } catch { assets = [] }
const missing = []
for (const s of SLUGS) {
  for (const k of ['real', 'draw']) {
    if (!assets.some((f) => f.startsWith(`${s}-${k}-`) && f.endsWith('.webp'))) missing.push(`${s}-${k}`)
  }
}
for (const c of CITIES) {
  if (!assets.some((f) => f.startsWith(`${c}-city-`) && f.endsWith('.webp'))) missing.push(`${c}-city`)
}
check('24 张特调图全部在 dist 里', missing.filter((m) => !m.endsWith('-city')).length === 0,
  missing.filter((m) => !m.endsWith('-city')).join(' '))
check('10 张城市图全部在 dist 里', missing.filter((m) => m.endsWith('-city')).length === 0,
  missing.filter((m) => m.endsWith('-city')).join(' '))

// 今天轮到哪一杯 —— 复刻 data.js 的 dateSeed() % 12，用来断言「首页那杯就是数据里的那杯」
const d = new Date()
const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
const todaySlug = SLUGS[seed % SLUGS.length]
console.log(`      （今天 dateSeed=${seed} → 第 ${seed % SLUGS.length + 1} 杯：${todaySlug}）`)

// ---------------------------------------------------------------- 浏览器
const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
const jsErrors = []
const httpFails = []
let sessionId
let contextId

socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (m.id) {
    const req = pending.get(m.id)
    if (!req) return
    clearTimeout(req.timer)
    pending.delete(m.id)
    if (m.error) req.reject(new Error(JSON.stringify(m.error)))
    else req.resolve(m.result)
  } else if (m.sessionId === sessionId) {
    if (m.method === 'Runtime.exceptionThrown') {
      const dd = m.params.exceptionDetails
      jsErrors.push(dd.exception?.description || dd.text)
    }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      httpFails.push(`${m.params.response.status} ${m.params.response.url}`)
    }
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
    const t0 = performance.now();
    const check = () => {
      if (${expression}) return resolve(true);
      if (performance.now() - t0 > ${timeout}) return reject(new Error('timed out: ${expression.replace(/'/g, '')}'));
      setTimeout(check, 80);
    };
    check();
  })`)
}

const settle = () => evaluate('new Promise(r => setTimeout(r, 700))')
const WAIT_IMAGES = `Promise.race([
  Promise.all(Array.from(document.images).filter((im) => !im.complete).map((im) => new Promise((r) => {
    im.addEventListener('load', r, { once: true });
    im.addEventListener('error', r, { once: true });
  }))),
  new Promise((r) => setTimeout(r, 4000)),
]).then(() => true)`
const IMG_PROBE = `(() => {
  const bad = [];
  document.querySelectorAll('img').forEach((im) => {
    if (im.complete && im.naturalWidth === 0) bad.push(im.currentSrc || im.src);
  });
  return bad;
})()`
// 读一个盒子里「正面 / 背面」两张图的真实情况
const ART_PROBE = (sel) => `(() => {
  const box = document.querySelector(${JSON.stringify(sel)})
  if (!box) return null
  const frame = box.querySelector('.flip-frame')
  const imgs = Array.from(box.querySelectorAll('img'))
  return {
    n: imgs.length,
    front: (box.querySelector('.flip-front img') || {}).src || '',
    back: (box.querySelector('.flip-back img') || {}).src || '',
    widths: imgs.map((i) => i.naturalWidth),
    flipped: frame ? frame.dataset.flipped : null,
    hasToggle: !!box.querySelector('.flip-toggle'),
    visibleSrc: (box.querySelector('.flip-frame') ? imgs[0].src : '') || '',
  }
})()`

async function goto(target = url) {
  await send('Page.navigate', { url: target })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await evaluate('document.fonts.ready.then(() => true)')
  await evaluate(WAIT_IMAGES)
  await settle()
}

try {
  contextId = (await send('Target.createBrowserContext', { disposeOnDispose: true, disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

  await goto()

  // ---------------------------------------------------------------- 2 首页特调卡
  console.log('\n【2】首页「今日特调」卡：两张图在不在、解码没解码')
  const art = await evaluate(ART_PROBE('.special-art'))
  check('特调卡的图现在有了（.special-art 里是 ItemArt，不是写死的 DishArt）', !!art && art.n === 2,
    art ? `里面 ${art.n} 张 img` : '找不到 .special-art')
  if (art && art.n === 2) {
    check('正面是实拍（prefer="real"）', art.front.includes(`${todaySlug}-real`), art.front)
    check('背面是油画棒', art.back.includes(`${todaySlug}-draw`), art.back)
    check('两张都真的解码出来了', art.widths.every((w) => w > 0), `naturalWidth = ${art.widths.join(',')}`)
    check('初始是未翻面状态', art.flipped === 'false', String(art.flipped))
    check('有翻面按钮（说明走的是翻面卡分支）', art.hasToggle === true)
  }

  // ---------------------------------------------------------------- 3 翻面
  console.log('\n【3】点一下能不能翻到油画棒那张')
  await evaluate(`(() => { const b = document.querySelector('.special-art .flip-toggle'); if (b) b.click(); return true })()`)
  await evaluate('new Promise(r => setTimeout(r, 950))')
  const after = await evaluate(ART_PROBE('.special-art'))
  check('点完变成 data-flipped="true"（油画棒那张转到正面）', after && after.flipped === 'true',
    after ? String(after.flipped) : '读不到')
  check('翻面后没有断图', (await evaluate(IMG_PROBE)).length === 0)

  // ---------------------------------------------------------------- 4 世界菜单
  console.log('\n【4】世界菜单：明信片照片 + 首页入口缩略图')
  // ⚠️ 入口在首屏之下，缩略图又是 loading="lazy" —— 不先滚进视口就量 naturalWidth，
  //    量到的一定是 0。2026-09-20 首次跑就吃了这个假警报，别把它当成产品没出图。
  await evaluate(`(() => {
    const b = document.querySelector('.world-entry')
    if (b) b.scrollIntoView({ block: 'center', behavior: 'instant' })
    return true
  })()`)
  await evaluate(WAIT_IMAGES)
  await settle()
  const entry = await evaluate(`(() => {
    const f = document.querySelector('.world-entry-flag')
    const img = f ? f.querySelector('img') : null
    return { hasImg: !!img, src: img ? img.src : '', w: img ? img.naturalWidth : 0 }
  })()`)
  check('首页「今日空运自…」入口换成了城市图', entry.hasImg && entry.w > 0,
    entry.hasImg ? `naturalWidth=${entry.w}` : '里面还是图标，没有 img')
  check('入口那张是十座城市之一', CITIES.some((c) => entry.src.includes(`${c}-city`)), entry.src)

  await evaluate(`(() => { const b = document.querySelector('.world-entry'); if (b) b.click(); return true })()`)
  await waitFor('document.querySelector(".pc-photo img") !== null && document.querySelector(".product-grid") !== null')
  await evaluate(WAIT_IMAGES)
  await settle()
  const pc = await evaluate(`(() => {
    const im = document.querySelector('.pc-photo img')
    return { has: !!im, src: im ? im.src : '', w: im ? im.naturalWidth : 0,
             city: (document.querySelector('.pc-copy h1') || {}).innerText || '' }
  })()`)
  check('明信片上有城市照片，且解码成功', pc.has && pc.w > 0, `naturalWidth=${pc.w}`)
  check('明信片照片与今天这座城市对得上', pc.src.includes(`${CITIES.find((c) => pc.src.includes(`${c}-city`))}`),
    `${pc.city} / ${pc.src}`)
  const worldBad = await evaluate(IMG_PROBE)
  check('世界菜单没有断图', worldBad.length === 0, worldBad.join(' '))

  // ---------------------------------------------------------------- 5 茶饮铺菜单
  console.log('\n【5】茶饮铺菜单里那一行特调也有图')
  await goto()
  await evaluate(`(() => { const r = document.querySelector('.shop-row'); if (r) r.click(); return true })()`)
  await waitFor('document.querySelector(".menu-list, .menu-empty") !== null')
  await evaluate(WAIT_IMAGES)
  await settle()
  const menu = await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('.menu-row'))
    const hit = rows.find((r) => { const im = r.querySelector('img'); return im && im.src.includes(${JSON.stringify(todaySlug)}) })
    const im = hit ? hit.querySelector('img') : null
    return { rows: rows.length, found: !!hit, w: im ? im.naturalWidth : 0,
             bad: ${IMG_PROBE} }
  })()`)
  check(`茶饮铺菜单里找到了今天这杯（${todaySlug}）的图`, menu.found, `${menu.rows} 行菜单`)
  check('它在菜单里也真的解码出来了', menu.w > 0, `naturalWidth=${menu.w}`)
  check('菜单里没有断图', menu.bad.length === 0, menu.bad.join(' '))

  // ---------------------------------------------------------------- 6 全局
  console.log('\n【6】全局：JS 报错 / 4xx')
  check('全程没有 JS 异常', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '))
  check('全程没有 4xx / 5xx 请求', httpFails.length === 0, httpFails.slice(0, 3).join(' | '))
} finally {
  try { if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null) } catch { /* 忽略 */ }
  socket.close()
}

console.log(`\n=== 通过 ${pass} 项，失败 ${fail} 项 ===`)
process.exit(fail === 0 ? 0 : 1)
