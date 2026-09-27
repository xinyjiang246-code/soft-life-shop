/**
 * 首页首屏「收尾元素 vs 悬浮底栏」碰撞守卫
 *
 * 为什么单独一条：`verify-home-cover` 只管封面块自己（帧高 / 圆点 / 横滑 / 进商品页），
 * 不管首屏底部那两个元素会不会被固定底栏吃掉 —— 而且它跑在「无提示条」状态。
 * 2026-09-24 实测发现：`.hint-bubble`（显示条件是 `soft-life-hint-views < 3`，
 * 也就是**前 3 次打开都显示** ⇒ 小红书点进来的新访客全中）会把封面整体推下 62px，
 * 而 `.hm-cover` 的 min-height 只算了顶栏 78px ⇒ 390×844 上就被压 24/54px，
 * 667 上压 158/187px。当时 `verify-home-cover` 是全绿的。
 *
 * 断言（6 档机型高度 × 2 种提示条状态，共 12 组）：
 *   ① 世界 chip（`.mood-chip.is-world`）底边 ≤ 底栏顶边
 *   ② 收尾线（`.hm-pagehint`）底边 ≤ 底栏顶边
 *   ③ `.hc-viewport` 高 ≥ 56px           —— 弹性收缩不能把它压成一条纸边（SE 有提示条时只剩 56，再低就真看不见了）
 *   ④ 390×844 无提示条时封面图 ≥ 240px    —— 别为了塞下把正常机型也压小
 *   ⑤ 提示条高 ≤ 52px                     —— CSS 里 `--hint-h: 62px` 是写死的，
 *                                            依赖「提示条最多两行」；文案变长这里先红
 *
 * 用法：node tools/verify-home-collision.mjs [baseUrl]
 * 前置：预览服务在跑（cwd=dist/）+ 无头 Chrome 开着 9222。
 */
const args = process.argv.slice(2)
const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8080/').replace(/\/?$/, '/')

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  socket.addEventListener('open', res, { once: true })
  socket.addEventListener('error', rej, { once: true })
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
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')) }, 30000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
  })
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
async function waitFor(expression, timeout = 15000) {
  return evaluate(`new Promise((resolve, reject) => {
    const t0 = performance.now();
    const check = () => {
      if (${expression}) return resolve(true);
      if (performance.now() - t0 > ${timeout}) return reject(new Error('timed out waiting'));
      setTimeout(check, 70);
    };
    check();
  })`)
}

const MEASURE = `(() => {
  const q = (s) => document.querySelector(s)
  const rect = (el) => el ? el.getBoundingClientRect() : null
  const bar = q('.tabbar-pp')
  const chip = q('.mood-chip.is-world')
  const hint = q('.hm-pagehint')
  const vp = q('.hc-viewport')
  const bubble = q('.hint-bubble')
  if (!bar || !chip || !hint || !vp) return { missing: true, has: { bar: !!bar, chip: !!chip, hint: !!hint, vp: !!vp } }
  const br = rect(bar), cr = rect(chip), hr = rect(hint), vr = rect(vp), bb = rect(bubble)
  return {
    vh: innerHeight,
    barTop: Math.round(br.top),
    chipBottom: Math.round(cr.bottom),
    hintBottom: Math.round(hr.bottom),
    coverH: Math.round(vr.height),
    bubbleH: bb ? Math.round(bb.height) : 0,
    bubbleOn: !!bb,
    // 世界 chip 是不是真的可点（没被底栏拦掉）
    chipVisible: cr.bottom <= br.top,
    hintVisible: hr.bottom <= br.top,
  }
})()`

const HEIGHTS = [
  [844, 'iPhone 14/15'],
  [812, 'iPhone X / 12m'],
  [800, '安卓常见'],
  [780, 'iPhone 13 mini'],
  [736, 'iPhone 8 Plus'],
  [667, 'iPhone SE'],
]

const problems = []
const check = (cond, msg) => { if (!cond) problems.push(msg) }

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
;({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }))
await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const setViewport = async (h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: h, deviceScaleFactor: 2, mobile: true })
  await new Promise((r) => setTimeout(r, 620))
}

// 起始状态：跳过引导，但把提示条计数归零 ⇒ 「新访客」那一档
await send('Page.navigate', { url: base })
await waitFor(`document.readyState === 'complete' && document.body.innerText.trim().length > 20`).catch(() => {})
await evaluate(`localStorage.setItem('soft-life-onboarded-v1', '1'); localStorage.setItem('soft-life-hint-views', '0')`)
await send('Page.navigate', { url: base })
await waitFor(`!!document.querySelector('.mood-chip.is-world') && !!document.querySelector('.tabbar-pp')`)
await new Promise((r) => setTimeout(r, 900))

const rows = []

async function sweep(label, expectBubble) {
  for (const [h, name] of HEIGHTS) {
    await setViewport(h)
    const m = await evaluate(MEASURE)
    if (m.missing) {
      check(false, `${h}: 首屏元素缺失 ${JSON.stringify(m.has)}`)
      rows.push([`${h} ${name}`, label, '—', '—', '—', '—', '❌ 元素缺失'])
      continue
    }
    check(m.bubbleOn === expectBubble, `${h} ${label}：提示条状态不对（期望 ${expectBubble ? '显示' : '隐藏'}，实际 ${m.bubbleOn ? '显示' : '隐藏'}）`)
    check(m.chipVisible, `${h} ${label}：世界 chip 底边 ${m.chipBottom} > 底栏顶 ${m.barTop}，被压 ${m.chipBottom - m.barTop}px`)
    check(m.hintVisible, `${h} ${label}：收尾线底边 ${m.hintBottom} > 底栏顶 ${m.barTop}，被压 ${m.hintBottom - m.barTop}px`)
    check(m.coverH >= 56, `${h} ${label}：封面图只剩 ${m.coverH}px（< 56，快塌成一条边了）`)
    if (expectBubble) check(m.bubbleH <= 52, `提示条高 ${m.bubbleH}px > 52 —— CSS 里 --hint-h: 62px 的假设失效，文案可能变长了`)
    if (h === 844 && !expectBubble) check(m.coverH >= 240, `844 无提示条时封面图只有 ${m.coverH}px（< 240）—— 为了塞下把正常机型压太小了`)
    const worst = Math.max(m.chipBottom, m.hintBottom)
    const ok = m.chipVisible && m.hintVisible && m.coverH >= 56
    rows.push([`${h} ${name}`, label, String(m.barTop), String(m.chipBottom), String(m.hintBottom), String(m.coverH),
      ok ? `✅ 余 ${m.barTop - worst}px` : `❌ 压 ${worst - m.barTop}px`])
  }
}

await sweep('有提示条', true)

// 再看「回头客」：关掉提示条
await evaluate(`(() => { const b = document.querySelector('.hint-close'); if (b) b.click(); return true })()`)
await new Promise((r) => setTimeout(r, 700))
await sweep('无提示条', false)

const w = [0, 0, 0, 0, 0, 0, 0]
for (const r of rows) r.forEach((c, i) => { w[i] = Math.max(w[i], String(c).length) })
const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join(' | ')
console.log(line(['机型', '提示条', '底栏顶', 'chip底', '收尾线底', '封面图高', '判定']))
console.log('-'.repeat(w.reduce((a, b) => a + b + 3, 0)))
for (const r of rows) console.log(line(r))

console.log('')
if (problems.length) {
  console.log(`❌ 首页首屏碰撞：${problems.length} 条不合格`)
  for (const p of problems) console.log('   · ' + p)
} else {
  console.log('✅ 首页首屏碰撞全绿：6 档机型 × 有/无提示条，收尾线与世界 chip 都在底栏之上')
}

await send('Target.closeTarget', { targetId })
socket.close()
process.exit(problems.length ? 1 : 0)
