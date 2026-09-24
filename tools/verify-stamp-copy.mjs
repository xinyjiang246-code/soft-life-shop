// 验收「集章区」的文案口径（2026-09-22 改的）。
//
// 为什么单独写一个：verify-journal-photo 只验到「月视图」，
// 而这次改的是**印记视图的副标题** + **集章区那 5 枚章的文字** —— 原来没有守卫覆盖。
//
// 改之前的两处口径（都踩红线 4「打卡/目标/奖励/催单不许」）：
//   · 副标题写「里程碑 X / 5」   → 进度条，暗示「还差几个就满」
//   · 没盖的章写「还没到」       → 催促
// 改之后：副标题只说「左右翻着看」；没盖的章只留虚线齿轮，不写字。
//
// 断言四件事：
//   ① 集章区还是 5 枚（别把整个区域误删）；
//   ② 「还没到」不出现；
//   ③ 已盖的章**照旧**显示日期（别把有用的也一起删了）；
//   ④ 印记视图副标题不出现「里程碑」/「X / 5」。
//
// 在独立无痕上下文里跑，不碰用户存档。
// 用法：node tools/verify-stamp-copy.mjs [url]
import assert from 'node:assert/strict'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const KEY_JOURNAL = 'soft-life-journal-v1'

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
let sessionId

socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (!m.id) return
  const req = pending.get(m.id)
  if (!req) return
  clearTimeout(req.timer)
  pending.delete(m.id)
  if (m.error) req.reject(new Error(JSON.stringify(m.error)))
  else req.resolve(m.result)
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

async function waitFor(expression, timeout = 12000) {
  return evaluate(`new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (${expression}) return resolve(true);
      if (performance.now() - started > ${timeout}) return reject(new Error('等不到: ' + ${JSON.stringify(expression)}));
      setTimeout(check, 100);
    }; check();
  })`)
}

async function click(selector) {
  await waitFor(`document.querySelector(${JSON.stringify(selector)})`)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}

const ok = (label, value) => console.log('  ✓', label, '=', JSON.stringify(value))

const contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

console.log('\n[1] 先造一笔记录（独立上下文，不碰用户存档）')
await send('Page.navigate', { url })
await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
const now = new Date()
const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
// 手账挂载时才 loadJournal()，所以先写 storage、再点底部 tab 进去
await evaluate(`localStorage.setItem(${JSON.stringify(KEY_JOURNAL)}, JSON.stringify({
  days: { ${JSON.stringify(todayKey)}: { items: [{ name: '守卫造的这一笔' }], note: '', mood: '' } },
}))`)
ok('已写入 1 笔', await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY_JOURNAL)})).days[${JSON.stringify(todayKey)}].items.length`))

console.log('\n[2] 底部 tab → 手账 → 印记视图')
await waitFor(`document.querySelector('.tabbar-pp-item')`)
await evaluate(`(() => {
  const b = Array.from(document.querySelectorAll('.tabbar-pp-item')).find((x) => x.textContent.trim() === '手账');
  if (!b) throw new Error('底部 tab 里没有「手账」');
  b.click();
})()`)
await waitFor(`document.querySelector('.jh')`)
await click('.jh-dock button:nth-child(4)') // 月 / 周 / 今天 / 印记 / +
await waitFor(`document.querySelector('.jh-wall')`)
ok('印记视图已挂载', await evaluate(`!!document.querySelector('.jh-wall')`))

console.log('\n[3] 集章区：5 枚都在，且不写「还没到」')
const stampCount = await evaluate(`document.querySelectorAll('.jh-stamp').length`)
assert.equal(stampCount, 5, `集章区应该有 5 枚章，实际 ${stampCount}`)
ok('章数', stampCount)

const stampText = await evaluate(`document.querySelector('.jh-stamps').innerText`)
assert.ok(!stampText.includes('还没到'), `集章区不该再出现「还没到」：${JSON.stringify(stampText)}`)
ok('无「还没到」', true)

console.log('\n[4] 已盖的那一枚照旧显示日期')
const onCount = await evaluate(`document.querySelectorAll('.jh-stamp.is-on').length`)
assert.equal(onCount, 1, `记了 1 笔 → 第 1 枚章该盖上，实际盖了 ${onCount} 枚`)
const firstDate = await evaluate(`document.querySelector('.jh-stamp.is-on span')?.textContent || ''`)
assert.match(firstDate, /^\d+\.\d+$/, `第 1 枚章该显示日期，实际 ${JSON.stringify(firstDate)}`)
ok('第 1 枚盖章的日期', firstDate)

console.log('\n[5] 印记视图副标题不是进度条口径')
const sub = await evaluate(`document.querySelector('.jh-h2').textContent`)
assert.ok(!sub.includes('里程碑'), `副标题不该出现「里程碑」：${JSON.stringify(sub)}`)
assert.ok(!/\/\s*5/.test(sub), `副标题不该出现「X / 5」进度：${JSON.stringify(sub)}`)
ok('副标题', sub)

console.log('\n✅ 集章文案口径全绿（无进度条 / 无催促 / 已盖章照常显示日期）')
process.exit(0)
