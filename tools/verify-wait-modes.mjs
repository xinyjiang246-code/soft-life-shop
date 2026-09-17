// 验收：等待页「陪等的方式」三选一（walk 陪他走 / road 帮他看路 / offline 先下线）
// 三条底线必须同时成立：不计分 · 不会输 · 不点也完全没事
import assert from 'node:assert/strict'
import fs from 'node:fs'

const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
let page = list.find((t) => t.type === 'page' && /8080/.test(t.url || '')) || list.find((t) => t.type === 'page')
if (!page) page = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((x) => x.json())

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
await new Promise((res) => ws.addEventListener('open', res))
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  }
})
const send = (method, params = {}) =>
  new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => {
  const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  if (o.exceptionDetails) throw new Error(JSON.stringify(o.exceptionDetails).slice(0, 300))
  return o.result.value
}
const waitFor = async (expr, ms = 40000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await js(`!!(${expr})`)) return true
    await sleep(300)
  }
  throw new Error('等不到: ' + expr)
}
const ok = (label, v) => console.log('  ✓', label, typeof v === 'object' ? JSON.stringify(v) : v)

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' })
await sleep(1400)
await js(`localStorage.clear()`)
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' })
await sleep(2000)

// ---- 进到等待页 ----
await js(`document.querySelectorAll('.shop-row')[0].click()`); await sleep(900)
await js(`[...document.querySelectorAll('.add-button')].slice(0,2).forEach(b=>b.click())`); await sleep(500)
await js(`document.querySelector('.cart-button').click()`); await sleep(800)
await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/去结账|结算|下单/.test(x.textContent)); b&&b.click()})()`); await sleep(900)
await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/确认|下单|提交/.test(x.textContent)); b&&b.click()})()`); await sleep(1200)
await waitFor(`document.querySelector('.skip-wait-button')`, 30000)
console.log('\n[1] 进到等待页')

const modes = await js(`(() => {
  const chips = [...document.querySelectorAll('.wait-mode')]
  return {
    个数: chips.length,
    文案: chips.map(c => c.querySelector('b').textContent),
    默认选中的: chips.find(c => c.classList.contains('is-on'))?.querySelector('b').textContent || null,
  }
})()`)
ok('三选一', modes)
assert.equal(modes.个数, 3, '应该是三种陪等方式')
assert.equal(modes.默认选中的, '陪他走', '默认应该是「陪他走」')

// ---- [2] walk：路上遇事，替他选一下 ----
console.log('\n[2] 陪他走')
await waitFor(`document.querySelector('.rw-moment')`, 45000)
const ask = await js(`(() => {
  const m = document.querySelector('.rw-moment')
  return { 问: m.querySelector('.rw-moment-ask').textContent, 选项数: m.querySelectorAll('.rw-moment-opt').length, 底注: m.querySelector('.rw-moment-foot').textContent }
})()`)
ok('路上遇事', ask)
assert.ok(ask.选项数 >= 2, '至少两个选项')
assert.ok(/不扣|照样到/.test(ask.底注), '必须写明「不理也行、什么都不扣」—— 这是不计分的承诺')
await js(`document.querySelector('.rw-moment-opt').click()`)
await waitFor(`document.querySelector('.rw-reply')`, 5000)
const reply = await js(`document.querySelector('.rw-reply').textContent`)
ok('他回话了', reply.slice(0, 30))

// ---- [3] road：帮他看路 ----
console.log('\n[3] 帮他看路')
await js(`[...document.querySelectorAll('.wait-mode')].find(c=>c.textContent.includes('帮他看路')).click()`)
await waitFor(`document.querySelector('.rider-hop')`, 5000)
const swapped = await js(`JSON.stringify({ 还有moment: !!document.querySelector('.rw-moment'), 有跑酷窗: !!document.querySelector('.rider-hop') })`)
ok('切过去', swapped)
assert.ok(!/true/.test(JSON.parse(swapped).还有moment.toString()), '切走后不该再弹「路上遇事」')
await js(`document.querySelector('.rh-lane').click()`)
await sleep(400)
const hopped = await js(`document.querySelector('.rh-hint').textContent`)
ok('点了一下', hopped)
assert.ok(/提醒了他 1 次/.test(hopped), '点一下要算一次提醒，实际: ' + hopped)
// ⚠️ 别去匹配 rh-line 的文案内容 —— 占位句里也有「跳过去」三个字，
//    会被自己的正则放行（2026-09-17 踩过）。等 .is-real 这个只有真结果才有的标记。
await waitFor(`document.querySelector('.rh-line.is-real')`, 14000)
const hit = await js(`document.querySelector('.rh-line').textContent`)
ok('状况过去了', hit)
const foot = await js(`document.querySelector('.rh-foot').textContent`)
assert.ok(/不计分|不会输/.test(foot), '必须写明不计分不会输，实际: ' + foot)

// ---- [4] offline：先下线 ----
console.log('\n[4] 先下线')
await js(`[...document.querySelectorAll('.wait-mode')].find(c=>c.textContent.includes('先下线')).click()`)
await waitFor(`document.querySelector('.fold-ritual')`, 5000)
for (let i = 0; i < 3; i++) { await js(`document.querySelector('.fold-step').click()`); await sleep(260) }
await waitFor(`document.querySelector('.fold-done')`, 4000)
const folded = await js(`(() => {
  const d = document.querySelector('.fold-done')
  return { 标题: d.querySelector('.fold-done-title').textContent, 收尾: d.querySelector('.fold-done-go').textContent, 有盒子: !!d.querySelector('svg.fold-box') }
})()`)
ok('折好了', folded)
assert.ok(folded.有盒子, '折完该出现那个小纸盒')
assert.ok(/放下/.test(folded.收尾), '折完必须催人放下手机，实际: ' + folded.收尾)

// ---- [5] 记住上次挑的 ----
const saved = await js(`localStorage.getItem('soft-life-wait-mode-v1')`)
ok('记住了', saved)
assert.equal(saved, 'offline', '应记住最后一次选的方式')

// ---- [6] 体检 ----
const health = await js(`(() => ({
  横向溢出: document.documentElement.scrollWidth > innerWidth,
  还在等待页: !!document.querySelector('.skip-wait-button'),
  三块都在: document.querySelectorAll('.wait-mode').length,
}))()`)
ok('体检', health)
assert.ok(!health.横向溢出, '横向溢出了')

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('/tmp/wm-final.png', Buffer.from(shot.data, 'base64'))
console.log('\n✅ 三种陪等方式全绿')
ws.close()
process.exit(0)
