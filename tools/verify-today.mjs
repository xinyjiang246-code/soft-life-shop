// 守卫首页「今天」这一条（2026-09-19）。
//
// 它守的是产品里最容易散掉的一件事：**「今天」得真的是今天**。
// 每日心情、今日特调、惜食柜、慢活额度、手账、世界菜单全是「每日」的，
// 但在这条之前没有一处把它们串成一天 —— 第二天回来看到的和昨天一模一样。
//
// 最贵的一条是 [3]：注入**昨天**的数据（等满过、存过手账、记过猫粮），
// 它必须回到「今天还没发生什么」那一态。要是哪天有人把判断改成「累计」，
// 这一条就会红 —— 而「累计面板」和「今天」是两回事：前者会变成 KPI，后者才是日子。
//
// 用法：node tools/verify-today.mjs [url]
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const root = fileURLToPath(new URL('..', import.meta.url))

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
  m.error ? req.reject(new Error(JSON.stringify(m.error))) : req.resolve(m.result)
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ok = (label, value) => console.log('  ✓', label, '=', JSON.stringify(value))
const homeReady = `document.readyState === "complete" && !!document.querySelector('.hm-snap')`

// ⚠️ evaluate(homeReady) 只求值一次 —— 页面还没渲染完时它返回 false 而不是等，
//    紧接着的 querySelector 就是 null。必须轮询。
function waitFor(expression, timeout = 15000) {
  return evaluate(`new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (${expression}) return resolve(true);
      if (performance.now() - started > ${timeout}) return reject(new Error('等不到: ' + ${JSON.stringify(expression)}));
      setTimeout(check, 100);
    }; check();
  })`)
}

/** 今天是哪天 / 昨天是哪天（跟页面同一口径：本地时区） */
function dayKey(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 注入「某一天做过事」的全部痕迹（今天/昨天共用，靠 offset 切换） */
const seed = (offset) => `(() => {
  const d = new Date(); d.setDate(d.getDate() + ${offset})
  const p = (n) => String(n).padStart(2, '0')
  const dayKey = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
  localStorage.setItem('soft-life-visited-v1', '1')
  localStorage.setItem('soft-life-patience-v1', JSON.stringify({ date: dayKey, used: 0, waited: 3 }))
  localStorage.setItem('soft-life-journal-v1', JSON.stringify({
    days: { [dayKey]: { items: [{ name: '冰抹茶拿铁', id: 'matcha-latte' }], note: '', mood: '' } }
  }))
  localStorage.setItem('soft-life-charity-v1', JSON.stringify({
    grams: 620, amount: 6.2, orders: 1,
    records: [{ id: 'don-1', grams: 620, amount: 6.2, ratio: 30, shop: '慢活茶铺', at: d.toISOString() }],
    settled: [],
  }))
  return dayKey
})()`

let contextId
try {
  contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url })
  await waitFor(homeReady)

  console.log('\n[1] 今天还什么都没发生：说「今天有什么」，不说「你还缺什么」')
  const b = await evaluate(`(() => {
    const el = document.querySelector('.hm-snap')
    // ⚠️ 2026-09-21：这块从「氛围条那张卡」搬进了 TODAY'S EXTRA 分区
    //    （容器 .hm-snap，紧跟 .extra-title 标题之后）。口径没变 ——
    //    还是「跟着标题走的一条记录，不是自己另起一张卡」，只是容器名换了。
    const title = el.previousElementSibling
    return {
      text: el.innerText,
      inSection: !!title && /extra-title/.test(title.className || ''),
      tag: el.tagName,
      clickable: !!el.closest('button'),
    }
  })()`)
  ok('内容', b.text.replace(/\n+/g, ' | '))
  assert.ok(/^TODAY · \d{1,2}月\d{1,2}日 周[日一二三四五六]/.test(b.text.trim()),
    `第一行必须是「TODAY · 日期 星期」：${b.text}`)
  assert.ok(/今天的特调是/.test(b.text), '空白态要说今天有什么 —— 每日特调是每天真会换的那样')
  assert.ok(b.inSection, '它该跟着 TODAY\'S EXTRA 标题走，不另起一张卡')
  assert.equal(b.clickable, false, '它不可点 —— 是记录牌，不是入口（入口就该有内容页）')
  assert.ok(!/还没|快去|抓紧|今日目标|连续\d+天/.test(b.text), `不许催单、不许打卡：${b.text}`)

  console.log('\n[2] 今天做过事：把你今天做过的说出来')
  await evaluate(seed(0))
  await send('Page.navigate', { url })
  await waitFor(homeReady)
  const a = await evaluate(`document.querySelector('.hm-snap').innerText`)
  ok('内容', a.replace(/\n+/g, ' | '))
  assert.ok(/今天等满 3 单/.test(a), `等满次数要读今天的账（注入的是 3）：${a}`)
  assert.ok(/存下 1 餐/.test(a), `今天的手账条目要算进来：${a}`)
  assert.ok(/记下 620 克猫粮/.test(a), `今天的猫粮克数要按天过滤：${a}`)
  assert.ok(!/今天的特调是/.test(a), '有内容时不再罗列「今天有什么」—— 两态互斥')

  console.log('\n[3] 跨天：注入昨天的数据，必须回到「今天还没发生什么」')
  // 这是整条守卫里最贵的一段：证明「今天」真的按天算，不是累计。
  // 若有人把判断改成「累计 > 0」，这里会直接红。
  await evaluate(seed(-1))
  await send('Page.navigate', { url })
  await waitFor(homeReady)
  const y = await evaluate(`document.querySelector('.hm-snap').innerText`)
  ok('内容', y.replace(/\n+/g, ' | '))
  assert.ok(/今天的特调是/.test(y), `昨天的账不该算进今天：${y}`)
  assert.ok(!/等满 3 单|620/.test(y), `昨天的等满次数与猫粮克数都不该出现：${y}`)

  console.log('\n[4] 文案红线：扫构建产物，全站不许把「今天」写成打卡或催单')
  const assets = `${root}dist/assets`
  const js = readdirSync(assets).filter((f) => f.endsWith('.js'))
  let bundle = ''
  for (const f of js) bundle += readFileSync(`${assets}/${f}`, 'utf8')
  // ⚠️ 否定断言必须先自证读到了内容 —— 否则 bundle 改名/忘了构建时，
  //    扫到空字符串，「不包含 XX」会全是假绿。
  assert.ok(bundle.includes('今天的特调是'), '没扫到已构建的产物，先 npm run build（否则下面全是假绿）')
  // 只列**明确是打卡/任务**的词。别把「连续」单独放进来 ——
  // 它以后可能合法出现在别处（「连续下了三天雨」），那样会变成假警报，
  // 而假警报比漏报更贵（这条是项目踩出来的）。
  for (const bad of ['连续签到', '连续打卡', '坚持打卡', '今日目标', '今日任务', '打卡']) {
    assert.ok(!bundle.includes(bad), `全站不该出现「${bad}」——这里没有签到，也不给奖励`)
  }
  ok('已扫', `${js.length} 个 bundle，无打卡/目标类词`)

  console.log('\n全绿：跨天正确 / 两态互斥 / 不可点 / 无催单词')
} finally {
  if (contextId) { try { await send('Target.disposeBrowserContext', { browserContextId: contextId }, null) } catch {} }
  socket.close()
}
