import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'

// 验收：「手账就是订单」轻量补全（2026-09-23）——
//   ① 订单自动记下的每一笔带店名（place）和这一单的概要（order:{count,total,pay}）；
//   ② 结局页回执文案改成「去手账看看这一单」；
//   ③ 手账详情卡里渲染出「同一单还有 N 样 · 共 ¥X · 支付方式」那一行。
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

// —— 走完整一单到结局页（同 verify-review 的稳定路径，加 2 件商品好测「同一单还有 N 样」）——
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(1400)
await js("localStorage.clear(); localStorage.setItem('soft-life-wait-override-v1','8')") // 8 秒短等待：快进花 1 分钟额度，守卫走得完
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2400)
await js("document.querySelectorAll('.shop-row')[0].click()"); await sleep(1200)
await js("[...document.querySelectorAll('.add-button')].slice(0, 2).forEach(function (b) { b.click() })"); await sleep(400)
await js("[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())"); await sleep(400)
await js("document.querySelector('.cart-button').click()"); await sleep(800)
await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /去结账|结算|下单/.test(x.textContent)}); b&&b.click()})()"); await sleep(800)
await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /确认|下单|提交/.test(x.textContent)}); b&&b.click()})()"); await sleep(1200)
for (let t = 0; t < 15000; t += 400) { if (await js("!!document.querySelector('.pay-confirm')")) break; await sleep(400) }
await js("document.querySelector('.pay-confirm').click()")
for (let t = 0; t < 15000; t += 400) { if (await js("document.querySelectorAll('.pay-key').length > 0")) break; await sleep(400) }
for (let i = 0; i < 6; i++) { await js("(() => { const ks = [...document.querySelectorAll('.pay-key')].filter(k => !k.classList.contains('blank')); ks[0] && ks[0].click() })()"); await sleep(150) }
for (let t = 0; t < 30000; t += 600) { if (await js("!!document.querySelector('.skip-wait-button')")) break; await sleep(600) }
await js("document.querySelector('.skip-wait-button').click()"); await sleep(800)
await js("document.querySelector('.exchange-option').click()"); await sleep(2600)
for (let t = 0; t < 15000; t += 500) { if (await js("!!document.querySelector('.ending-card')")) break; await sleep(500) }
await sleep(900)

// ① 结局页回执文案
const recapText = await js("document.querySelector('.journal-recap') ? document.querySelector('.journal-recap').innerText.replace(/\\n/g,' | ') : '（无回执卡）'")
console.log('结局页回执卡:', recapText)
assert.ok(/去手账看看这一单/.test(recapText), '回执卡按钮该是「去手账看看这一单」')
assert.ok(/店名和这一单的价/.test(recapText), '回执卡该补上「店名和这一单的价都记着呢」')

// ② localStorage：订单笔带 place + order
const journalInfo = await js(`(() => {
  const j = JSON.parse(localStorage.getItem('soft-life-journal-v1'))
  const d = new Date(); const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
  const items = j.days[k]?.items || []
  return JSON.stringify({ count: items.length, items })
})()`)
console.log('今天手账:', journalInfo)
const jj = JSON.parse(journalInfo)
const orderEntries = jj.items.filter((it) => it.id != null) // 有商品 id = 订单自动记下的笔
assert.ok(orderEntries.length >= 2, '该有至少 2 笔订单笔，实际 ' + orderEntries.length)
for (const e of orderEntries) {
  assert.ok(e.place, '订单笔该带店名 place，实际 ' + JSON.stringify(e))
  assert.ok(e.order && typeof e.order.total === 'number' && e.order.total > 0, '订单笔该带 order.total，实际 ' + JSON.stringify(e.order))
  assert.ok(e.order.count === orderEntries.length, 'order.count 该等于这一单的样数 ' + orderEntries.length + '，实际 ' + e.order.count)
}

// ③ 点「去手账看看这一单」→ 切到今天 → 点开一笔 → 详情卡出现「这一单」行
await js("document.querySelector('.journal-recap-link').click()"); await sleep(900)
await js("[...document.querySelectorAll('.jh-dock button')].find(b=>b.textContent.trim()==='今天').click()"); await sleep(600)
const lineOk = await js("!!document.querySelector('.jh-line')")
assert.ok(lineOk, '手账今天视图该有可点的记录')
await js("document.querySelector('.jh-line').click()"); await sleep(700)
const orderRow = await js("document.querySelector('.jh-detail-row.is-order') ? document.querySelector('.jh-detail-row.is-order').innerText : '（无）'")
console.log('详情卡「这一单」行:', orderRow)
assert.ok(/共 ¥/.test(orderRow), '详情卡该渲染「共 ¥」那一行，实际 ' + orderRow)
assert.ok(/同一单还有 1 样|这一单就这一样/.test(orderRow), '该写明这一单几样，实际 ' + orderRow)

const shot = await send('Page.captureScreenshot', { format: 'png' })
await writeFile('/tmp/journal-order-detail.png', Buffer.from(shot.data, 'base64'))
console.log('SHOT /tmp/journal-order-detail.png')

await send('Target.disposeBrowserContext', { browserContextId: ctx }, null).catch(() => {})
sock.close()
console.log('\n✅ 订单↔手账结合全绿')
process.exit(0)
