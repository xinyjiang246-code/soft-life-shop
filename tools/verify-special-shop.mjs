// 验收「封面那几杯特调，是真能点进去买的商品」（2026-09-24 用户：「主页这个图片点击的话
// 应该是能跳到对应商品页面的」「加入旁边可以加一个立即购买这种，就有点像瑞幸的小程序」）。
//
// 为什么单写一条（不并进 verify-home-cover）：那条管的是**封面这块图片**（帧高 / 滚动 /
// 圆点 / 几何），这条管的是**特调变成商品之后的数据行为** —— 两件事，坏了要能分开定位。
//
// 盯的三件事：
//   [1] 茶饮铺菜单里特调**正好 4 杯**（= 封面上那叠）。12 杯全上架的话「今日」就没意义了；
//       一杯都不上架的话，点封面进去落不到实处。
//   [2] 「立即购买」= 加购 + 直接把你送到购物袋页，那件**真的在袋子里**（不是只跳页）。
//   [3] 老键 `special-today` 不丢 —— 09-24 之前特调只有一件，用的是这个 id；
//       老用户袋子里存着它，今天打开必须还能认出来（认不出就被对账清理默默删掉）。
//
// 用法：node tools/verify-special-shop.mjs [url] [截图前缀]
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const prefix = process.argv[3] || 'special-shop'
const workDir = `/tmp/${prefix}`
await mkdir(workDir, { recursive: true })

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  socket.addEventListener('open', res, { once: true })
  socket.addEventListener('error', rej, { once: true })
})

let nextId = 0
const pending = new Map()
const errors = []
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
  if (m.sessionId === sessionId && m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)
  }
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
const waitFor = (expr, t = 20000) => js(`new Promise((res, rej) => {
  const s = performance.now();
  const c = () => { if (${expr}) return res(true); if (performance.now() - s > ${t}) return rej(new Error('等不到: ' + ${JSON.stringify(expr)})); setTimeout(c, 120) }; c();
})`)
const tick = (ms = 150) => js(`new Promise(r => setTimeout(r, ${ms}))`)
const ok = (label, value) => console.log('  ✓', label, '=', JSON.stringify(value))
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${workDir}/${name}.png`, Buffer.from(r.data, 'base64'))
}

async function openPage() {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true }, null)
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url })
  await waitFor(`document.querySelector('.home-page')`)
  await js(`localStorage.clear()`)
  await send('Page.navigate', { url })
  await waitFor(`document.querySelector('.home-page')`)
  // 首次引导会盖住页面，点掉
  if (await js(`!!document.querySelector('.ob-skip')`)) {
    await js(`document.querySelector('.ob-skip').click()`)
    await tick(250)
  }
  if (await js(`!!document.querySelector('.hint-close')`)) {
    await js(`document.querySelector('.hint-close').click()`)
    await tick(250)
  }
  await js(`document.fonts.ready.then(() => 1)`)
}

const intoTeaShop = async () => {
  await waitFor(`document.querySelector('.hc-viewport')`, 20000)
  await tick(500)
  await js(`document.querySelector('.hc-viewport').click()`)
  await waitFor(`!!document.querySelector('.store-head h1')`, 15000)
  await tick(1100) // 等 smooth 滚动落定
}

// ══ [1] 茶饮铺菜单里特调正好 4 杯 ═══════════════════════════════════════════
console.log('\n[1] 特调上架数量')
await openPage()
await intoTeaShop()
const shopTabs = await js(`(() => {
  const tabs = [...document.querySelectorAll('.category-tab')].map((b) => b.textContent.trim())
  return { 分类: tabs, 有特调: tabs.some((t) => /特调/.test(t)), 全部行数: document.querySelectorAll('.menu-row').length }
})()`)
assert.ok(shopTabs.有特调, `茶饮铺分类里没有「AI 特调」这一栏：${shopTabs.分类.join(' / ')}`)
ok('分类里有 AI 特调', shopTabs.分类.join(' / '))

await js(`[...document.querySelectorAll('.category-tab')].find((b) => /特调/.test(b.textContent)).click()`)
await tick(350)
const shelf = await js(`(() => {
  const rows = [...document.querySelectorAll('.menu-row')]
  return { 杯数: rows.length, 名字: rows.map((r) => (r.querySelector('h3') || {}).textContent) }
})()`)
assert.equal(shelf.杯数, 4, `「AI 特调」下该是封面那 4 杯，现在是 ${shelf.杯数} 杯 —— ${shelf.杯数 === 12 ? '12 杯全上架了，「今日」就没了意义' : '数量不对，封面和菜单对不上'}`)
ok('在架正好 4 杯', shelf.名字.join(' / '))
await shot('01-tea-specials')

// ══ [2] 立即购买 → 进购物袋页，且那件真的在袋子里 ═══════════════════════════
console.log('\n[2] 立即购买')
// ⚠️ 别盲点 `.add-button`：从封面点进来的那一杯就是 `focusItemId`，
//    autoOpen 早就把它展开了 —— 再点一下是「关上」，会卡死在这条 waitFor 上（踩过）。
const autoOpened = await js(`(() => {
  const row = document.querySelector('.menu-row.is-open')
  return row ? { 菜: row.querySelector('h3').textContent.trim() } : null
})()`)
assert.ok(autoOpened, '从封面点进来，那一行没有自动展开 —— 用户还得自己再点一次 +，等于白跳')
ok('点进来那行本来就是展开的', autoOpened.菜)

await js(`document.querySelector('.menu-row.is-open').scrollIntoView({ block: 'center' })`)
await tick(400)
await waitFor(`document.querySelector('.menu-row.is-open .spec-buy')`, 8000)
const target = await js(`(() => {
  const row = document.querySelector('.menu-row.is-open')
  return {
    菜: row.querySelector('h3').textContent.trim(),
    加入文案: row.querySelector('.spec-add').textContent.trim(),
    立即购买文案: row.querySelector('.spec-buy').textContent.trim(),
    两颗都够高: [...row.querySelectorAll('.spec-actions button')].every((b) => b.getBoundingClientRect().height >= 44),
  }
})()`)
assert.equal(target.立即购买文案, '立即购买', `右边那颗该写「立即购买」，现在写的是「${target.立即购买文案}」`)
assert.ok(/^加入/.test(target.加入文案), `左边那颗该是「加入 ¥X」，现在写的是「${target.加入文案}」`)
assert.ok(target.两颗都够高, '「加入 / 立即购买」有一颗不到 44px 高（摸着太扁）')
ok('面板底部两颗', `「${target.加入文案}」+「${target.立即购买文案}」`)

await js(`document.querySelector('.menu-row.is-open .spec-buy').click()`)
await waitFor(`document.querySelector('.cart-list')`, 12000)
const bag = await js(`(() => ({
  行数: document.querySelectorAll('.cart-row').length,
  名字们: [...document.querySelectorAll('.cart-cn')].map((e) => e.textContent.trim()),
}))()`)
assert.equal(bag.行数, 1, `点「立即购买」后袋子里该只有刚买的那一件，现在 ${bag.行数} 行`)
assert.ok(bag.名字们.includes(target.菜), `袋子里是 ${JSON.stringify(bag.名字们)}，没有刚买的那件「${target.菜}」—— 只跳了页，东西没进去`)
ok('立即购买 → 袋子里真有', `${target.菜}`)
await shot('02-buy-now-bag')

// ══ [3] 老键 special-today 不丢（跨天 + 改版兼容）═══════════════════════════
console.log('\n[3] 老袋子里的 special-today')
await openPage()
await waitFor(`document.querySelector('.hc-name')`, 15000)
const todayName = await js(`document.querySelector('.hc-name').innerText.replace(/^今日特调 · /, '').trim()`)
await js(`localStorage.setItem('soft-life-cart-v1', JSON.stringify({ 'special-today': 1 }))`)
await send('Page.navigate', { url })
await waitFor(`document.querySelector('.home-page')`)
await js(`document.querySelector('.bag-button').click()`)
await waitFor(`document.querySelector('.cart-list') || document.querySelector('.cart-empty')`, 12000)
const legacy = await js(`(() => ({
  行数: document.querySelectorAll('.cart-row').length,
  名字们: [...document.querySelectorAll('.cart-cn')].map((e) => e.textContent.trim()),
  空袋提示: document.querySelector('.cart-empty')?.innerText.replace(/\s+/g, ' ').slice(0, 40) || null,
}))()`)
assert.equal(legacy.行数, 1, `老键 special-today 被丢了（袋子 ${legacy.行数} 行，提示「${legacy.空袋提示}」）—— 老用户存着的那单会凭空消失`)
assert.ok(legacy.名字们.includes(todayName), `老键解析出来是 ${JSON.stringify(legacy.名字们)}，不是今天那杯「${todayName}」`)
ok('老键认得出今天那杯', `${todayName}`)

if (errors.length) {
  console.error('\n❌ 控制台有异常：', errors.slice(0, 3).join('\n'))
  process.exit(1)
}

console.log(`\n✅ 特调商品化全绿：在架 4 杯 · 立即购买真的进袋子 · 老键 special-today 不丢\n`)
socket.close()
