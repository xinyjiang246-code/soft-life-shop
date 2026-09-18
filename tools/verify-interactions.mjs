// 验收：交互层（2026-09-18）—— ① 切页转场 ② 全局点击手感 ③ 加购 → 购物袋动线
//
// 这一层的难点是「怎么证明它真的发生了」：
//   · 点击手感是 :active 伪类，脚本点一下抓不到 —— 用 CDP 的 CSS.forcePseudoState
//     强制把节点置为 :active，再读 computed 的 scale（要等过渡跑完，否则读到起点）。
//   · 进场动画要量**中间那一瞬**的 opacity / translate，光看 animationName 不算数
//     （animationName 是 CSS 声明值，动画早跑完了它也照样写着）。
//   · 「切页之后点得动吗」必须用**真实鼠标事件**验：这正是 View Transitions 被否掉的原因
//     —— 转场期间 elementFromPoint 一律返回 HTML、点击到不了新页面（见 main.jsx 注释）。
import assert from 'node:assert/strict'
import fs from 'node:fs'

const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
let page = list.find((t) => t.type === 'page' && /8080/.test(t.url || '')) || list.find((t) => t.type === 'page')
if (!page) page = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((x) => x.json())

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
await new Promise((res) => ws.addEventListener('open', res))
const errors = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
  }
  // ⚠️ Log.entryAdded 的 text 是通用文案（"Failed to load resource: … 404"），
  //    URL 在 entry.url 里 —— 只按 text 过滤掉 favicon 是过滤不掉的（吃过这个亏）。
  if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') {
    const e = m.params.entry
    errors.push({ text: e.text, url: e.url || '' })
  }
})
const send = (method, params = {}) =>
  new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => {
  const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })
  if (o.exceptionDetails) throw new Error(JSON.stringify(o.exceptionDetails).slice(0, 400))
  return o.result.value
}
const waitFor = async (expr, ms = 30000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await js(`!!(${expr})`)) return true
    await sleep(250)
  }
  throw new Error('等不到: ' + expr)
}
/** 真鼠标点击（带坐标）—— 「切页之后点得动吗」只能这么验 */
const mouseTap = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}
const ok = (label, v) => console.log('  ✓', label, typeof v === 'object' ? JSON.stringify(v) : v)

await send('Page.enable')
await send('Runtime.enable')
await send('DOM.enable')
await send('CSS.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' })
await sleep(1200)
await js(`localStorage.clear()`)
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' })
await sleep(2000)
await waitFor(`document.querySelectorAll('.shop-row').length > 0`, 20000)

// 进场动画的取样探针：取屏幕根节点里第一个「不是底栏」的子元素
const screenProbe = `(() => {
  const el = [...document.querySelectorAll('.page-shell > *:not(.toast) > *')].find(e => !e.classList.contains('bottom-bar'))
  if (!el) return null
  const cs = getComputedStyle(el)
  return { 名: cs.animationName, 透明度: Number(cs.opacity), 位移: cs.translate }
})()`

// ---- [1] 前进：首页 → 店铺页 ----
console.log('\n[1] 切页转场（前进）')
const fwd = await js(`(async () => {
  document.querySelector('.shop-row').click()
  await new Promise(r => requestAnimationFrame(r))
  const 起点 = ${screenProbe}
  await new Promise(r => setTimeout(r, 90))
  const 中途 = ${screenProbe}
  await new Promise(r => setTimeout(r, 420))
  const 结束 = ${screenProbe}
  return { nav: document.documentElement.dataset.nav, 起点, 中途, 结束 }
})()`)
ok('方向标记', fwd.nav)
ok('进场动画', { 起: fwd.起点, 中: fwd.中途, 终: fwd.结束 })
assert.equal(fwd.nav, 'fwd', '方向标记应该是 fwd')
assert.equal(fwd.起点.名, 'screenInFwd', '前进该用 screenInFwd')
assert.ok(fwd.起点.透明度 < 0.5, `刚开始该是几乎透明的，实际 ${fwd.起点.透明度}`)
assert.ok(fwd.中途.透明度 > fwd.起点.透明度, '透明度要在往上走（证明真的在播，不是只有一条 CSS 声明）')
assert.equal(fwd.结束.透明度, 1, '结束该完全显示')
// ⚠️ 结束态必须是 none：写 `translate: 0 0` 就不是 none，会永久挂一个包含块，
//    把元素内部任何 position:fixed 的东西弄坏
assert.equal(fwd.结束.位移, 'none', `动画结束后 translate 必须回到 none，实际 ${fwd.结束.位移}`)
await waitFor(`document.querySelector('.add-button')`, 8000)

// ---- [2] 返回：店铺页 → 首页 ----
console.log('\n[2] 切页转场（返回）')
const back = await js(`(async () => {
  document.querySelector('.menu-button').click()
  await new Promise(r => requestAnimationFrame(r))
  await new Promise(r => setTimeout(r, 90))
  const 中途 = ${screenProbe}
  return { nav: document.documentElement.dataset.nav, 中途 }
})()`)
ok('返回', back)
assert.equal(back.nav, 'back', '方向标记应该是 back —— 返回要反着播，否则手感是错的')
assert.equal(back.中途.名, 'screenInBack', '返回该用 screenInBack')
assert.match(back.中途.位移, /^-/, '返回该从左边退回来（translate 为负），实际 ' + back.中途.位移)
await waitFor(`document.querySelectorAll('.shop-row').length > 0`, 8000)

// ---- [3] 切页之后必须**立刻**点得动 ----
// 这是 View Transitions 被否掉的那条。用真实鼠标事件验，不看 elementFromPoint 就算完：
// 顶栏返回键在新旧页是同一个位置，进场动画还在播的时候点它，必须能回得去。
console.log('\n[3] 切页之后立刻点得动')
const tap = await js(`(async () => {
  document.querySelector('.menu-button').click()            // 首页 → 全部店铺
  await new Promise(r => requestAnimationFrame(r))
  await new Promise(r => setTimeout(r, 60))                 // 进场动画还在跑
  const b = document.querySelector('.menu-button').getBoundingClientRect()
  const c = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  const el = document.elementFromPoint(c.x, c.y)
  const 屏 = [...document.querySelectorAll('.page-shell > *:not(.toast) > *')].find(e => !e.classList.contains('bottom-bar'))
  return { x: c.x, y: c.y, 动画还在跑: Number(getComputedStyle(屏).opacity) < 1,
           命中: el ? el.tagName + '.' + (el.className || '').toString().slice(0, 24) : null,
           是返回键: !!(el && el.closest('.menu-button')) }
})()`)
ok('动画中命中测试', tap)
assert.ok(tap.动画还在跑, '这一刻进场动画本该还在跑（否则这条没验到东西）')
assert.ok(tap.是返回键, `进场动画期间该点得到按钮，实际命中 ${tap.命中}`)
await mouseTap(tap.x, tap.y)
await sleep(500)
const afterTap = await js(`({ 回到首页: !!document.querySelector('.brand'), 标题: document.querySelector('.topbar-title')?.textContent || null })`)
ok('动画期间真点一下', afterTap)
assert.ok(afterTap.回到首页, `进场动画期间点返回键必须有效（停在「${afterTap.标题}」说明这一下被吞了）`)
await waitFor(`document.querySelectorAll('.shop-row').length > 0`, 8000)

// ---- [4] 点击手感（用 CDP 强制 :active 才量得到）----
console.log('\n[4] 点击手感')
const force = async (sel, active) => {
  const { root } = await send('DOM.getDocument', { depth: 1 })
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: sel })
  assert.ok(nodeId, '找不到节点: ' + sel)
  await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: active ? ['active'] : [] })
  // ⚠️ 按下是有过渡的（.07s 起跳），置完立刻读只会读到**过渡起点**（≈原值 1），
  //    会误判成「按下没有反馈」。读到稳定值必须等过渡跑完。
  await sleep(240)
}
const scaleOf = (sel) => js(`(() => {
  const v = getComputedStyle(document.querySelector(${JSON.stringify(sel)})).scale
  // ⚠️ 没设过 scale 的元素，computed 是 "none" 而不是 "1"。直接 parseFloat 会得到 NaN，
  //    NaN 过 CDP 的 returnByValue 又变成 undefined，报错会长成「undefined !== 1」，
  //    看着像选择器错了，其实是探针错了。
  return v === 'none' ? 1 : parseFloat(v)
})()`)

for (const sel of ['.icon-button', '.kind-chip', '.corner-tile']) {
  if (!(await js(`!!document.querySelector(${JSON.stringify(sel)})`))) continue
  assert.equal(await scaleOf(sel), 1, `${sel} 没按的时候就该是原大小`)
}
const pressCases = [
  ['.icon-button', 0.86, '图标按钮（缩得最明显）'],
  ['.kind-chip', 0.93, '分类 chip'],
  ['.corner-tile', 0.985, '磁贴'],
]
for (const [sel, want, label] of pressCases) {
  if (!(await js(`!!document.querySelector(${JSON.stringify(sel)})`))) continue
  await force(sel, true)
  const got = await scaleOf(sel)
  await force(sel, false)
  ok(label, `${sel} → ${got}`)
  assert.ok(Math.abs(got - want) < 0.002, `${sel} 按下的 scale 应该是 ${want}，实际 ${got}`)
}

// ---- [5] 加购 → 购物袋动线 ----
// 加购按钮在店铺页上（首页没有），飞行也从那里看最清楚：按下处在底部菜单、袋子在顶栏右上角。
console.log('\n[5] 加购动线')
await js(`document.querySelector('.shop-row').click()`)
await waitFor(`document.querySelector('.add-button')`, 8000)
await sleep(400)

// 加购按钮走的是「硬阴影陷进去」那一套（印刷层），不是缩 —— 两条都必须成立
await force('.add-button', true)
const addPress = await js(`(() => {
  const s = getComputedStyle(document.querySelector('.add-button'))
  return { shadow: s.boxShadow, transform: s.transform, scale: s.scale }
})()`)
await force('.add-button', false)
ok('加购按钮按下', addPress)
assert.equal(addPress.shadow, 'none', '按下去阴影要收掉（真的"陷进去"）')
assert.match(addPress.transform, /matrix\(1, 0, 0, 1, 2, 2\)/, '按下去要位移 2px —— 实际 ' + addPress.transform)

const fly = await js(`(async () => {
  const badge = () => document.querySelector('.bag-button .cart-count')
  const before = badge() ? parseInt(badge().textContent, 10) : 0
  const btn = document.querySelector('.add-button')
  btn.click()
  const token = document.querySelector('.fly-token')
  const start = token ? token.getBoundingClientRect() : null
  await new Promise(r => setTimeout(r, 200))
  const mid = document.querySelector('.fly-token')
  const midRect = mid ? mid.getBoundingClientRect() : null
  await new Promise(r => setTimeout(r, 420))
  const bag = document.querySelector('.bag-button')
  return {
    起飞: !!token,
    起点: start ? [Math.round(start.left), Math.round(start.top)] : null,
    半途: midRect ? [Math.round(midRect.left), Math.round(midRect.top)] : null,
    落点: (() => { const r = bag.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] })(),
    袋子晃了: bag.classList.contains('is-bumped'),
    角标弹了: !!(badge() && badge().classList.contains('is-popped')),
    角标数字: badge() ? badge().textContent : '(没有角标)',
    加购前: before,
  }
})()`)
ok('飞了一个点', fly)
assert.ok(fly.起飞, '加购的瞬间应该有一个 .fly-token 从按下处起飞')
assert.ok(fly.半途, '飞点应该还在路上（200ms 时不该已经消失）')
// 真的在「往袋子那边去」，不是插一个元素做样子：半途的坐标要落在起点与落点之间
const [x0, y0] = fly.起点
const [x1, y1] = fly.半途
const [x2] = fly.落点
const moved = Math.hypot(x1 - x0, y1 - y0)
assert.ok(moved > 8, `飞点必须真的在移动（起点 ${x0},${y0} → 半途 ${x1},${y1}，只动了 ${Math.round(moved)}px）`)
assert.ok((x2 - x0) === 0 ? true : (x1 - x0) * (x2 - x0) > 0, `飞点该朝袋子的方向走（起点 ${x0} → 半途 ${x1} → 落点 ${x2}）`)
assert.ok(fly.袋子晃了, '到位时袋子要晃一下')
assert.ok(fly.角标弹了, '到位时角标要弹一下')
assert.equal(parseInt(fly.角标数字, 10), fly.加购前 + 1, '角标要 +1')
await waitFor(`document.querySelectorAll('.fly-token').length === 0`, 3000)

// 购物袋页：主按钮的按下感 + 加减数量 / 合计变化也要看得见
await js(`document.querySelector('.bag-button').click()`)
await waitFor(`document.querySelector('.cart-stepper')`, 8000)
await sleep(400)
if (await js(`!!document.querySelector('.primary-button')`)) {
  await force('.primary-button', true)
  const got = await scaleOf('.primary-button')
  await force('.primary-button', false)
  ok('购物袋主按钮', `→ ${got}`)
  assert.ok(Math.abs(got - 0.97) < 0.002, `主按钮按下该是兜底幅度 0.97，实际 ${got}`)
}
const cart = await js(`(async () => {
  const num = () => document.querySelector('.qty-num')
  const before = num().textContent
  const beforeAnim = getComputedStyle(num()).animationName
  document.querySelector('.cart-stepper button:last-child').click()
  await new Promise(r => setTimeout(r, 60))
  const after = document.querySelector('.qty-num')
  return {
    变化前: before,
    变化后: after.textContent,
    数字动画: beforeAnim,
    合计动画: getComputedStyle(document.querySelector('.bottom-price')).animationName,
  }
})()`)
ok('购物袋加减', cart)
assert.notEqual(cart.变化前, cart.变化后, '点「+」数量要变')
assert.equal(cart.数字动画, 'numPop', '数量变化要带上 numPop（原地换数字是看不见的）')
assert.equal(cart.合计动画, 'numPop', '合计金额变化也要看得见')

// ---- [·] 转场期间 position:fixed 的底栏不能跑 ----
// 这是「不套 transform」的唯一理由：一旦祖先带 transform，底栏的包含块会从视口变成
// 那个祖先，动画期间会掉到内容底部（购物袋/结算页比视口高 → 底栏消失再蹦回来）。
console.log('\n[·] 转场期间固定底栏不能跑')
const barTrip = await js(`(async () => {
  const bar = () => document.querySelector('.bottom-bar')
  const out = []
  const t0 = performance.now()
  document.querySelector('.primary-button').click()   // 去结算
  for (let i = 0; i < 9; i++) {
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => setTimeout(r, 30))
    const b = bar()
    out.push(b ? Math.round(b.getBoundingClientRect().bottom) : null)
  }
  return { 采样: out, 视口高: innerHeight, 到结算页了: !!document.querySelector('.checkout-form') }
})()`)
ok('底栏位置采样', barTrip)
assert.ok(barTrip.到结算页了, '点「去结算」要真的到结算页')
assert.ok(barTrip.采样.every((b) => b !== null), '转场全程底栏都必须还在: ' + JSON.stringify(barTrip.采样))
assert.ok(
  barTrip.采样.every((b) => Math.abs(b - barTrip.视口高) <= 1),
  `底栏必须一直钉在视口底部（视口高 ${barTrip.视口高}），实际采样 ${JSON.stringify(barTrip.采样)} —— ` +
  '多半是有人给页面加了 transform，把 fixed 的包含块改了',
)

// ---- [6] 减弱动态效果：上面那些动效全部不发生，但功能照常 ----
console.log('\n[6] prefers-reduced-motion')
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' })
await sleep(1600)
await waitFor(`document.querySelectorAll('.shop-row').length > 0`, 20000)
const reduced = await js(`(async () => {
  document.querySelector('.shop-row').click()
  await new Promise(r => requestAnimationFrame(r))
  await new Promise(r => setTimeout(r, 90))
  const 屏 = [...document.querySelectorAll('.page-shell > *:not(.toast) > *')].find(e => !e.classList.contains('bottom-bar'))
  const 进场 = 屏 ? getComputedStyle(屏).animationName : null
  const 透明度 = 屏 ? Number(getComputedStyle(屏).opacity) : null
  const onCounter = !!document.querySelector('.add-button')
  const btn = document.querySelector('.add-button')
  if (btn) btn.click()
  await new Promise(r => setTimeout(r, 250))
  return {
    进场动画: 进场,
    进场透明度: 透明度,
    换页了: onCounter,
    飞点数: document.querySelectorAll('.fly-token').length,
    角标: document.querySelector('.bag-button .cart-count')?.textContent || '(无)',
  }
})()`)
ok('减弱动态效果', reduced)
assert.equal(reduced.进场动画, 'none', '开了减弱动态效果就不该有进场动画')
assert.equal(reduced.进场透明度, 1, '也不该有半透明的一帧')
assert.ok(reduced.换页了, '但页面必须照样换过去 —— 关了动效不是关了功能')
assert.equal(reduced.飞点数, 0, '不该有飞点')
assert.ok(parseInt(reduced.角标, 10) >= 1, `加购照样要算数（角标 = ${reduced.角标}）`)
await send('Emulation.setEmulatedMedia', { features: [] })

// ---- [7] 体检 ----
console.log('\n[7] 体检')
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' })
await sleep(1500)
const health = await js(`(() => ({
  横向溢出: document.documentElement.scrollWidth > innerWidth,
  飞点残留: document.querySelectorAll('.fly-token').length,
  进场动画残留: getComputedStyle(document.querySelector('.page-shell > .shop-page')).opacity,
}))()`)
ok('体检', health)
assert.ok(!health.横向溢出, '横向溢出了')
assert.equal(health.飞点残留, 0, '有没清掉的飞点')
const realErrors = errors
  .filter((e) => !/favicon/i.test(e.url))
  .map((e) => `${e.text} @ ${e.url}`)
assert.deepEqual(realErrors, [], '控制台有报错: ' + realErrors.join(' | '))

const shot = await send('Page.captureScreenshot', { format: 'png' })
fs.writeFileSync('/tmp/interactions-final.png', Buffer.from(shot.data, 'base64'))
console.log('\n✅ 交互层全绿（切页进场 / 立刻点得动 / 手感 / 加购动线 / 减弱动态效果）')
ws.close()
process.exit(0)
