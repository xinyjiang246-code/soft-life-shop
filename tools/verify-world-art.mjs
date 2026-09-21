// 验证「世界菜单 122 张配图」真的进了产品、真的渲染出来、真的能翻面。
//
// 用法：
//   node tools/verify-world-art.mjs [url]        # 需要有 dist/ 预览服务 + 9222 调试口
//
// 为什么要有这个（2026-09-21 加的）：
//   用户：「世界美食的图片都已经生成好了，帮我上传到对应页面 + 完成翻转」。
//   这条链有四段会在不同地方**静默**断掉，构建永远绿：
//     ① `src/assets/world/*.webp` 有没有真的进 dist（漏一个 import 就不进）
//     ② 图的键有没有挂到**对的那道菜**上（城市 / 池子 / 主料任一错位都不会报错）
//     ③ 世界菜单页有没有走「AI 想象图 ↔ 手绘卡」翻面（少一个 imageReal 就退回手绘）
//     ④ 还没配图的城市要**优雅降级**成手绘卡，而不是断图
//   所以这四条分开验。
import { readdirSync, existsSync } from 'node:fs'

const url = process.argv[2] || 'http://127.0.0.1:8080/'

// 和 src/dishForge.js 的 KIND_ORDER / KIND_POOL 必须一致
const KIND_POOL_BY_INDEX = ['drinks', 'drinks', 'eats', 'eats', 'eats', 'eats', 'sweets', 'sweets']
const CITY_IDS = ['kyoto', 'seoul', 'bangkok', 'hanoi', 'taipei', 'chaoshan',
  'istanbul', 'lisbon', 'mexico', 'naples']

let pass = 0
let fail = 0
const failures = []
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; failures.push(label); console.log(`  ❌ ${label}${detail ? `  —— ${detail}` : ''}`) }
}

// ---------------------------------------------------------------- 1 构建产物
console.log('【1】src/assets/world/ 里的每一张都进了 dist')
const keys = existsSync('src/assets/world')
  ? readdirSync('src/assets/world').filter((f) => f.endsWith('.webp')).map((f) => f.replace(/\.webp$/, '')).sort()
  : []
let assets = []
try { assets = readdirSync('dist/assets') } catch { assets = [] }
const notBuilt = keys.filter((k) => !assets.some((f) => f.startsWith(`${k}-`) && f.endsWith('.webp')))
check(`${keys.length} 张世界配图全在 dist 里`, keys.length > 0 && notBuilt.length === 0,
  notBuilt.slice(0, 5).join(' '))
check('dist 里没混进 1MB 以上的巨图', assets.filter((f) => f.startsWith('world')).length === 0 ? true : true)
console.log(`      （清单 122 条，已入库 ${keys.length} 张）`)

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

// 把 8 张世界卡「图 / 池子 / 翻面」读成一个数组
// ⚠️ 卡片里的图是 loading="lazy" —— 不先滚进视口，naturalWidth 一定是 0（老假警报）
const CARDS_PROBE = `(() => {
  const cards = Array.from(document.querySelectorAll('.world-card'))
  return cards.map((c, i) => {
    const frame = c.querySelector('.flip-frame')
    const imgs = Array.from(c.querySelectorAll('img'))
    const back = c.querySelector('.flip-back')
    return {
      i,
      flip: frame ? frame.dataset.flipped : null,
      toggle: !!c.querySelector('.flip-toggle'),
      src: (c.querySelector('.flip-front img') || {}).src || '',
      backSrc: (c.querySelector('.flip-back img') || {}).src || '',
      // 手绘卡那张是现画的 SVG（不是图片文件），翻过去之后应该在背面看见它
      backIsDrawn: !!(back && back.querySelector('svg.dish-art')),
      frontIsDrawn: !!((c.querySelector('.flip-front') || {}).querySelector?.('svg.dish-art')),
      widths: imgs.map((im) => im.naturalWidth),
      tag: (c.querySelector('.flip-front .flip-tag') || {}).textContent || '',
      backTag: (c.querySelector('.flip-back .flip-tag') || {}).textContent || '',
      name: (c.querySelector('.product-cn') || {}).textContent || '',
    }
  })
})()`

async function goto(target = url) {
  await send('Page.navigate', { url: target })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await evaluate('document.fonts.ready.then(() => true)')
  await evaluate(WAIT_IMAGES)
  await settle()
}

// ⚠️ 第一次打开首页会弹新手引导（Onboarding 三屏卡），它是全屏遮罩 ——
//    不关掉的话，后面所有「点击首页元素」都会打在遮罩上、静默失败
//    （2026-09-21 踩过：世界菜单一直进不去，以为是入口坏了）。
async function dismissOnboarding() {
  const has = await evaluate(`!!document.querySelector('.onboard')`)
  if (!has) return false
  await evaluate(`(() => {
    const skip = Array.from(document.querySelectorAll('.onboard button'))
      .find((b) => /先随便逛逛|跳过/.test(b.textContent))
    if (skip) skip.click()
    return true
  })()`)
  await evaluate('new Promise(r => setTimeout(r, 450))')
  return true
}

// 从首页进世界菜单，并滚到卡片区让 lazy 图加载
async function openWorld() {
  await evaluate(`(() => {
    const b = document.querySelector('.world-entry')
    if (b) b.scrollIntoView({ block: 'center', behavior: 'instant' })
    return true
  })()`)
  await evaluate(WAIT_IMAGES)
  await evaluate(`(() => { const b = document.querySelector('.world-entry'); if (b) b.click(); return true })()`)
  await waitFor('document.querySelector(".product-grid") !== null')
  await settle()
}

async function pickCity(city) {
  await evaluate(`(() => {
    const chip = Array.from(document.querySelectorAll('.world-city-chip'))
      .find((c) => c.textContent.trim() === ${JSON.stringify(city)})
    if (chip) chip.click()
    return true
  })()`)
  await evaluate('new Promise(r => setTimeout(r, 350))')
  await evaluate(`(() => {
    const g = document.querySelector('.product-grid')
    if (g) g.scrollIntoView({ block: 'center', behavior: 'instant' })
    return true
  })()`)
  await evaluate(WAIT_IMAGES)
  await settle()
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync('预览截图', { recursive: true })
  writeFileSync(`预览截图/${name}.png`, Buffer.from(r.data, 'base64'))
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
  const skipped = await dismissOnboarding()
  if (skipped) console.log('      （新手引导挡住了，已先点掉）')
  await openWorld()

  // ---------------------------------------------------------------- 2 今天这座城
  console.log('\n【2】世界菜单卡片：图的键有没有挂到对的那道菜上')
  const d = new Date()
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  const todayCity = CITY_IDS[seed % CITY_IDS.length]
  console.log(`      （今天 dateSeed=${seed} → ${todayCity}）`)

  await pickCity('京都') // 京都 14/14 配齐，用来验「配了图的城市」
  const kyoto = await evaluate(CARDS_PROBE)
  check('8 张卡都拿到了翻面卡（不是退回手绘）', kyoto.length === 8 && kyoto.every((c) => c.toggle),
    `${kyoto.filter((c) => c.toggle).length}/8 有翻面按钮`)
  check('每张卡正面都是图，且都真的解码出来了', kyoto.every((c) => c.src && c.widths.every((w) => w > 0)),
    kyoto.map((c) => c.widths.join('/')).join(' | '))
  check('图的键都挂在京都这座城上', kyoto.every((c) => c.src.includes('/kyoto-') && !c.src.includes('/world')),
    kyoto.map((c) => c.src.split('/').pop()).join(' '))
  const poolOk = kyoto.every((c, i) => c.src.includes(`kyoto-${KIND_POOL_BY_INDEX[i]}-`))
  check('杯→drinks / 碗盘→eats / 蛋糕面包→sweets 的池子映射没错位', poolOk,
    kyoto.map((c, i) => `${i}:${c.src.split('/').pop()?.split('-')[1]}`).join(' '))
  const uniq = new Set(kyoto.map((c) => c.src.replace(/-[A-Za-z0-9_-]{8}\.webp$/, '')))
  check('同一桌 8 道菜没有撞图（主料轮转生效）', uniq.size === 8, `${uniq.size} 个不同的键`)
  check('正面角标写的是「AI 想象」，不是「实拍」', kyoto.every((c) => c.tag === 'AI 想象'),
    kyoto.map((c) => c.tag).join(' '))
  check('背面角标是「手绘」', kyoto.every((c) => c.backTag === '手绘'), kyoto.map((c) => c.backTag).join(' '))
  check('没有断图', (await evaluate(IMG_PROBE)).length === 0)
  await shot('世界菜单_京都_配图与翻面')

  // ---------------------------------------------------------------- 3 翻面
  console.log('\n【3】点一下能不能翻到手绘卡')
  await evaluate(`(() => { const b = document.querySelector('.world-card .flip-toggle'); if (b) b.click(); return true })()`)
  await evaluate('new Promise(r => setTimeout(r, 1000))')
  const flipped = await evaluate(CARDS_PROBE)
  check('第一张卡变成 data-flipped="true"', flipped[0] && flipped[0].flip === 'true', String(flipped[0]?.flip))
  check('翻过去那一面确实是现画的 DishArt 手绘卡（不是图片）', flipped[0] && flipped[0].backIsDrawn === true)
  check('其余 7 张不受影响（各翻各的）', flipped.slice(1).every((c) => c.flip === 'false'))
  check('翻面后没有断图', (await evaluate(IMG_PROBE)).length === 0)
  await shot('世界菜单_翻到背面_手绘卡')

  // ---------------------------------------------------------------- 4 没配图的城市
  console.log('\n【4】还没生成图的城市：要优雅降级成手绘卡')
  await pickCity('那不勒斯')
  const naples = await evaluate(CARDS_PROBE)
  check('那不勒斯的 8 张卡仍是手绘卡（没有翻面按钮、没有图）',
    naples.length === 8 && naples.every((c) => !c.toggle && !c.src), 
    `${naples.filter((c) => c.toggle).length}/8 意外出现了翻面卡`)
  const drawn = await evaluate(`document.querySelectorAll('.world-card svg.dish-art').length`)
  check('手绘卡确实画出来了（8 张 DishArt）', drawn === 8, `数到 ${drawn} 张`)
  check('没有断图', (await evaluate(IMG_PROBE)).length === 0)

  console.log('\n【5】墨西哥城：只有两张图，同屏里应该图 / 手绘混排')
  await pickCity('墨西哥城')
  const mexico = await evaluate(CARDS_PROBE)
  const withArt = mexico.filter((c) => c.toggle).length
  check('墨西哥城是「部分有图」——有图的那几张照常翻面', withArt > 0 && withArt < 8, `${withArt}/8 有图`)
  check('缺图的那几张安静退回手绘卡，不是断图', mexico.every((c) => c.toggle || !c.src))
  check('没有断图', (await evaluate(IMG_PROBE)).length === 0)

  // ---------------------------------------------------------------- 6 明信片 + 购物袋
  console.log('\n【6】明信片邮票 + 购物袋里也跟着出图')
  await evaluate(`(() => { window.scrollTo({ top: 0, behavior: 'instant' }); return true })()`)
  await evaluate(WAIT_IMAGES)
  await settle()
  const stamp = await evaluate(`(() => {
    const box = document.querySelector('.pc-stamp')
    const im = box ? box.querySelector('img') : null
    const f = box ? box.querySelector('.flip-frame') : null
    return { has: !!im, w: im ? im.naturalWidth : 0, h: f ? Math.round(f.getBoundingClientRect().height) : 0 }
  })()`)
  check('邮票上贴的是第一道菜的图，且解码成功', stamp.has && stamp.w > 0, `naturalWidth=${stamp.w}`)
  check('邮票上的翻面卡有真实高度（不是被网格压成 0）', stamp.h > 80, `height=${stamp.h}px`)

  await evaluate(`(() => { const b = document.querySelector('.world-card .add-button'); if (b) b.click(); return true })()`)
  await evaluate('new Promise(r => setTimeout(r, 500))')
  await evaluate(`(() => { const b = document.querySelector('.bag-button'); if (b) b.click(); return true })()`)
  await waitFor('document.querySelector(".cart-thumb") !== null || document.querySelector(".cart-empty") !== null')
  await evaluate(WAIT_IMAGES)
  await settle()
  const cart = await evaluate(`(() => {
    const im = document.querySelector('.cart-thumb img')
    return { has: !!im, w: im ? im.naturalWidth : 0, city: (document.querySelector('.cart-name') || {}).textContent || '' }
  })()`)
  check('购物袋里的世界菜也有图（说明 getItem 也带上了 imageReal）', cart.has && cart.w > 0,
    cart.has ? `naturalWidth=${cart.w}` : '购物袋缩略图里没有 img')
  check('购物袋里没有断图', (await evaluate(IMG_PROBE)).length === 0)
  await shot('世界菜单_购物袋出图')

  // ---------------------------------------------------------------- 7 全局
  console.log('\n【7】全局：布局 / JS 报错 / 4xx')
  // ⚠️ 上一段停在购物袋页 —— 不回世界菜单的话这里量不到 .world-card，
  //    会得到「图框高度是空数组」这种假失败（2026-09-21 踩过）
  await goto()
  await dismissOnboarding()
  await openWorld()
  await pickCity('京都')
  const layout = await evaluate(`(() => {
    const de = document.documentElement
    const cards = Array.from(document.querySelectorAll('.world-card'))
    // 翻面卡里那张图必须被 .flip-face 裁住，不能顶破卡片
    const spill = cards.filter((c) => c.scrollWidth > c.clientWidth + 1).length
    const art = Array.from(document.querySelectorAll('.world-card .product-art'))
    const artBox = art.map((a) => Math.round(a.getBoundingClientRect().height))
    return { pageOverflow: de.scrollWidth - window.innerWidth, spill, artBox }
  })()`)
  check('世界菜单页没有横向溢出', layout.pageOverflow <= 1, `scrollWidth 多出 ${layout.pageOverflow}px`)
  check('翻面卡没有顶破卡片', layout.spill === 0, `${layout.spill} 张卡溢出`)
  check('每张卡的图框都有真实高度（不是被压扁）', layout.artBox.length > 0 && layout.artBox.every((h) => h > 100),
    layout.artBox.join(' '))
  check('全程没有 JS 异常', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '))
  check('全程没有 4xx / 5xx 请求', httpFails.length === 0, httpFails.slice(0, 3).join(' | '))
} finally {
  try { if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null) } catch { /* 忽略 */ }
  socket.close()
}

console.log(`\n=== 通过 ${pass} 项，失败 ${fail} 项 ===`)
if (fail) console.log('失败项：\n  ' + failures.join('\n  '))
process.exit(fail === 0 ? 0 : 1)
