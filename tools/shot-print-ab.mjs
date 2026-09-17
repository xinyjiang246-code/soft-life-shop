// 印刷层前后对照抓图：同一屏抓两张 —— 「after」= 当前（带印刷层），
// 「before」= 注入一段把印刷层复原成 1fae84d 原样的样式后再抓。
//
// 复原内容是从 `git show 1fae84d:src/styles.css` 里抄出来的**实测值**，不是我凭印象写的：
//   .page-shell 原本 2 层背景（radial + repeating-linear）· 6px/11px
//   .rw-head/.rh-head/.fold-head/.patience-head 原本**没有**下边框
//   .rider-letters-head 原本是 `1px dashed var(--divider)` + padding-bottom 10px
//   没有任何硬阴影、没有印章
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
const shot = async (n) => { const rr = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`/tmp/ab-${n}.png`, Buffer.from(rr.data, 'base64')); console.log('  shot', n) }
const clickText = (re) => `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>${re}.test(x.textContent)); if(!b) return false; b.click(); return true})()`

const OFF = `
.page-shell{background-image:radial-gradient(rgba(74,69,64,.025) .65px,transparent .8px),repeating-linear-gradient(94deg,rgba(159,127,95,.018) 0 1px,transparent 1px 7px)!important;background-size:6px 6px,11px 11px!important}
.skip-wait-button,.surprise-button,.exchange-option,.fold-step,.add-button,.wait-mode.is-on,.rw-moment-opt{box-shadow:none!important;transform:none!important}
.rw-head,.rh-head,.fold-head,.patience-head{border-bottom:none!important;padding-bottom:0!important}
.rider-letters-head{border-bottom:1px dashed var(--divider)!important;padding-bottom:10px!important}
.print-seal{display:none!important}
`
const on = () => js(`(()=>{let s=document.getElementById('print-off'); if(!s){s=document.createElement('style');s.id='print-off';document.head.appendChild(s)} s.textContent=\`${OFF}\`; return true})()`)
const off = () => js(`(()=>{const s=document.getElementById('print-off'); if(s) s.remove(); return true})()`)

await send('Page.enable'); await send('Runtime.enable')
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Math.random = () => 0' })

await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(1400)
await js(`localStorage.clear()`)
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2600)
await js(`document.fonts.ready.then(() => true)`)

// 首页
await off(); await sleep(250); await shot('1-home-after')
await on(); await sleep(250); await shot('1-home-before')
await off()

// 菜单
await js(`document.querySelectorAll('.shop-row')[0].click()`); await sleep(1500)
await js(`window.scrollTo(0,0)`); await sleep(200)
await shot('2-menu-after')
await on(); await sleep(250); await shot('2-menu-before')
await off()

// 等待页
await js(`[...document.querySelectorAll('.add-button')].slice(0,1).forEach(b=>b.click())`); await sleep(500)
await js(`document.querySelector('.cart-button').click()`); await sleep(900)
await js(clickText('/去结账|结算|下单/')); await sleep(900)
await js(clickText('/确认|下单|提交/')); await sleep(1200)
for (let t = 0; t < 30000; t += 600) { if (await js(`!!document.querySelector('.skip-wait-button')`)) break; await sleep(600) }
await sleep(1500)
await js(`document.querySelector('.rider-window')?.scrollIntoView({block:'start'})`); await sleep(500)
await shot('3-wait-after')
await on(); await sleep(250); await shot('3-wait-before')
await off()

// 结局页
await js(`document.querySelector('.skip-wait-button').click()`); await sleep(900)
await js(`document.querySelector('.exchange-option').click()`); await sleep(2600)
await js(`document.fonts.ready.then(() => true)`)
for (let t = 0; t < 15000; t += 500) { if (await js(`!!document.querySelector('.ending-card')`)) break; await sleep(500) }
await sleep(1200)
await js(`window.scrollTo(0,0)`); await sleep(200)
await shot('4-ending-after')
await on(); await sleep(250); await shot('4-ending-before')
await off()

ws.close(); process.exit(0)
