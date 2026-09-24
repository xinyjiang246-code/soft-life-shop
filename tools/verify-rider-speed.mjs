import assert from 'node:assert/strict'

// 验收：「帮他看路」的速度起伏（2026-09-23 选 A：有起伏、不越跑越快）。
// 每 8 样一个周期 —— 前 3 样是「一阵风」快档 1872ms，后 5 样回到基准 2600ms，
// 周期循环、永不累积。这里只做两件事：
//   ① 采样 18s（覆盖约 9 样），确认两种滑动时长都出现；
//   ② 确认没有任何时长比基准更快（= 没有第三档、没有越跑越快）。
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

// —— 走完整一单到等待页（同 verify-wait-modes 的稳定路径）——
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(1400)
await js('localStorage.clear()')
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

// —— 切到「帮他看路」——
await js("[...document.querySelectorAll('.wait-mode')].find(c=>c.textContent.includes('帮他看路')).click()")
for (let t = 0; t < 6000; t += 300) { if (await js("!!document.querySelector('.rider-hop')")) break; await sleep(300) }
await sleep(300)

// —— 采样 18s，收集每个障碍的滑动时长 ——
const seen = new Set()
const order = []
const t0 = Date.now()
while (Date.now() - t0 < 18000) {
  const vals = await js(`[...document.querySelectorAll('.rh-item')].map(it => it.style.animationDuration)`)
  for (const v of vals) if (v && !seen.has(v)) { seen.add(v); order.push(v) }
  await sleep(200)
}
console.log('采样到的滑动时长（按出现顺序）:', JSON.stringify(order))
console.log('去重后:', JSON.stringify([...seen]))

assert.ok(seen.has('1872ms'), '应有「一阵风」快档 1872ms，实际 ' + [...seen].join(','))
assert.ok(seen.has('2600ms'), '应有基准档 2600ms，实际 ' + [...seen].join(','))
// 不越跑越快：所有时长都落在 [快档, 基准档] 之间，没有第三档、也没有更快的值
const nums = [...seen].map((v) => parseFloat(v))
assert.ok(nums.every((n) => n >= 1850 && n <= 2650), '速度只该在快/基准两档之间，不能越跑越快，实际 ' + [...seen].join(','))

await send('Target.disposeBrowserContext', { browserContextId: ctx }, null).catch(() => {})
sock.close()
console.log('\n✅ 骑手速度：有起伏、不越跑越快')
process.exit(0)
