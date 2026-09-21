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
// ⚠️ 每一步都要**先等元素出现再点**：原来是「点完 sleep(900) 再点下一个」，
//    冷启动（禁用缓存 + 正在下 Fraunces 变量字体）时页面还没渲染完，
//    那一下点空 → 后面一直等不到 .skip-wait-button，脚本报「等不到」——
//    这是假警报（2026-09-18 实际误报过一次），排查成本比修它高得多。
const clickWhen = async (sel, ms = 20000) => {
  await waitFor(`document.querySelector(${JSON.stringify(sel)})`, ms)
  await js(`document.querySelector(${JSON.stringify(sel)}).click()`)
}
const clickTextWhen = async (re, ms = 20000) => {
  await waitFor(`[...document.querySelectorAll('button')].some(x=>${re}.test(x.textContent))`, ms)
  await js(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>${re}.test(x.textContent)); b&&b.click()})()`)
}
await waitFor(`document.querySelectorAll('.shop-row').length > 0`, 20000)
await clickWhen('.shop-row')
await waitFor(`document.querySelectorAll('.add-button').length > 0`, 20000)
await js(`[...document.querySelectorAll('.add-button')].slice(0,2).forEach(b=>b.click())`)
await js(`[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())`) // 有规格的商品点 + 是「展开」，这里补一步提交（默认规格）
await sleep(400)
await clickWhen('.cart-button')
await clickTextWhen('/去结账|结算|下单/')
await clickTextWhen('/确认|下单|提交/')
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

// 三个标签必须等高、副标题必须都是单行 —— 一高一矮、一行两行混着，
// 整排看起来就像没收拾过（2026-09-18 用户：「视觉糙」）。
// 副标题宽只有约 98px（tab 114px 减内边距），字号 9.5px → 超过 10 个字必折行。
const tabs = JSON.parse(await js(`JSON.stringify([...document.querySelectorAll('.wait-mode')].map(c => {
  const s = c.querySelector('small')
  const rg = document.createRange(); rg.selectNodeContents(s)
  return { 高: Math.round(c.getBoundingClientRect().height), 副标题行数: rg.getClientRects().length, 副标题: s.textContent }
}))`))
ok('三个标签', tabs)
assert.equal(new Set(tabs.map(t => t.高)).size, 1, '三个标签必须等高，实际 ' + JSON.stringify(tabs.map(t => t.高)))
assert.ok(tabs.every(t => t.副标题行数 === 1), '三个副标题必须都是单行（太长就会折行）: ' + JSON.stringify(tabs))

// ---- [2] walk：路上遇事，替他选一下 ----
console.log('\n[2] 陪他走')
await waitFor(`document.querySelector('.rw-moment')`, 45000)
// 抬头行必须跟着模式走（这是「切换生效了没有」的第一眼凭据）
assert.equal(await js(`document.querySelector('.wd-badge').textContent.trim()`), '陪他走', '抬头行该显示当前方式')
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
// ⚠️ 这里最重要的一条：三种方式是**互斥**的（选中即替换）。
//    第一版是「一张常驻的骑手进度窗 + 往下追加玩法模块」—— 于是选了「帮他看路」之后，
//    第一屏里根本没有它，要往下滑才看得见自己选的东西（用户 2026-09-18：「选了没变化」）。
//    下面这条断言盯死它：切过去之后，另外两个主块必须不在 DOM 里。
console.log('\n[3] 帮他看路')
const blocks = () => js(`JSON.stringify(['.rider-window','.rider-hop','.fold-ritual'].filter(s=>document.querySelector(s)))`)
await js(`[...document.querySelectorAll('.wait-mode')].find(c=>c.textContent.includes('帮他看路')).click()`)
await waitFor(`document.querySelector('.rider-hop')`, 5000)
const onlyRoad = await blocks()
ok('切过去', onlyRoad)
assert.equal(onlyRoad, JSON.stringify(['.rider-hop']), '选中即替换：此时页面上只该有 .rider-hop')
assert.equal(await js(`document.querySelector('.wd-badge').textContent.trim()`), '帮他看路', '抬头行要跟着模式换 —— 否则用户看不出切换生效')
assert.ok(!(await js(`!!document.querySelector('.rw-moment')`)), '切走后不该再弹「路上遇事」')

// 障碍必须是真图形，不再是「圆角色块 + 头顶一行文字标签」
const obstacle = await js(`(() => {
  const it = document.querySelector('.rh-item')
  if (!it) return null
  return { 有图形: !!it.querySelector('svg'), 还有文字标签: !!it.querySelector('em') }
})()`)
if (obstacle) {
  ok('障碍', obstacle)
  assert.ok(obstacle.有图形, '障碍应该是画出来的图形')
  assert.ok(!obstacle.还有文字标签, '障碍不该再有「一滩水」那样的文字标签')
}

await js(`document.querySelector('.rh-lane').click()`)
await sleep(400)
const hopped = await js(`document.querySelector('.rh-tally')?.textContent || '(没渲染计数)'`)
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
const onlyFold = await blocks()
ok('切过去', onlyFold)
assert.equal(onlyFold, JSON.stringify(['.fold-ritual']), '选中即替换：此时页面上只该有 .fold-ritual')

// 折纸必须**真的在折**：第一版的「折纸」其实是按三下按钮、纸一动不动。
// 现在两折分别对应纸的两次形变，而且第二折必须让纸真的变矮。
const foldState = () => js(`JSON.stringify({
  左右折过: !!document.querySelector('.fp-sheet.is-x'),
  上下折过: !!document.querySelector('.fp-wrap.is-y'),
})`)
assert.equal(await foldState(), JSON.stringify({ 左右折过: false, 上下折过: false }), '一开始纸应该是平的')

const h1 = await js(`Math.round(document.querySelector('.fp-sheet').getBoundingClientRect().height)`)
await js(`document.querySelector('.fold-step').click()`); await sleep(700)
assert.equal(await foldState(), JSON.stringify({ 左右折过: true, 上下折过: false }), '第 1 折只该发生左右对折')
ok('第 1 折', '纸对折了')

// ⚠️ 第 2 折只写 rotateX(180deg) 是**假折**：那只是把纸镜像一下，占位高度没变，
//    截图上第 1 折和第 2 折一模一样（2026-09-18 实际踩到）。这里量实在的像素高度。
await js(`document.querySelector('.fold-step').click()`); await sleep(750)
const h2 = await js(`Math.round(document.querySelector('.fp-sheet').getBoundingClientRect().height)`)
ok('第 2 折', `${h1}px → ${h2}px`)
assert.ok(h2 < h1 * .75, `上下对折后纸该明显变矮，实际 ${h1} → ${h2} —— 多半是只写了 rotateX 没写 scaleY`)

await js(`document.querySelector('.fold-step').click()`); await sleep(750)
await waitFor(`document.querySelector('.fold-boxwrap.is-on')`, 4000)
const folded = await js(`(() => {
  const d = document.querySelector('.fold-done')
  return {
    标题: d.querySelector('.fold-done-title').textContent,
    收尾: d.querySelector('.fold-done-go').textContent,
    盒子亮起: !!document.querySelector('.fold-boxwrap.is-on'),
    盒子路径数: document.querySelectorAll('svg.fold-box path').length,
  }
})()`)
ok('折好了', folded)
assert.ok(folded.盒子亮起, '折完该出现那个小纸盒')
assert.ok(folded.盒子路径数 >= 3, '盒子应该是有几个面的（盒口 + 左右两壁），实际只有 ' + folded.盒子路径数 + ' 条路径')
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
