// 冒烟：Service Worker 注册成功 + 预缓存壳落位 + 断网离线仍能开（2026-09-29）
// 步骤：访问首页 → 等 SW install/activate → 断言 controller + 缓存桶 → 断网 → 刷新 → 断言页面仍在
const ver = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const sock = new WebSocket(ver.webSocketDebuggerUrl)
let id = 0; const pending = new Map(); let sid
await new Promise((r) => sock.addEventListener('open', r))
sock.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) } })
const send = (method, params = {}, session = sid) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); sock.send(JSON.stringify({ id: mid, method, params, ...(session ? { sessionId: session } : {}) })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = async (e) => { const o = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (o.exceptionDetails) throw new Error((o.exceptionDetails.exception && o.exceptionDetails.exception.description) || o.exceptionDetails.text); return o.result.value }

const ctx = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx }, null)
sid = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
for (const d of ['Page', 'Runtime', 'Network']) await send(`${d}.enable`)
await send('Network.setCacheDisabled', { cacheDisabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

const results = []
const check = (cond, msg) => results.push((cond ? '✅ ' : '❌ ') + msg)

await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(3000)

// 1. SW 支持 + 注册成功
const reg = await js("(() => 'serviceWorker' in navigator && navigator.serviceWorker.getRegistration().then(r => !!r))()")
check(reg === true, 'Service Worker 已注册')

// 2. 等 activate
const swState = await js("navigator.serviceWorker.ready.then(r => r.active ? r.active.state : 'no-active')")
check(swState === 'activated', 'SW 已激活（state = ' + swState + '）')

// 3. 缓存桶已建（预缓存壳）
const cachesInfo = await js("caches.keys().then(ks => ks.join(','))")
check(/soft-life-shell/.test(cachesInfo), 'shell 缓存桶已建（' + cachesInfo + '）')
const shellCount = await js("caches.open('soft-life-shell-v1').then(c => c.keys()).then(a => a.length)")
check(shellCount >= 5, '预缓存壳已装（' + shellCount + ' 项）')

// 4. 运行时缓存：再访问一次让 hash 的 js/css 落进 runtime 桶
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2000)
const runtimeCount = await js("caches.open('soft-life-runtime-v1').then(c => c.keys()).then(a => a.length)")
check(runtimeCount >= 1, '运行时缓存已开始装 hash 资源（' + runtimeCount + ' 项）')

// 5. 断网离线：模拟离线，刷新，页面应仍能开
await send('Network.enable')
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
await send('Page.navigate', { url: 'http://127.0.0.1:8080/' }); await sleep(2500)
const offlineOk = await js("!!document.querySelector('.home-page, .hm-cover, #root > main') || !!document.querySelector('#root > *')")
const offlineTitle = await js("document.title")
check(offlineOk, '断网离线仍能开壳（title = ' + offlineTitle + '）')
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })

console.log('\n===== 结果 =====')
results.forEach((r) => console.log(r))
const failed = results.filter((r) => r.startsWith('❌')).length
console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 条失败'))
await send('Target.closeTarget', { targetId }, null); sock.close(); process.exit(failed === 0 ? 0 : 1)
