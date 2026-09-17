// 验收：字型角色层（品牌字体是否真的生效、排版有没有被字体挤坏）
//
// 为什么需要它：2026-09-17 改字体时踩过一次「变量自引用」——
//   批量替换把 '--f-body: "PingFang SC"...' 改成了 '--f-body: var(--f-body)'，
//   变量取空 → 所有 var() 的 font 简写整条被丢弃 → 文字回落到浏览器默认 16px。
//   截图上看只是"字变大了点"，很难发现；下面的断言能立刻抓住。
//
// 三条断言：
//   ① 角色变量必须解析出非空值
//   ② 三支字体真的落到元素上（标题 Fraunces / 微标签 Space Mono / 正文苹方）
//   ③ 全页不许有「字号正好 16px」的文本元素 —— 本项目是手工字号刻度（8~30px），
//      出现 16px 只可能是某条 font 声明被丢弃后回落到了默认值
import assert from 'node:assert/strict'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
let page = list.find((t) => t.type === 'page') || await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((x) => x.json())
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pending = new Map()
await new Promise((res) => ws.addEventListener('open', res))
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) } })
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => { const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.exceptionDetails) throw new Error(JSON.stringify(o.exceptionDetails).slice(0, 200)); return o.result.value }
const ok = (l, v) => console.log('  ✓', l, v ?? '')

await send('Page.enable'); await send('Runtime.enable')
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url }); await sleep(1400)
await js(`localStorage.clear()`)
await send('Page.navigate', { url }); await sleep(2600)
await js(`document.fonts.ready.then(() => true)`)

console.log('\n[1] 角色变量')
const vars = await js(`JSON.stringify((() => {
  const cs = getComputedStyle(document.documentElement)
  // 只查 :root 上的角色变量 —— --jh-mono / --hm-mono 是手账/档案页的**作用域**变量，
  // 挂在 .jh / .archive-page 上，根节点读当然是空的（别把它们写进这里）
  const names = ['--f-serif', '--f-mono', '--f-body', '--f-cn-serif', '--f-hand', '--f-display']
  const out = {}
  names.forEach((n) => { out[n] = cs.getPropertyValue(n).trim() })
  return out
})())`)
const v = JSON.parse(vars)
ok('变量', vars)
for (const [k, val] of Object.entries(v)) {
  assert.ok(val, `${k} 是空的 —— 大概率是变量定义被替换脚本咬成了自引用`)
}

console.log('\n[2] 三支字体落到元素上')
const fonts = await js(`JSON.stringify((() => {
  const pick = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).fontFamily : null }
  // 微标签别写死类名（各页类名不同）：直接找出**第一个真的用上 Space Mono** 的叶子元素
  const monoEl = [...document.querySelectorAll('*')].find((el) => el.children.length === 0 && (el.innerText || '').trim() && /Space Mono/.test(getComputedStyle(el).fontFamily))
  return {
    标题: pick('h1'),
    微标签: monoEl ? getComputedStyle(monoEl).fontFamily : null,
    微标签样本: monoEl ? (monoEl.className + ' 「' + monoEl.innerText.trim().slice(0, 14) + '」') : '没找到',
    正文: getComputedStyle(document.body).fontFamily,
  }
})())`)
const f = JSON.parse(fonts)
ok('标题', f.标题)
ok('微标签', f.微标签 + '  ← ' + f.微标签样本)
assert.ok(/Fraunces/.test(f.标题 || ''), '标题应该走 Fraunces，实际: ' + f.标题)
assert.ok(/Space Mono/.test(f.微标签 || ''), '微标签应该走 Space Mono，实际: ' + f.微标签)
assert.ok(/PingFang/.test(f.正文 || ''), '正文应该走苹方，实际: ' + f.正文)

console.log('\n[3] 不许有回落默认字号的文本')
const bad = await js(`JSON.stringify((() => {
  const hits = []
  document.querySelectorAll('p, span, div, li, small, em, b, h1, h2, h3, button, a').forEach((el) => {
    if (el.children.length) return
    const t = (el.innerText || '').trim()
    if (!t) return
    // 只看**有 class 的**元素：<title>/<script>/<noscript> 和几个从没写过样式的
    // 裸标签（.shop-body 里的 h3、.amb-greet 里的 b）本来就是浏览器默认 16px，不是回归。
    // 有样式钩子的元素落到 16px，才说明它那条 font 声明被丢弃了。
    if (!el.className) return
    const cs = getComputedStyle(el)
    if (cs.fontSize !== '16px') return
    hits.push({ 文本: t.slice(0, 22), 类: String(el.className).slice(0, 30) })
  })
  return hits.slice(0, 8)
})())`)
ok('16px 元素', bad)
assert.equal(JSON.parse(bad).length, 0, '有元素回落到默认 16px —— 某条 font 声明被丢弃了')

console.log('\n[4] 声部：重音层是不是真的重，且没有膨胀')
// 2026-09-18 加了字阶层（斜衬线 800 做重音）。两条不变量：
//   ① 重音层的元素必须**真的**拿到 italic + 700 以上（否则就是有个后来的规则把它压回去了，
//      或者浏览器在拿伪斜体糊弄 —— Fraunces 的 ital 轴只有请求到才会是真斜体）；
//   ② 重音层数量要有上限。它的全部意义就是「少」——不设上限的话，下一个人顺手加几处，
//      就又回到「所有字都一样」的老问题。
const VOICE = '.brand,.section-title,.product-section h1,.ending-aside'
const voice = await js(`JSON.stringify([...document.querySelectorAll(${JSON.stringify(VOICE)})].map((el) => {
  const cs = getComputedStyle(el)
  return { 类: String(el.className).slice(0, 24), 文本: (el.innerText || '').replace(/\\s+/g, ' ').slice(0, 20),
           字体: cs.fontFamily.split(',')[0].replace(/["']/g, ''), 重: +cs.fontWeight, 斜: cs.fontStyle, vf: cs.fontVariationSettings }
}))`)
const vs = JSON.parse(voice)
ok(`重音层元素 ${vs.length} 个`, vs.map((x) => `${x.类}·${x.重}${x.斜 === 'italic' ? 'i' : ''}`).join(' | '))
for (const x of vs) {
  assert.ok(/Fraunces/.test(x.字体), `重音层「${x.文本}」没走 Fraunces：${x.字体}`)
  assert.equal(x.斜, 'italic', `重音层「${x.文本}」不是斜体`)
  assert.ok(x.重 >= 700, `重音层「${x.文本}」只有 ${x.重} —— 不够重，主次拉不开`)
  assert.ok(/WONK/.test(x.vf), `重音层「${x.文本}」没开 WONK 轴`)
}
assert.ok(vs.length <= 5, `重音层膨胀到 ${vs.length} 个（上限 5）—— 它靠「少」成立，多了就等于没有声部`)

console.log('\n[5] 最窄屏（320px）顶栏店招不许折行')
// 重音层的店招换成斜体 800 之后自然宽从 134px 长到 146px，
// 而 320px 顶栏中间只剩下 146px —— 正好卡在边界上，390px 上看不出任何问题。
// 只测 390px 的守卫永远抓不到这类「最窄屏专属」的折行，所以这里必须再量一遍 320px。
await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 800, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url }); await sleep(2400)
await js(`document.fonts.ready.then(() => true)`)
const narrow = JSON.parse(await js(`JSON.stringify((()=>{
  const b = document.querySelector('.brand')
  const rg = document.createRange(); rg.selectNodeContents(b)
  const menu = document.querySelector('.menu-button')
  return {
    行数: rg.getClientRects().length,
    文本: b.innerText.replace(/\\s+/g, ' '),
    左: Math.round(b.getBoundingClientRect().left), 右: Math.round(b.getBoundingClientRect().right),
    菜单右: menu ? Math.round(menu.getBoundingClientRect().right) : null,
  }
})())`))
ok('320px 店招', `「${narrow.文本}」${narrow.行数} 行 · x ${narrow.左}~${narrow.右}（菜单止于 ${narrow.菜单右}）`)
assert.equal(narrow.行数, 1, `店招在 320px 折成 ${narrow.行数} 行 —— 斜体比正体宽，窄屏要降一号字`)
assert.ok(narrow.左 > narrow.菜单右, '店招和左上角菜单按钮压住了')

console.log('\n✅ 字型层全绿：变量有值 · 三支字体到位 · 没有回落 · 重音层克制 · 窄屏不折行')
ws.close()
process.exit(0)
