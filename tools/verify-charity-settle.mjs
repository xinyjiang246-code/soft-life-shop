// 验收「真捐闭环」：点那一大坨克数 → 看明细（捐给谁 / 什么时候 / 多少）→ 记一笔 → 刷新还在
//
// 为什么值得单独一个脚本：这是产品里**唯一一处真的会写「已捐」的地方**。
// 写错了就是把用户的打算说成既成事实 —— 那是这个 App 的红线。
// 所以除了交互，这里还断言了三件事：
//   ① 「记下 / 真捐 / 还没捐」三个数互相算得对（不是同一个数摆三遍）
//   ② 没点保存之前，任何数字都不许变（「上膛」阶段不许偷偷落盘）
//   ③ 落盘之后刷新还在，且**不会出现「已捐出」这种完成时措辞**
//
// 用法：node tools/verify-charity-settle.mjs [url]
import assert from 'node:assert/strict'

const url = process.argv[2] || 'http://127.0.0.1:8080/'

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((ok, no) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', no, { once: true }) })

let nextId = 0
const pending = new Map()
const errors = []
let sessionId

socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id)
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
  } else if (m.sessionId === sessionId && m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)
  }
})

const send = (method, params = {}, session = sessionId) => new Promise((resolve, reject) => {
  const id = ++nextId
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 25000)
  pending.set(id, { resolve, reject, timer })
  socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
})

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
// ⚠️ `expr` 里经常带单引号（`.disabled` 这类），拼进注入串会**当场语法错误** ——
//    一律走 JSON.stringify，别手写引号包它。
const waitFor = (expr, t = 12000) => evaluate(`new Promise((res, rej) => {
  const s = performance.now();
  const c = () => { if (${expr}) return res(true); if (performance.now() - s > ${t}) return rej(new Error('等不到: ' + ${JSON.stringify(expr)})); setTimeout(c, 100) }; c();
})`)
async function click(sel) {
  await waitFor(`document.querySelector(${JSON.stringify(sel)})`)
  await evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`)
}
const ok = (label, value) => console.log('  ✓', label, '=', JSON.stringify(value))

try {
  const { browserContextId } = await send('Target.createBrowserContext', {}, null)
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true })).sessionId || targetId
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)

  // 先塞一份「已经记了几单、还没捐」的档案
  await send('Page.navigate', { url })
  await waitFor(`document.querySelector('.home-page')`)
  await evaluate(`localStorage.setItem('soft-life-charity-v1', JSON.stringify({
    grams: 3200, amount: 320, orders: 4,
    records: [{ id: 'x1', grams: 800, amount: 80, ratio: 30, shop: '慢活茶饮铺', at: new Date().toISOString() }],
    settled: [],
  }))`)
  await send('Page.navigate', { url })
  await waitFor(`document.querySelector('.home-page')`)

  console.log('\n[1] 档案页：那一大坨克数可以点')
  await evaluate(`Array.from(document.querySelectorAll('.corner-tile')).find(t => t.innerText.includes('猫粮')).click()`)
  await waitFor(`document.querySelector('.charity-hero')`)
  const hero = await evaluate(`(() => {
    const num = document.querySelector('.charity-hero-num');
    return { 标签: num.tagName, 可点: num.tagName === 'BUTTON', 克数: num.innerText, 副行: document.querySelector('.charity-hero-sub').innerText };
  })()`)
  ok('hero', hero)
  assert.ok(hero.可点, '克数本身应该是按钮 —— 点它进明细')

  console.log('\n[2] 点开 → 明细：三个数互相算得对')
  await click('.charity-hero-num')
  await waitFor(`document.querySelector('.jh-detail-panel')`)
  const detail = await evaluate(`(() => {
    const rows = Array.from(document.querySelectorAll('.cs-sum-row')).map(r => r.innerText.replace(/\\n/g, ' '));
    return {
      三行: rows,
      兑现率文案: document.querySelector('.cs-rate')?.innerText || null,
      空态: document.querySelector('.cs-empty')?.innerText.trim() || null,
      有真捐按钮: !!document.querySelector('.cs-settle'),
      按钮文案: document.querySelector('.cs-settle')?.innerText || null,
    };
  })()`)
  ok('明细', detail)
  assert.deepEqual(detail.三行, ['记下 3,200 g', '真捐出去 0 g', '还没捐 3,200 g'], '三个数应该是 记下 / 真捐 / 还没捐，且算得对')
  assert.ok(detail.空态, '一次都没捐过的时候要有空态说明')
  assert.equal(detail.按钮文案, '我真去捐了')

  console.log('\n[3] 点「我真去捐了」→ 默认填好「还没捐」那部分')
  await click('.cs-settle')
  await waitFor(`document.querySelector('.cs-form')`)
  const armed = await evaluate(`(() => ({
    默认克数: document.querySelector('.cs-field input')?.value,
    收件人: document.querySelectorAll('.cs-field input')[1]?.value,
    保存按钮可用: !document.querySelector('.cs-actions .primary-button')?.disabled,
  }))()`)
  ok('表单已上膛', armed)
  assert.equal(armed.默认克数, '3200', '默认应该就是还没捐的那部分（大多数人一次捐完）')
  assert.equal(armed.收件人, '')
  // 只上膛不算数：localStorage 里不能多出 settled
  const beforeCommit = await evaluate(`JSON.parse(localStorage.getItem('soft-life-charity-v1')).settled.length`)
  assert.equal(beforeCommit, 0, '没点保存之前不许落盘')

  console.log('\n[4] 填「捐给了谁」→ 保存')
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('.cs-field input');
    const set = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      d.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(inputs[0], '1000'); set(inputs[1], '北大猫协');
  })()`)
  await waitFor(`!document.querySelector('.cs-actions .primary-button').disabled`)
  await click('.cs-actions .primary-button')
  await waitFor(`document.querySelectorAll('.cs-item').length === 1`)
  const saved = await evaluate(`(() => ({
    记录: Array.from(document.querySelectorAll('.cs-item')).map(i => i.innerText.replace(/\\n/g, ' ')),
    三行: Array.from(document.querySelectorAll('.cs-sum-row')).map(r => r.innerText.replace(/\\n/g, ' ')),
    兑现率文案: document.querySelector('.cs-rate')?.innerText || null,
    进度条: document.querySelector('.cs-bar i')?.style.width || null,
  }))()`)
  ok('保存后', saved)
  assert.ok(/北大猫协/.test(saved.记录[0]), '要能看见捐给了谁')
  assert.ok(/年.*月.*日/.test(saved.记录[0]), '要能看见什么时候')
  assert.ok(/1,000 g/.test(saved.记录[0]), '要能看见捐了多少')
  assert.deepEqual(saved.三行, ['记下 3,200 g', '真捐出去 1,000 g', '还没捐 2,200 g'], '真捐之后「还没捐」要减掉')

  console.log('\n[5] 刷新 —— 这一笔还在（而且措辞没越线）')
  await send('Page.navigate', { url })
  await waitFor(`document.querySelector('.home-page')`)
  await evaluate(`Array.from(document.querySelectorAll('.corner-tile')).find(t => t.innerText.includes('猫粮')).click()`)
  await waitFor(`document.querySelector('.charity-hero')`)
  const after = await evaluate(`(() => ({
    hero小字: document.querySelector('.charity-hero-more')?.innerText || null,
    页面全文有已捐出: /已捐出/.test(document.body.innerText),
  }))()`)
  await click('.charity-hero-num')
  await waitFor(`document.querySelector('.jh-detail-panel')`)
  const persisted = await evaluate(`(() => ({
    记录: Array.from(document.querySelectorAll('.cs-item')).map(i => i.innerText.replace(/\\n/g, ' ')),
    三行: Array.from(document.querySelectorAll('.cs-sum-row')).map(r => r.innerText.replace(/\\n/g, ' ')),
  }))()`)
  ok('刷新后', { ...after, ...persisted })
  assert.equal(persisted.记录.length, 1, '这一笔真捐要落盘，刷新还在')
  assert.deepEqual(persisted.三行, ['记下 3,200 g', '真捐出去 1,000 g', '还没捐 2,200 g'])
  assert.ok(!after.页面全文有已捐出, '页面上不该出现「已捐出」—— 那是红线措辞')
  assert.ok(/已真捐 1,000 g/.test(after.hero小字 || ''), 'hero 下面那行要报出真捐了多少')

  console.log('\n[6] 体检')
  const health = await evaluate(`({
    破图: Array.from(document.images).filter(i => i.complete && i.src && i.naturalWidth === 0).length,
    横向溢出: document.documentElement.scrollWidth > innerWidth,
    有emoji: /[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(document.body.innerText),
    面板底色: getComputedStyle(document.querySelector('.jh-detail-panel')).backgroundColor,
  })`)
  ok('体检', health)
  assert.equal(health.破图, 0)
  assert.ok(!health.横向溢出, '页面横向溢出了')
  assert.ok(!health.有emoji, '不该有 emoji')
  // ⚠️ 别用 `/rgba\(0, 0, 0, 0\)/` 这种写死的字符串比 —— 在 Node 模板串里 `\\(` 会变成字面
  //    反斜杠，正则根本匹配不上，**断言永远通过**（我自己刚踩了一次，浮层其实是全透明的）。
  //    正确做法：把 alpha 解析出来当数字比。
  const alpha = (() => {
    const m = /rgba?\(([^)]+)\)/.exec(health.面板底色 || '')
    if (!m) return 0
    const parts = m[1].split(',').map((s) => s.trim())
    return parts.length > 3 ? Number(parts[3]) : 1
  })()
  assert.ok(alpha > 0.99, `明细面板必须不透明，实际 alpha=${alpha}（${health.面板底色}）—— 底下文字会透上来`)

  console.log('\n控制台报错:', errors)
  if (errors.length) throw new Error(`控制台有 ${errors.length} 条报错`)
  console.log('\n✅ 全绿：点克数 → 看明细（给谁/何时/多少）→ 记一笔 → 刷新还在')

  await send('Target.disposeBrowserContext', { browserContextId }, null).catch(() => {})
} catch (error) {
  console.error('\n❌ 验收失败:', error.message)
  process.exitCode = 1
} finally {
  socket.close()
  for (const r of pending.values()) clearTimeout(r.timer)
}
