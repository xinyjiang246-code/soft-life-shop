// 交付图素材：交互层三件事的抓帧
//   tr-*.png   切页转场（把 VT 动画放慢到 2.4s 才抓得到中间帧 ——
//              正常 260ms 时 CDP 截图还没返回，动画早跑完了，四帧会一模一样）
//   fly-*.png  加购飞点（同理：把 WAAPI 的 playbackRate 调到 0.25）
//   press-*.png 按下态局部放大（常态 vs 强制 :active，4 倍放大看形变与"陷进去"）
import fs from 'node:fs'

const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
const page = list.find((t) => t.type === 'page' && /8080/.test(t.url || ''))
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
const shot = async (path, clip) => {
  const s = await send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' })
  fs.writeFileSync(path, Buffer.from(s.data, 'base64'))
}
const waitFor = async (expr, ms = 20000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await js(`!!(${expr})`)) return; await sleep(250) }
  throw new Error('等不到: ' + expr)
}

await send('Page.enable')
await send('Runtime.enable')
await send('DOM.enable')
await send('CSS.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' })
await sleep(1500)
await js(`localStorage.clear()`)
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' })
await sleep(2200)
await waitFor(`document.querySelectorAll('.shop-row').length > 0`)

// ---- ① 切页进场：把动画**暂停在指定时刻**再抓 ----
// ⚠️ 直接截是抓不到中间帧的：Page.captureScreenshot 会等合成器稳定，等于把动画
//    快进到底（实测 2.4s 的转场四帧字节数几乎一样、像素差 0.00~0.35）。
//    必须 pause() 冻住再截，才是确定的。
console.log('[1] 切页进场')
await js(`document.querySelector('.shop-row').click()`)
const frozen = await js(`(() => {
  const els = [...document.querySelectorAll('.page-shell > *:not(.toast) > *')].filter(e => !e.classList.contains('bottom-bar'))
  const anims = els.flatMap(el => el.getAnimations()).filter(a => a.playState === 'running')
  anims.forEach(a => a.pause())
  window.__navAnims = anims
  const a0 = anims[0]
  return { 个数: anims.length, 时长: a0 ? a0.effect.getTiming().duration : null, 名: a0 ? a0.animationName : null }
})()`)
console.log('  冻住的动画', JSON.stringify(frozen))
for (const [i, t] of [[0, 0], [1, 80], [2, 170], [3, 260]]) {
  await js(`(async () => {
    window.__navAnims.forEach(a => { a.currentTime = ${t} })
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => requestAnimationFrame(r))
  })()`)
  await shot(`/tmp/tr-${i}.png`)
}
await js(`window.__navAnims.forEach(a => a.play())`)
await sleep(400)
await waitFor(`document.querySelector('.add-button')`, 8000)
await sleep(400)
console.log('  切页四帧好了')

// ---- ② 加购飞点：把动画冻在指定时刻再抓 ----
// 和转场同一个道理，而且还多一层坑：**记录坐标的时机和截图生效的时机不一样**。
// 第一版是先读 rect 再 shot()，看着没问题，实际 shot() 这条管线本身要 ~300ms
// （整页 780×1688 的 PNG），期间点还在往前飞 —— 交付图上圈的位置和点在的地方对不上。
// 冻住之后两边就一致了。
console.log('[2] 加购动线')
const timing = await js(`(async () => {
  document.querySelector('.add-button').click()
  await new Promise(r => requestAnimationFrame(r))
  const a = document.getAnimations().find(x => x.effect && x.effect.target &&
    x.effect.target.classList && x.effect.target.classList.contains('fly-token'))
  if (!a) return null
  a.pause()
  window.__fly = a
  return a.effect.getTiming().duration
})()`)
console.log('  飞行动画时长', timing, 'ms')
const rectNow = `(() => {
  const t = document.querySelector('.fly-token')
  if (!t) return null
  const r = t.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})()`
const marks = []
for (const [i, t] of [[0, 40], [1, 190], [2, 360]]) {
  await js(`(async () => {
    window.__fly.currentTime = ${t}
    await new Promise(r => requestAnimationFrame(r))
    await new Promise(r => requestAnimationFrame(r))
  })()`)
  marks.push(await js(rectNow))
  await shot(`/tmp/fly-${i}.png`)
}
// 到位帧：先让动画跑完，再把「袋子晃 / 角标弹」这两个 CSS 动画也冻在最大那一下
await js(`(async () => {
  window.__fly.play()
  await window.__fly.finished.catch(() => {})
  const bag = document.querySelector('.bag-button')
  const badge = document.querySelector('.bag-button .cart-count')
  bag.classList.add('is-bumped')
  if (badge) badge.classList.add('is-popped')
  await new Promise(r => requestAnimationFrame(r))
  const ba = bag.getAnimations().find(x => x.animationName === 'bagBump')
  const ca = badge && badge.getAnimations().find(x => x.animationName === 'countPop')
  if (ba) { ba.pause(); ba.currentTime = 140 }
  if (ca) { ca.pause(); ca.currentTime = 90 }
  await new Promise(r => requestAnimationFrame(r))
  await new Promise(r => requestAnimationFrame(r))
})()`)
marks.push(null)
await shot('/tmp/fly-3.png')
await js(`(() => {
  const bag = document.querySelector('.bag-button')
  bag.classList.remove('is-bumped')
  bag.getAnimations().forEach(a => a.play())
  document.querySelectorAll('.cart-count').forEach(c => { c.classList.remove('is-popped'); c.getAnimations().forEach(a => a.play()) })
})()`)
fs.writeFileSync('/tmp/fly-marks.json', JSON.stringify(marks))
console.log('  四帧位置', JSON.stringify(marks))

// ---- ③ 按下态：常态 / 按下，4 倍放大 ----
console.log('[3] 点击手感放大')
const force = async (sel, active) => {
  const { root } = await send('DOM.getDocument', { depth: 1 })
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: sel })
  if (!nodeId) throw new Error('找不到 ' + sel)
  await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: active ? ['active'] : [] })
  await sleep(300)
}
const zoomOn = async (sel, pad = 34, scale = 4) => {
  const r = await js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect()
    return { x: b.left, y: b.top, w: b.width, h: b.height } })()`)
  return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + pad * 2, height: r.h + pad * 2, scale }
}

for (const [sel, name] of [['.add-button', 'add'], ['.icon-button', 'icon'], ['.kind-chip', 'chip']]) {
  if (sel === '.kind-chip') {
    // chip 在首页
    await js(`document.querySelector('.menu-button').click()`)
    await waitFor(`document.querySelector('.kind-chip')`, 8000)
    await sleep(700)
  }
  if (!(await js(`!!document.querySelector(${JSON.stringify(sel)})`))) { console.log('  跳过', sel); continue }
  const clip = await zoomOn(sel)
  await force(sel, false)
  await shot(`/tmp/press-${name}-off.png`, clip)
  await force(sel, true)
  await shot(`/tmp/press-${name}-on.png`, clip)
  const measured = await js(`(() => { const s = getComputedStyle(document.querySelector(${JSON.stringify(sel)}))
    return { scale: s.scale, shadow: s.boxShadow, transform: s.transform } })()`)
  console.log(`  ${name}: 按下 ${JSON.stringify(measured)}`)
  await force(sel, false)
}
ws.close()
process.exit(0)
