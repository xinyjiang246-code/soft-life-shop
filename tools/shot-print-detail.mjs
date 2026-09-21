// 印刷层「局部放大」对照 · 抓图侧
// 只抓**整屏**并把目标元素的**视口 rect** 写进 JSON，裁切交给 composes 那边的 Python。
// 为什么不用 CDP 的 clip：clip 吃的是**页面坐标**，scrollIntoView 之后极易错位
// （第一版就这么切偏了，切到了隔壁的说明文字）。整屏 + 视口 rect 只有一个坐标系。
import fs from 'node:fs'

const list = await fetch('http://127.0.0.1:9222/json/list').then((r) => r.json())
let page = list.find((t) => t.type === 'page') || await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' }).then((x) => x.json())
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pending = new Map()
await new Promise((res) => ws.addEventListener('open', res))
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) } })
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => { const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.exceptionDetails) throw new Error(JSON.stringify(o.exceptionDetails).slice(0, 220)); return o.result.value }
const clickText = (re) => `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>${re}.test(x.textContent)); if(!b) return false; b.click(); return true})()`

const OFF = `
.page-shell{background-image:radial-gradient(rgba(74,69,64,.025) .65px,transparent .8px),repeating-linear-gradient(94deg,rgba(159,127,95,.018) 0 1px,transparent 1px 7px)!important;background-size:6px 6px,11px 11px!important}
.skip-wait-button,.surprise-button,.exchange-option,.fold-step,.add-button,.wait-mode.is-on,.rw-moment-opt{box-shadow:none!important;transform:none!important}
.rw-head,.rh-head,.fold-head,.patience-head{border-bottom:none!important;padding-bottom:0!important}
.rider-letters-head{border-bottom:1px dashed var(--divider)!important;padding-bottom:10px!important}
.print-seal{display:none!important}
`
const printingOff = () => js(`(()=>{let s=document.getElementById('print-off'); if(!s){s=document.createElement('style');s.id='print-off';document.head.appendChild(s)} s.textContent=\`${OFF}\`; return true})()`)
const printingOn = () => js(`(()=>{const s=document.getElementById('print-off'); if(s) s.remove(); return true})()`)

const rects = {}
// 整屏抓（不裁）—— 只存图，坐标的事交给 Python
const captureFull = async (name) => {
  const rr = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`/tmp/full-${name}.png`, Buffer.from(rr.data, 'base64'))
  console.log('  shot', name, '(整屏)')
}
// 抓一张整屏 + 记录目标元素的视口 rect（含 padding）
const capture = async (name, sel, pad = 14, fixedArea = null) => {
  let box = fixedArea
  if (!box) {
    box = JSON.parse(await js(`JSON.stringify((()=>{
      let el = null
      try { el = document.querySelector(${JSON.stringify(sel)}) } catch (e) {}
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      return null
    })())`))
    await sleep(350)
    box = JSON.parse(await js(`JSON.stringify((()=>{
      let el = null
      try { el = document.querySelector(${JSON.stringify(sel)}) } catch (e) {}
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x - ${pad}, y: r.y - ${pad}, width: r.width + ${pad} * 2, height: r.height + ${pad} * 2 }
    })())`))
  }
  if (!box) { console.log('  ✗ 找不到', sel); return false }
  await sleep(320)
  const rr = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`/tmp/full-${name}.png`, Buffer.from(rr.data, 'base64'))
  rects[name] = { x: +box.x.toFixed(1), y: +box.y.toFixed(1), w: +box.width.toFixed(1), h: +box.height.toFixed(1) }
  console.log('  shot', name)
  return true
}

await send('Page.enable'); await send('Runtime.enable')
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Math.random = () => 0' })
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(1400)
await js(`localStorage.clear()`)
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2600)
await js(`document.fonts.ready.then(() => true)`)

await js(`document.querySelectorAll('.shop-row')[0].click()`); await sleep(1400)
await js(`[...document.querySelectorAll('.add-button')].slice(0,1).forEach(b=>b.click())`); await sleep(500)
await js(`[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())`) // 有规格的商品点 + 是「展开」，这里补一步提交（默认规格）
await js(`document.querySelector('.cart-button').click()`); await sleep(900)
await js(clickText('/去结账|结算|下单/')); await sleep(900)
await js(clickText('/确认|下单|提交/')); await sleep(1200)
for (let t = 0; t < 30000; t += 600) { if (await js(`!!document.querySelector('.skip-wait-button')`)) break; await sleep(600) }
await sleep(1500)

console.log('[2] 硬阴影')
await capture('2-shadow-after', '.skip-wait-button', 18)
await printingOff(); await capture('2-shadow-before', '.skip-wait-button', 18)
await printingOn()

console.log('[3] 1px 实线')
await capture('3-line-after', '.rw-head', 16)
await printingOff(); await capture('3-line-before', '.rw-head', 16)
await printingOn()

console.log('[4] 印章')
await js(`document.querySelector('.skip-wait-button').click()`); await sleep(900)
await js(`document.querySelector('.exchange-option').click()`); await sleep(2600)
for (let t = 0; t < 15000; t += 500) { if (await js(`!!document.querySelector('.ending-card')`)) break; await sleep(500) }
await sleep(1200)
await js(`window.scrollTo(0, 0)`); await sleep(500)
const sealArea = JSON.parse(await js(`JSON.stringify((()=>{
  const card = document.querySelector('.ending-card').getBoundingClientRect()
  return { x: card.right - 158, y: card.top - 36, width: 200, height: 140 }
})())`))
await capture('4-seal-after', null, 0, sealArea)
await printingOff(); await capture('4-seal-before', null, 0, sealArea)
await printingOn()

// 颗粒放在最后，并且**抓整屏**（不裁）——
// 由 Python 侧在「改造前」的整屏里自动找一块最均匀的区域，再在同一位置比 σ。
// 为什么不在 JS 里写死坐标：第一版取页面左上角 y=6 → 切到顶栏（有返回箭头和标题）；
// 第二版取卡片下方 → 切里混进了分隔线的边缘，σ 被边缘主导，测出「加了颗粒反而更均匀」的假结果。
// 颗粒挂在 .page-shell 上，哪一页都成立，让程序去挑最干净的一块最稳。
console.log('[1] 颗粒纸面（整屏抓，Python 侧挑最均匀区域）')
await js(`window.scrollTo(0, 0)`); await sleep(500)
await printingOn(); await captureFull('grain-after')
await printingOff(); await captureFull('grain-before')
await printingOn()

fs.writeFileSync('/tmp/print-rects.json', JSON.stringify(rects, null, 2))
console.log('\nrects →', JSON.stringify(rects))
ws.close(); process.exit(0)
