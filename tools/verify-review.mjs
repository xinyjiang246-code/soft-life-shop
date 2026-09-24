import { writeFile } from 'node:fs/promises'

// 验证「这一单评价卡」：走完整一单到结局页 → 找到 .review-card → 选戳点 + 写一句 → 盖进手账
// → 断言 localStorage 的手账里多了一笔带 mood/why 的独立记录 → 截图三张。
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
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Math.random = function () { return 0 }' })

const shot = async (file) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(file, Buffer.from(data, 'base64'))
  console.log('SHOT', file)
}

await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(1400)
await js("localStorage.clear(); localStorage.setItem('soft-life-wait-override-v1','8')") // 8 秒短等待：快进花 1 分钟额度，守卫走得完
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2600)
await js("document.querySelectorAll('.shop-row')[0].click()"); await sleep(1300)
await js("[...document.querySelectorAll('.add-button')].slice(0, 1).forEach(function (b) { b.click() })"); await sleep(400)
await js("[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())")
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

// 1) 评价卡存在吗？
const exists = await js("!!document.querySelector('.review-card')")
console.log('评价卡存在:', exists)
console.log('评价卡文本:', await js("document.querySelector('.review-card') ? document.querySelector('.review-card').innerText.replace(/\\n/g,' | ') : '（无）'"))

// 记录落盘前的手账长度（今天那一页）
const beforeCount = await js("(() => { try { const j = JSON.parse(localStorage.getItem('soft-life-journal-v1')); const d = new Date(); const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); return (j.days[k]?.items||[]).length } catch { return -1 } })()")
console.log('提交前·今天手账笔数:', beforeCount)

// 2) 滚动到评价卡，截「未提交」状态
await js("document.querySelector('.review-card').scrollIntoView({block:'center'})"); await sleep(400)
await shot('/tmp/review-before.png')

// 3) 选一个戳点 + 写一句
await js("[...document.querySelectorAll('.review-chip')][0].click()"); await sleep(300)
await js("(() => { const ta = document.querySelector('.review-why'); const s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set; s.call(ta,'不饿也想要，写给自己'); ta.dispatchEvent(new Event('input',{bubbles:true})) })()"); await sleep(400)
console.log('选中戳点:', await js("document.querySelector('.review-chip.is-on') ? document.querySelector('.review-chip.is-on').innerText : '（无）'"))
console.log('提交按钮可用:', await js("!document.querySelector('.review-submit').disabled"))
await shot('/tmp/review-filled.png')

// 4) 盖进手账
await js("document.querySelector('.review-submit').click()"); await sleep(500)
console.log('已提交态:', await js("!!document.querySelector('.review-card.is-done')"))
console.log('已提交文本:', await js("document.querySelector('.review-card.is-done') ? document.querySelector('.review-card.is-done').innerText.replace(/\\n/g,' | ') : '（无）'"))
console.log('印章 review-seal 存在:', await js("!!document.querySelector('.review-card.is-done .review-seal')"))
console.log('印章 computed transform:', await js("(() => { const el = document.querySelector('.review-seal'); return el ? getComputedStyle(el).transform : '无' })()"))
await shot('/tmp/review-done.png')

// 5) 断言 localStorage 落盘：今天最后一条应是独立评价笔（无 id、带 mood + why）
const check = await js(`(() => {
  try {
    const j = JSON.parse(localStorage.getItem('soft-life-journal-v1'))
    const d = new Date(); const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
    const items = j.days[k]?.items || []
    const last = items[items.length-1]
    return JSON.stringify({ count: items.length, last })
  } catch (e) { return 'ERR '+e.message }
})()`)
console.log('提交后·今天手账:', check)

await send('Target.disposeBrowserContext', { browserContextId: ctx }, null).catch(() => {})
sock.close(); process.exit(0)
