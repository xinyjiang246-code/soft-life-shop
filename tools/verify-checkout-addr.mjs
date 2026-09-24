import { writeFile } from 'node:fs/promises'

// 验证结算页地址卡 + 付款扣额度（¥10 = 1 分钟）：
// 老存档迁移 → 地址卡显示 → 切换/新增/编辑 → 确认下单 → 支付 → 断言 patience.used 涨了 floor(total/10)
const ver = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const sock = new WebSocket(ver.webSocketDebuggerUrl)
let id = 0; const pending = new Map(); let sid
await new Promise((r) => sock.addEventListener('open', r))
sock.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) } })
const send = (method, params = {}, session = sid) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); sock.send(JSON.stringify({ id: mid, method, params, ...(session ? { sessionId: session } : {}) })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => { const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.exceptionDetails) throw new Error((o.exceptionDetails.exception && o.exceptionDetails.exception.description) || o.exceptionDetails.text); return o.result.value }
const shot = async (file) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(file, Buffer.from(data, 'base64')); console.log('SHOT', file) }

const ctx = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null)
sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
for (const d of ['Page', 'Runtime', 'Network']) await send(`${d}.enable`)
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })

await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(1400)
await js('localStorage.clear()')
// 模拟老存档：只存过小屋名，没有地址卡
await js("localStorage.setItem('soft-life-house-v1','橘子小屋')")
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2400)

await js("document.querySelectorAll('.shop-row')[0].click()"); await sleep(1200)
await js("[...document.querySelectorAll('.add-button')].slice(0,2).forEach(function(b){b.click()})"); await sleep(500)
await js("[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())"); await sleep(400)
await js("document.querySelector('.cart-button').click()"); await sleep(800)
await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /去结账|结算|下单/.test(x.textContent)}); b&&b.click()})()"); await sleep(1000)

// 1) 老存档迁移：地址卡第一张的收件人应是「橘子小屋」，地址是默认装饰地址
console.log('地址卡(迁移):', await js("document.querySelector('.addr-who') ? document.querySelector('.addr-who').innerText.replace(/\\n/g,' · ') : '（无地址卡）'"))
console.log('地址行:', await js("document.querySelector('.addr-where') ? document.querySelector('.addr-where').innerText : '（无）'"))
console.log('迁移落盘:', await js("localStorage.getItem('soft-life-addresses-v1')"))
await js("document.querySelector('.addr-card').scrollIntoView({block:'center'})"); await sleep(300)
await shot('/tmp/addr-view.png')

// 2) 切换地址 → 新增一张
await js("document.querySelector('.addr-switch').click()"); await sleep(400)
console.log('列表卡数:', await js("document.querySelectorAll('.addr-item').length"))
await js("document.querySelector('.addr-add').click()"); await sleep(400)
await js(`(() => {
  const setN = (el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})) }
  const els = [...document.querySelectorAll('.addr-field input')]
  setN(els[0], '云朵小屋'); setN(els[1], '138****0000'); setN(els[2], '亚麻巷 5 号 301')
})()`)
await shot('/tmp/addr-edit.png')
await js("document.querySelector('.addr-save').click()"); await sleep(400)
console.log('新增后·当前卡:', await js("document.querySelector('.addr-who') ? document.querySelector('.addr-who').innerText.replace(/\\n/g,' · ') : '（无）'"))
console.log('新增后·落盘卡数:', await js("JSON.parse(localStorage.getItem('soft-life-addresses-v1')).list.length"))

// 3) 确认下单 → 支付 → 断言额度扣了 floor(total/10)
const total = await js("(function(){var m=document.querySelector('.bottom-price'); var n=(m&&m.innerText.match(/\\d+(?:\\.\\d+)?/)||[null])[0]; return n?Number(n):0 })()")
const readUsed = "(function(){try{var p=JSON.parse(localStorage.getItem('soft-life-patience-v1'));return (p&&p.used)||0}catch(e){return 0}})()"
const costBefore = await js(readUsed)
console.log('合计:', total, '· 付款前已用:', costBefore)
await js("(function(){var b=[...document.querySelectorAll('button')].find(function(x){return /确认下单/.test(x.textContent)}); b&&b.click()})()"); await sleep(1000)
console.log('结算页带额度提示:', await js("(function(){var p=[...document.querySelectorAll('.checkout-note p')].pop(); return p?p.innerText.slice(-40):'（无）'})()"))
for (let t = 0; t < 15000; t += 400) { if (await js("!!document.querySelector('.pay-confirm')")) break; await sleep(400) }
await js("document.querySelector('.pay-confirm').click()")
for (let t = 0; t < 15000; t += 400) { if (await js("document.querySelectorAll('.pay-key').length > 0")) break; await sleep(400) }
for (let i = 0; i < 6; i++) { await js("(() => { const ks = [...document.querySelectorAll('.pay-key')].filter(k => !k.classList.contains('blank')); ks[0] && ks[0].click() })()"); await sleep(150) }
for (let t = 0; t < 15000; t += 500) { if (await js("!!document.querySelector('.skip-wait-button')")) break; await sleep(500) }
const costAfter = await js(readUsed)
console.log('付款后已用:', costAfter, '· 预期扣:', Math.max(1, Math.floor(total / 10)), '· 实扣:', costAfter - costBefore)
console.log('每日额度上限:', await js("(function(){var el=[...document.querySelectorAll('b')].find(function(x){return /\\/ 15 分钟|15 分钟/.test(x.textContent)}); return el?el.innerText.trim():'(未找到 15 显示)' })()"))

await send('Target.disposeBrowserContext', { browserContextId: ctx }, null).catch(() => {})
sock.close(); process.exit(0)
