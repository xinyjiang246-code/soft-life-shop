// 通用整页截图：等字体、等入场动画播完、等懒加载图触发，再按快门。
// 用法：node tools/shot-page.mjs <url> <out.png> [clickSelector] [--wait=ms]
//
// 为什么不复用 check-preview.mjs 的收尾：它等的是「所有 <img> 都 complete」，
// 而这个项目里有几处 figcaption/装饰图并不会 load（也有 alt="" 的懒加载占位），
// 那个条件会一直不成立 → 截不到图。这里改成「等 document 上跑着的动画全部结束」，
// 对应项目纪律「截图或量几何之前必须先等动画播完」。
import { writeFile } from 'node:fs/promises'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const out = process.argv[3] || '/tmp/shot.png'
const click = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : null
const extraWait = Number((process.argv.find((a) => a.startsWith('--wait=')) || '--wait=400').split('=')[1])
const scrollY = Number((process.argv.find((a) => a.startsWith('--scroll=')) || '--scroll=0').split('=')[1])
// 滚到某个元素：--to=.选择器 （用它比猜 scrollY 靠谱 —— 页面高度会随内容变）
const scrollTo = (process.argv.find((a) => a.startsWith('--to=')) || '').slice('--to='.length)

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
const errors = []
const failed = []
let sessionId
let contextId

socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (m.id) {
    const req = pending.get(m.id)
    if (!req) return
    clearTimeout(req.timer)
    pending.delete(m.id)
    if (m.error) req.reject(new Error(JSON.stringify(m.error)))
    else req.resolve(m.result)
  } else if (m.sessionId === sessionId) {
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      errors.push(d.exception?.description || d.text)
    }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      failed.push(`${m.params.response.status} ${m.params.response.url}`)
    }
  }
})

function send(method, params = {}, session = sessionId) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 20000)
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
      if (performance.now() - t0 > ${timeout}) return reject(new Error('timed out: ${expression.replace(/'/g, '')}'));
      setTimeout(check, 80);
    };
    check();
  })`)
}

try {
  contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')

  if (click) {
    await waitFor(`document.querySelector(${JSON.stringify(click)})`)
    await evaluate(`document.querySelector(${JSON.stringify(click)}).click()`)
  }

  await evaluate('document.fonts.ready.then(() => true)')
  if (scrollTo) {
    // ⚠️ behavior 必须写死 'instant'：全局 html { scroll-behavior: smooth } 会让
    //    默认的平滑滚动一直没到位，截图就截在半路上（老坑，见 skill）。
    await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(scrollTo)})
      if (!el) return false
      el.scrollIntoView({ block: 'center', behavior: 'instant' })
      return true
    })()`)
  } else if (scrollY) {
    await evaluate(`window.scrollTo(0, ${scrollY})`)
    await evaluate(`new Promise(r => setTimeout(r, 250))`)
  }
  // 关键：等 document 上所有「有限次」动画结束（入场 translateY/scale、日历格逐个弹入都算）。
  // ⚠️ 别用 `getAnimations().map(a => a.finished)` —— 首页那只乱走的猫 / 呼吸圈是
  //    `iterations: Infinity`，`finished` 永远不会 resolve，整条 await 直接挂死（实测 20s 超时）。
  //    只挑 iterations !== Infinity 的等，再用 Promise.race 兜一个硬上限。
  await evaluate(`Promise.race([
    new Promise((resolve) => {
      const finite = () => document.getAnimations().filter((a) => {
        const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {}
        return t.iterations !== Infinity
      })
      Promise.all(finite().map((a) => a.finished.catch(() => {}))).then(() => resolve('done'))
    }),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 3000)),
  ]).then(() => true)`)
  await evaluate(`new Promise(r => setTimeout(r, ${extraWait}))`)

  const state = await evaluate(`(() => {
    const running = document.getAnimations().filter(a => a.playState === 'running').length
    const bid = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const s = getComputedStyle(el)
      return { bg: s.backgroundColor, bgi: s.backgroundImage.slice(0, 60), color: s.color, radius: s.borderRadius }
    }
    return {
      runningAnimations: running,
      brokenImages: Array.from(document.images).filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
      pendingImages: Array.from(document.images).filter(i => !i.complete).length,
      scrollH: document.documentElement.scrollHeight,
      colors: {
        根: bid('.home-page'),
        顶栏: bid('.topbar'),
        氛围条: bid('.home-ambience'),
        hero: bid('.hero'),
        心情卡: bid('.mood-ritual'),
        店铺行: bid('.shop-row'),
        惜食条: bid('.rescue-strip'),
        世界入口: bid('.world-entry'),
        磁贴: bid('.corner-tile'),
      },
    }
  })()`)

  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(out, Buffer.from(data, 'base64'))
  console.log('SCREENSHOT', out)
  console.log('STATE', JSON.stringify(state))
  if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 5), null, 1))
  if (failed.length) console.log('FAILED', JSON.stringify(failed.slice(0, 5), null, 1))
} catch (e) {
  console.error('shot failed:', e.message)
  process.exitCode = 1
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null).catch(() => {})
  socket.close()
  for (const r of pending.values()) clearTimeout(r.timer)
}
