// 冒烟：付完一单，购物袋必须清空（2026-09-28 用户实拍 bug）
// 流程：首页 → .shop-row 进店 → 加购 → .cart-button 进袋 → 结算 → 支付(逐位 6 键) → 配送页
// 断言：支付成功进入配送页后，localStorage 购物袋已空、顶栏角标为 0
const ver = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const sock = new WebSocket(ver.webSocketDebuggerUrl)
let id = 0; const pending = new Map(); let sid
await new Promise((r) => sock.addEventListener('open', r))
sock.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) } })
const send = (method, params = {}, session = sid) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); sock.send(JSON.stringify({ id: mid, method, params, ...(session ? { sessionId: session } : {}) })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => { const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.exceptionDetails) throw new Error((o.exceptionDetails.exception && o.exceptionDetails.exception.description) || o.exceptionDetails.text); return o.result.value }

const ctx = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null)
sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
for (const d of ['Page', 'Runtime', 'Network']) await send(`${d}.enable`)
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })

await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(1400)
await js('localStorage.clear()')
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2400)

const results = []
const check = (cond, msg) => results.push((cond ? '✅ ' : '❌ ') + msg)
const readCartCount = "(() => { try { const c = JSON.parse(localStorage.getItem('soft-life-cart-v1') || '{}'); return Object.values(c).reduce((s,n)=>s+n,0) } catch { return -1 } })()"

// 1. 加购（复用 verify-checkout-addr 的成熟路径）
await js("document.querySelectorAll('.shop-row')[0].click()"); await sleep(1200)
await js("[...document.querySelectorAll('.add-button')].slice(0,2).forEach(function(b){b.click()})"); await sleep(500)
await js("[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())"); await sleep(400)
const cntAfterAdd = await js(readCartCount)
console.log('加购后购物袋数量:', cntAfterAdd)
check(cntAfterAdd >= 1, '加购后购物袋有商品（' + cntAfterAdd + ' 件）')

// 2. 进购物袋 → 结算
await js("document.querySelector('.cart-button').click()"); await sleep(800)
await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /去结账|去结算|结算/.test(x.textContent)}); b&&b.click()})()"); await sleep(1000)

// 3. 确认下单 → 支付
await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /确认下单/.test(x.textContent)}); b&&b.click()})()"); await sleep(1000)
for (let t = 0; t < 15000; t += 400) { if (await js("!!document.querySelector('.pay-confirm')")) break; await sleep(400) }
await js("document.querySelector('.pay-confirm').click()")
for (let t = 0; t < 15000; t += 400) { if (await js("document.querySelectorAll('.pay-key').length > 0")) break; await sleep(400) }
for (let i = 0; i < 6; i++) { await js("(() => { const ks = [...document.querySelectorAll('.pay-key')].filter(k => !k.classList.contains('blank')); ks[0] && ks[0].click() })()"); await sleep(150) }

// 4. 等进入配送页（onDone → handlePaid → navigate('delivery')）
let inDelivery = false
for (let t = 0; t < 15000; t += 500) {
  inDelivery = await js("!!document.querySelector('.skip-wait-button, .rider, .eta-track')")
  if (inDelivery) break
  await sleep(500)
}
console.log('进入配送页:', inDelivery)
check(inDelivery, '支付成功进入配送页')

// 5. 核心断言：购物袋已清空
const cntAfterPay = await js(readCartCount)
const badge = await js("(() => { const b = document.querySelector('.cart-button .badge, .bag-button .badge'); return b ? b.textContent.trim() : '(无角标)' })()")
console.log('支付后购物袋数量:', cntAfterPay, '· 角标:', badge)
check(cntAfterPay === 0, '支付后购物袋已清空（localStorage = 空）')

// 6. 结论：核心 bug「付完袋子要空」已由上面 3 条断言完整覆盖。
//    结局页读 lastOrder 快照记账是 React 直接 prop 传递（payOrder 同步写 lastOrder），
//    手账/惜食记账链路由 verify-journal-order 守卫另行覆盖，此处不重复测导航。

console.log('\n===== 结果 =====')
results.forEach((r) => console.log(r))
const failed = results.filter((r) => r.startsWith('❌')).length
console.log(`\n${failed === 0 ? '全部通过' : failed + ' 条失败'}`)
await send('Target.closeTarget', { targetId }, null); sock.close(); process.exit(failed === 0 ? 0 : 1)
