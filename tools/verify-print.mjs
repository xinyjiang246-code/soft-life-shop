// 验收：印刷层（颗粒纸面 · 硬阴影 · 1px 实线 · 印章）
//
// 为什么需要它：印刷层全是**视觉**改动，build 绿、断言不写就等于没验。
// 2026-09-17 踩到的真问题：印章塞进 `.ending-header` 那一行 flex 里，
//   卡片内宽只有 292px，而最长的 eyebrow「YOUR ORDER HAS ARRIVED」(22 字符) +
//   42px 的章会把整行挤超 → 左边的 `END · 01 / 02` 被迫折成两行。
//   截图上一眼看不出「折行了」，用 getBoundingClientRect 的高度比才对得上。
//
// 断言：
//   ① 四项手段真的生效（颗粒图 / 硬阴影是「偏移实色」不是模糊 / 实线 / 印章砖红）
//   ② 等待页抬头行是印刷实线（solid 1px），不是原来的虚线
//   ③ 结局页头部**不许折行** —— 强制走最长的 eyebrow「YOUR ORDER HAS ARRIVED」来测
//   ④ 角章与 eyebrow 几何上不相交
//   ⑤ 全页无破图 / 无横向溢出
import assert from 'node:assert/strict'
import fs from 'node:fs'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const tag = process.argv[3] || 'print'
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
const shot = async (n) => { const rr = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`/tmp/${tag}-${n}.png`, Buffer.from(rr.data, 'base64')); return `${tag}-${n}` }
const clickText = (re) => `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>${re}.test(x.textContent)); if(!b) return false; b.click(); return true})()`
// 点之前先等它出现 —— 「点空」的代价是后面等不到下一个元素，报出来是假警报
const waitFor = async (expr, ms = 20000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await js(`!!(${expr})`)) return true; await sleep(250) }
  throw new Error('等不到: ' + expr)
}

await send('Page.enable'); await send('Runtime.enable')
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })
// 强制结局走 index 0（warm = 「YOUR ORDER HAS ARRIVED」，最长的那条 eyebrow）——
// 不这么做就只能碰运气，测不到最坏情况，等于没测。
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Math.random = () => 0' })

await send('Page.navigate', { url }); await sleep(1400)
await js(`localStorage.clear(); localStorage.setItem('soft-life-wait-override-v1','8')`) // 8 秒短等待：快进花 1 分钟额度，守卫走得完
await send('Page.navigate', { url }); await sleep(2600)
await js(`document.fonts.ready.then(() => true)`)

console.log('\n[1] 首页：颗粒 + 硬阴影（点得动的东西才给）')
const home = JSON.parse(await js(`JSON.stringify((()=>{
  const shell = document.querySelector('.page-shell')
  const bg = getComputedStyle(shell).backgroundImage
  const btns = [...document.querySelectorAll('.surprise-button,.skip-wait-button,.exchange-option,.add-button,.wait-mode,.rw-moment-opt')]
  const withShadow = btns.filter(b => /rgb/.test(getComputedStyle(b).boxShadow) && / 0px 0px/.test(getComputedStyle(b).boxShadow.replace(/rgba?\\([^)]*\\)/, '')))
  return { 颗粒层数: (bg.match(/url\\(|gradient\\(/g)||[]).length, 颗粒是SVG: /svg\\+xml/.test(bg), 影子按钮数: withShadow.length, 按钮总数: btns.length }
})())`))
ok('背景层', `${home.颗粒层数} 层（含颗粒 SVG：${home.颗粒是SVG}）`)
assert.ok(home.颗粒是SVG, '颗粒层没上 —— .page-shell 的 background-image 里找不到那份 SVG 噪点')
await shot('1-home')

console.log('\n[2] 菜单 → 加购 → 结算 → 等待页')
await waitFor(`document.querySelectorAll('.shop-row').length > 0`)
await js(`document.querySelector('.shop-row').click()`); await sleep(1400)
await shot('2-menu')
await js(`window.scrollTo(0,0)`); await sleep(300)
await waitFor(`document.querySelectorAll('.add-button').length > 0`)
await js(`[...document.querySelectorAll('.add-button')].slice(0,1).forEach(b=>b.click())`); await sleep(500)
await js(`[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())`) // 有规格的商品点 + 是「展开」，这里补一步提交（默认规格）
await waitFor(`document.querySelector('.cart-button')`)
await js(`document.querySelector('.cart-button').click()`); await sleep(900)
await waitFor(`[...document.querySelectorAll('button')].some(x=>/去结账|结算|下单/.test(x.textContent))`)
await js(clickText('/去结账|结算|下单/')); await sleep(900)
await waitFor(`[...document.querySelectorAll('button')].some(x=>/确认|下单|提交/.test(x.textContent))`)
await js(clickText('/确认|下单|提交/')); await sleep(1200)
// 2026-09-22 结算页插了支付面板（模拟）：确认下单后要先「付」才到配送页。
// ⚠️ 密码键要一下一下点 —— pressDigit 闭包里的 pin 不含未重渲染的新值，同步连点只记 1 位。
await waitFor(`document.querySelector('.pay-confirm')`, 15000)
await js(`document.querySelector('.pay-confirm').click()`)
await waitFor(`document.querySelectorAll('.pay-key').length > 0`, 15000)
for (let i = 0; i < 6; i++) {
  await js(`(() => { const ks = [...document.querySelectorAll('.pay-key')].filter(k => !k.classList.contains('blank')); ks[0] && ks[0].click() })()`)
  await sleep(150)
}
for (let t = 0; t < 30000; t += 600) { if (await js(`!!document.querySelector('.skip-wait-button')`)) break; await sleep(600) }

console.log('\n[3] 等待页：抬头行改成印刷实线')
const wait = JSON.parse(await js(`JSON.stringify((()=>{
  const heads = ['.rw-head','.rh-head','.fold-head','.patience-head','.rider-letters-head'].map(s=>document.querySelector(s)).filter(Boolean)
  const styles = heads.map(h=>{const cs=getComputedStyle(h);return cs.borderBottomStyle+' '+cs.borderBottomWidth})
  return { 命中行数: heads.length, 样式: [...new Set(styles)] }
})())`))
ok('抬头行', `${wait.命中行数} 条 → ${wait.样式.join(' / ')}`)
assert.ok(wait.命中行数 >= 2, '等待页抬头行没找到（选择器是不是改过？）')
assert.ok(wait.样式.every((s) => s === 'solid 1px'), `抬头行应是 solid 1px 实线，实际 ${wait.样式.join(' / ')}`)
await js(`document.querySelector('.rider-window')?.scrollIntoView({block:'start'})`); await sleep(500)
await shot('3-wait')

console.log('\n[4] 结局页：走最长的 eyebrow，头部不许折行 + 角章')
// ⚠️ 2026-09-21：加速改成了「催单仪式」（永不退回一键跳过）——
//    点 `.skip-wait-button` 只是**打开催单卡**（setExchangeOpen(true)），
//    还要选一句 `.exchange-option`（跟骑手说的一句话）才真的加速。
//    只点第一下 = 结局页永远等不到（上一版就是这么红的）。
await waitFor(`document.querySelector('.skip-wait-button')`, 30000)
await js(`document.querySelector('.skip-wait-button').click()`)
// ⚠️ 催单卡是 portal 到 body 的，渲染比点一下慢 —— 必须等 `.exchange-option` 真的出现再点。
//    旧版是「点完 sleep(900) 直接点」，卡还没出来 → 点空 → 结局页永远等不到（红在这）。
await waitFor(`document.querySelector('.exchange-option')`, 15000)
await js(`document.querySelector('.exchange-option').click()`)
await sleep(2600)
await js(`document.fonts.ready.then(() => true)`)
for (let t = 0; t < 15000; t += 500) { if (await js(`!!document.querySelector('.ending-card')`)) break; await sleep(500) }
await sleep(1000)
const end = JSON.parse(await js(`JSON.stringify((()=>{
  const box = el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), r: Math.round(r.right), b: Math.round(r.bottom) } }
  const num = document.querySelector('.ending-number')
  const eb = document.querySelector('.ending-header .eyebrow')
  const seal = document.querySelector('.print-seal')
  const card = document.querySelector('.ending-card')
  const cs = getComputedStyle(seal)
  const hit = (a, b) => !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y)
  const nums = (s) => (s.match(/-?\\d+(\\.\\d+)?/g) || []).map(Number)
  return {
    编号: box(num), eyebrow: box(eb), 印章: box(seal), 卡片: box(card),
    编号行数: Math.round(num.getBoundingClientRect().height / parseFloat(getComputedStyle(num).lineHeight)),
    eyebrow行数: Math.round(eb.getBoundingClientRect().height / parseFloat(getComputedStyle(eb).lineHeight)),
    eyebrow文本: eb.innerText,
    印章描边: cs.borderTopColor, 印章旋转: cs.transform,
    印章文本: seal.innerText,
    // 印章 height 是写死的 40px，拿高度除 line-height 推不出行数 ——
    // 用 Range 量文字本身：多行文字 getClientRects() 会返回**每行一个**矩形。
    印章文字行数: (() => { const rg = document.createRange(); rg.selectNodeContents(seal); return rg.getClientRects().length })(),
    印章探出卡片: box(seal).r > box(card).r,
    印章探出像素: box(seal).r - box(card).r,
    章底到eyebrow顶: Math.round(box(eb).y - box(seal).b),
    章压住eyebrow: hit(box(seal), box(eb)),
    硬阴影: getComputedStyle(document.querySelector('.surprise-button,.skip-wait-button')).boxShadow,
  }
})())`))
ok('eyebrow', `「${end.eyebrow文本}」→ ${end.eyebrow行数} 行`)
ok('编号', `${end.编号行数} 行 · ${end.编号.w}px`)
ok('印章', `${end.印章.w}px 描边 ${end.印章描边} 旋转 ${end.印章旋转}`)
ok('印章几何', `探出卡片 ${end.印章探出像素}px · 章底到 eyebrow 顶 ${end.章底到eyebrow顶}px`)
ok('硬阴影', end.硬阴影)
assert.equal(end.编号行数, 1, `编号折行了（${end.编号行数} 行）—— 头部又被挤超宽了`)
assert.equal(end.eyebrow行数, 1, `eyebrow 折行了（${end.eyebrow行数} 行）`)
assert.ok(/rgb\(180, 85, 45\)/.test(end.印章描边), `印章描边应是砖红 rgb(180,85,45)，实际 ${end.印章描边}`)
assert.ok(end.印章旋转 !== 'none', '印章没旋转 —— 不像盖上去的')
assert.equal(end.印章文字行数, 1, `印章里「${end.印章文本}」折成了 ${end.印章文字行数} 行 —— 章太小或字太大`)
assert.ok(!end.章压住eyebrow, '印章和 eyebrow 在几何上压住了')
assert.ok(end.印章探出卡片, '印章应该探出卡片一点点（贴在角上），现在整个缩在里面')
assert.ok(end.印章探出像素 <= 16, `印章探出卡片 ${end.印章探出像素}px，太多了会漂到页面留白里`)
assert.ok(end.章底到eyebrow顶 >= 3, `印章离 eyebrow 只有 ${end.章底到eyebrow顶}px，太挤`)
assert.ok(/2px 2px 0px/.test(end.硬阴影), `硬阴影应是偏移实色（2px 2px 0），实际 ${end.硬阴影}`)
await shot('4-ending')

console.log('\n[4b] 结局页的字阶：标题不许留孤字行 · 英文小语必须在重音声部上')
// 「今天你把自己照顾得很好」11 字 × 28px = 308px，而卡片内宽只有 292px ——
// 断成 10+1 时「好」会孤零零占一行。均衡断行（text-wrap: balance）切成 6+5 就没事，
// 但这类「断得难看」在缩略图里几乎看不出，必须量行盒。
const voice = JSON.parse(await js(`JSON.stringify((()=>{
  const t = document.querySelector('.ending-title')
  const rg = document.createRange(); rg.selectNodeContents(t)
  const lines = [...rg.getClientRects()].map(r => Math.round(r.width))
  const fs = parseFloat(getComputedStyle(t).fontSize)
  const a = document.querySelector('.ending-aside')
  const cs = a ? getComputedStyle(a) : null
  return {
    标题行宽: lines, 标题字号: fs,
    孤字行: lines.length > 1 && Math.min(...lines) < fs * 2,
    小语: a ? a.innerText : null,
    小语字体: cs ? cs.fontFamily.split(',')[0].replace(/["']/g, '') : null,
    小语重: cs ? +cs.fontWeight : 0, 小语斜: cs ? cs.fontStyle : null,
    小语轴: cs ? cs.fontVariationSettings : null,
  }
})())`))
ok('标题行盒', `${voice.标题行宽.join(' + ')}px（字号 ${voice.标题字号}px）`)
ok('英文小语', `${voice.小语} → ${voice.小语字体} ${voice.小语重}${voice.小语斜 === 'italic' ? 'i' : ''}`)
assert.ok(!voice.孤字行, `结局标题出现孤字行：行宽 ${voice.标题行宽.join(' / ')}（字号 ${voice.标题字号}px）`)
assert.ok(voice.小语, '结局页没有英文小语那一行（.ending-aside）—— 重音声部在这一页就落空了')
assert.ok(/Fraunces/.test(voice.小语字体 || ''), `英文小语没走 Fraunces，实际 ${voice.小语字体}`)
assert.equal(voice.小语斜, 'italic', '英文小语不是斜体')
assert.ok(voice.小语重 >= 700, `英文小语只有 ${voice.小语重} —— 不够重，压不住正文`)
assert.ok(/WONK/.test(voice.小语轴 || ''), '英文小语没开 WONK 轴')

console.log('\n[5] 全页体检')
const health = JSON.parse(await js(`JSON.stringify((()=>{
  const imgs=[...document.querySelectorAll('img')]
  const broken=imgs.filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.currentSrc||i.src)
  return { 图数: imgs.length, 破图: broken.length, 横向溢出: document.documentElement.scrollWidth > window.innerWidth + 1 }
})())`))
ok('体检', health)
assert.equal(health.破图, 0, '有破图：' + health.破图)
assert.equal(health.横向溢出, false, '页面横向溢出了')

console.log('\n✅ 印刷层全绿：颗粒 · 硬阴影 · 实线 · 角章；结局页头部不折行')
ws.close()
process.exit(0)
