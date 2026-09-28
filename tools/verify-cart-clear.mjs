// 冒烟：付完一单，袋子只清「勾走的」那部分（2026-09-28 勾选购买）
// 场景 A（部分勾选）：2 行 → 点掉第一行 → 结算支付 → 袋里剩第一行（没勾的原地留着）
// 场景 B（全勾=默认）：再进店加一件 → 全勾支付 → 袋子全空（「付完袋子要空」回归覆盖）
// 流程：首页 → .shop-row 进店 → 加购 → .cart-button 进袋 → 勾选 → 结算 → 支付(逐位 6 键) → 配送页
const ver = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const sock = new WebSocket(ver.webSocketDebuggerUrl)
let id = 0; const pending = new Map(); let sid
await new Promise((r) => sock.addEventListener('open', r))
sock.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) } })
const send = (method, params = {}, session = sid) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); sock.send(JSON.stringify({ id: mid, method, params, ...(session ? { sessionId: session } : {}) })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => { const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.exceptionDetails) throw new Error((o.exceptionDetails.exception && o.exceptionDetails.exception.description) || o.exceptionDetails.text); return o.result.value }

const ctx = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
let { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null)
sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
const openFresh = async () => {
  // 经过支付/配送长流程的旧标签页 CDP 会话会悬死（evaluate 永不返回）——
  // 场景 B 一律换新标签页，别复用。
  try { await send('Target.closeTarget', { targetId }, null) } catch {}
  ;({ targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null))
  sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  for (const d of ['Page', 'Runtime', 'Network']) await send(`${d}.enable`)
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })
}

const results = []
const check = (cond, msg) => results.push((cond ? '✅ ' : '❌ ') + msg)
const readCart = "(() => { try { return JSON.parse(localStorage.getItem('soft-life-cart-v1') || '{}') } catch { return {} } })()"
const cartCount = (c) => Object.values(c).reduce((s, n) => s + n, 0)

// 支付全流程（点确认下单 → 选方式 → 逐位 6 键 → 等进配送页）
const payThrough = async () => {
  await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /确认下单/.test(x.textContent)}); b&&b.click()})()"); await sleep(1000)
  for (let t = 0; t < 15000; t += 400) { if (await js("!!document.querySelector('.pay-confirm')")) break; await sleep(400) }
  await js("document.querySelector('.pay-confirm').click()")
  for (let t = 0; t < 15000; t += 400) { if (await js("document.querySelectorAll('.pay-key').length > 0")) break; await sleep(400) }
  for (let i = 0; i < 6; i++) { await js("(() => { const ks = [...document.querySelectorAll('.pay-key')].filter(k => !k.classList.contains('blank')); ks[0] && ks[0].click() })()"); await sleep(150) }
  let inDelivery = false
  for (let t = 0; t < 15000; t += 500) {
    inDelivery = await js("!!document.querySelector('.skip-wait-button, .rider, .eta-track')")
    if (inDelivery) break
    await sleep(500)
  }
  return inDelivery
}

await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(1400)
await js('localStorage.clear()')
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2400)

// ===== 场景 A：部分勾选 =====
// 1. 加购两件（复用成熟路径）
await js("document.querySelectorAll('.shop-row')[0].click()"); await sleep(1200)
await js("[...document.querySelectorAll('.add-button')].slice(0,2).forEach(function(b){b.click()})"); await sleep(500)
await js("[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())"); await sleep(400)

// 2. 进袋；万一两颗按钮只有一件生效（同键合并），补一行标准茶饮键再进袋
await js("document.querySelector('.cart-button').click()"); await sleep(800)
let rows = await js("document.querySelectorAll('.cart-row').length")
if (rows < 2) {
  await js("(() => { const c = " + readCart + "; c['m1'] = (c['m1'] || 0) + 1; localStorage.setItem('soft-life-cart-v1', JSON.stringify(c)); return Object.keys(c).length })()")
  await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2200)
  await js("document.querySelector('.cart-button').click()"); await sleep(800)
  rows = await js("document.querySelectorAll('.cart-row').length")
}
check(rows >= 2, '袋里有两行商品（rows = ' + rows + '）')

// 3. 默认全选
let onCount = await js("document.querySelectorAll('.cart-check.is-on').length")
check(onCount === rows, '默认全部勾上（is-on = ' + onCount + '/' + rows + '）')

// 4. 点掉第一行 → 弱化 + 底栏只剩 1 件
await js("document.querySelectorAll('.cart-check')[0].click()"); await sleep(400)
onCount = await js("document.querySelectorAll('.cart-check.is-on').length")
const skipped = await js("document.querySelectorAll('.cart-row.is-skipped').length")
check(onCount === rows - 1 && skipped === 1, '点掉第一行后 is-on = ' + onCount + '、弱化行 = ' + skipped)
const label = await js("(document.querySelector('.bottom-label') || {textContent:''}).textContent")
check(/1 件/.test(label), '底栏按勾选显示「1 件」（实际「' + label.trim() + '」）')

// 5. 结算 → 支付 → 配送页
await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /去结账|去结算|结算/.test(x.textContent)}); b&&b.click()})()"); await sleep(1000)
const inDelivery = await payThrough()
console.log('进入配送页:', inDelivery)
check(inDelivery, '支付成功进入配送页')

// 6. 核心断言：袋里剩的正是没勾那行（1 键 1 件），不是全清也不是没清
const cartA = await js(readCart)
console.log('支付后购物袋:', JSON.stringify(cartA))
check(Object.keys(cartA).length === 1 && cartCount(cartA) === 1, '没勾那行留在袋里（键数 = ' + Object.keys(cartA).length + '、件数 = ' + cartCount(cartA) + '）')

// ===== 场景 B：全勾（默认）→ 全清 =====
// 场景 A 支付后袋里剩了 m1（没勾那行）—— 这里先清干净，再独立测「全勾→全清」，
// 免得跟上一场景的残留键合并、断言行数对不上（键合并是正常行为，不是 bug）。
await openFresh()
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2400)
await js('localStorage.clear()')
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2200)
await js("document.querySelectorAll('.shop-row')[0].click()"); await sleep(1200)
await js("[...document.querySelectorAll('.add-button')].slice(0,2).forEach(function(b){b.click()})"); await sleep(500)
await js("[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())"); await sleep(400)
await js("document.querySelector('.cart-button').click()"); await sleep(800)
const rowsB = await js("document.querySelectorAll('.cart-row').length")
const onB = await js("document.querySelectorAll('.cart-check.is-on').length")
check(rowsB >= 2 && onB === rowsB, '重进袋子：' + rowsB + ' 行、默认全勾 ' + onB)
await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /去结账|去结算|结算/.test(x.textContent)}); b&&b.click()})()"); await sleep(1000)
const inDeliveryB = await payThrough()
check(inDeliveryB, '场景 B 支付成功进入配送页')
const cartB = await js(readCart)
check(Object.keys(cartB).length === 0, '全勾支付后袋子全空（' + JSON.stringify(cartB) + '）')

console.log('\n===== 结果 =====')
results.forEach((r) => console.log(r))
const failed = results.filter((r) => r.startsWith('❌')).length
console.log(`\n${failed === 0 ? '全部通过' : failed + ' 条失败'}`)
await send('Target.closeTarget', { targetId }, null); sock.close(); process.exit(failed === 0 ? 0 : 1)
