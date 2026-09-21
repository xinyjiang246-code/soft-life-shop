// 检查并行改动后的整体健康度：等待页新组件 + 首页完整性 + 全页面报错
import fs from 'node:fs'
const OUT = '/tmp/shots'; fs.mkdirSync(OUT, { recursive: true })
const r = await fetch('http://127.0.0.1:9222/json/list')
const list = await r.json(); const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pend = new Map()
await new Promise((res) => ws.addEventListener('open', res))
const logs = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 140))
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text))
  if (m.method === 'Network.loadingFailed') logs.push('[net-fail] ' + m.params.errorText)
  if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) }
})
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pend.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => { const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.exceptionDetails) throw new Error(JSON.stringify(o.exceptionDetails).slice(0, 300)); return o.result.value }
const shotV = async (n) => { const rr = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(rr.data, 'base64')); console.log(' 📸', n) }
const nav = async (w = 2200) => { await send('Page.navigate', { url: 'http://127.0.0.1:8080/?t=' + Date.now() }); await sleep(w) }
const click = (sel) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el)return false; el.click(); return true})()`)

await send('Page.enable'); await send('Runtime.enable')
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })

await nav(1600); await js('localStorage.clear()'); await nav(2400)

// A. 首页完整性（磁贴小画 + 惜食柜入口是否还在对方改过 HomeScreen 之后仍然完好）
console.log('\nA. 首页（对方 11:35 改过 HomeScreen）')
console.log('   磁贴数 =', await js(`document.querySelectorAll('.corner-tile').length`), '｜入口条 =', await js(`!!document.querySelector('.rescue-strip')`), '｜世界入口 =', await js(`!!document.querySelector('.world-entry')`))
// ⚠️ 磁贴小画是 loading="lazy"：**不滚到它们就用 naturalWidth 判定会全部误报 0**。
// 容器是 `.corner-grid`（不是 .corner-tiles），滚过去再等一会儿才有数据。
await js(`document.querySelector('.corner-grid')?.scrollIntoView({ block: 'center' })`); await sleep(2600)
const tiles = await js(`[...document.querySelectorAll('.corner-tile')].map(t=>{const i=t.querySelector('img'); return {t:t.querySelector('b')?.textContent, art:i?i.currentSrc.split('/').pop():'（无图）', w:i?i.naturalWidth:0, ok:i?(i.complete&&i.naturalWidth>0):null}})`)
tiles.forEach((t) => console.log(`   ${t.t} → ${t.art} (naturalWidth ${t.w}${t.ok === false ? ' ❌ 没加载' : ''})`))
await js(`window.scrollTo(0, 0)`); await sleep(400)

// B. 走一遍主流程到等待页，看新组件 + 我的改动是否共存
console.log('\nB. 主流程 → 等待页（组件 = RiderWindow「骑手骑到哪了」，2026-09-16 取代了 RiderGame）')
await js(`document.querySelector('.shop-row')?.click()`); await sleep(1500)
await js(`document.querySelectorAll('.menu-row .add-button')[0]?.click()`); await sleep(500)
await js(`[...document.querySelectorAll('.spec-add')].forEach(b=>b.click())`) // 有规格的商品点 + 是「展开」，这里补一步提交（默认规格）
await click('button[aria-label*="购物袋"]'); await sleep(1400)
await click('.primary-button'); await sleep(1500)
await click('.primary-button'); await sleep(2000)  // 结算 → 配送
for (let i = 0; i < 30; i++) {
  if (await js(`!!document.querySelector('.skip-wait-button')`)) break
  await sleep(700)
}
console.log('   进入等待页 =', await js(`!!document.querySelector('.skip-wait-button')`))
console.log('   骑手来信存在 =', await js(`!!document.querySelector('.rider-letters')`), '｜进度窗存在 =', await js(`!!document.querySelector('.rider-window')`))
console.log('   进度窗：地标', await js(`document.querySelectorAll('.rw-land').length`), '｜已过', await js(`document.querySelectorAll('.rw-land.is-passed').length`), '｜文案', await js(`document.querySelector('.rw-msg')?.innerText`))
// 它是一扇窗，不是游戏：窗内不该有任何可点的东西，也不该有 canvas
console.log('   窗内可交互元素（应为 0）=', await js(`document.querySelectorAll('.rider-window button, .rider-window a, .rider-window input').length`), '｜canvas（应为 0）=', await js(`document.querySelectorAll('.rider-window canvas').length`))
console.log('   旧 RiderGame 残留（应为 0）=', await js(`document.querySelectorAll('.rider-game, [class*="rg-"]').length`))
console.log('   额度面板存在 =', await js(`!!document.querySelector('.patience-panel, [class*="patience"]')`))
await shotV('health-waiting')
console.log('   → 再点一次催单（确认进度窗没挡住交互）')
console.log('   催单按钮可点 =', await js(`(()=>{const b=document.querySelector('.skip-wait-button'); return b?!b.disabled:null})()`))

// C. 全页面扫错
console.log('\nC. 逐页扫错')
logs.length = 0
for (const [name, sel] of [['home', null], ['counters', '.menu-button'], ['rescue', '.rescue-strip'], ['search', 'button[aria-label="搜索"]'], ['wishlist', 'button[aria-label*="心愿单"]']]) {
  await nav(1900)
  if (sel) { await click(sel); await sleep(1300) }
  const imgs = await js(`(()=>{const bad=[...document.images].filter(i=>i.complete&&i.naturalWidth===0); return {n:document.images.length,bad:bad.length}})()`)
  console.log(`   ${name}: 图片 ${imgs.n}，坏图 ${imgs.bad}`)
}
console.log(`   日志 ${logs.length} 条`)
logs.slice(0, 10).forEach((l) => console.log('     ' + l))
ws.close()
