#!/usr/bin/env node
/**
 * verify-home-cover.mjs —— 首页封面「一叠实拍」必须真的能翻看
 *
 * 为什么有这个守卫（2026-09-21）：
 *   封面从「单张实拍」换成 `HomeCover`（`.hm-polaroid` + `.hc-viewport` 横向吸附滚动）。
 *   它有三个**会静默崩掉**的点，build 全绿、控制台一句报错都没有：
 *     ① 高度：`.hc-slide` 是 height:100%、img 也 100%，父盒子不给高度就整块塌成
 *        「一条相纸边」—— 和 `.flip-frame` 那次是同一个坑的第三遍；
 *     ② iOS 的 `-webkit-overflow-scrolling` / `scroll-snap` 只在真有 `overflow-x:auto`
 *        时才工作 —— 被 `overflow:hidden` 覆盖掉的话，照片还在，但永远翻不动；
 *     ③ 圆点数 / 计数（01/04）必须跟着 scrollLeft 走 —— 拖动不更新的话，
 *        用户以为卡住了。
 *
 * 断言（都是真实渲染后量的，不是读源码）：
 *   [1] 帧高 ≥ 240px，且每张图渲染高 ≥ 200px          —— 塌陷
 *   [2] 每张 slide 宽度 == viewport 可视宽（一次正好一张）—— 否则会「露出半张」
 *   [3] 圆点数量 == slide 数量，计数初始为 01/N
 *   [4] 把 viewport 滚到第 2 张 → 计数变 02/N、第 2 颗点亮   —— 滚动真的接线了
 *   [5] 首屏几何：`.hm-pagehint` 底边 ≤ 底栏顶边            —— 开屏自成一屏
 *   [6] 点一下照片 → 进那一杯的商品页，且店里那一行**滚到了眼前、规格是展开的**
 *       ⚠️ 2026-09-24 改的：原来是「点一下 → 前进一张」。封面这 4 杯现在都是真商品，
 *          点一下该去那一杯；翻页只剩 横扫 / 圆点 / 键盘（[4] 仍然盯着滚动）。
 *
 * 用法：node tools/verify-home-cover.mjs [baseUrl]
 *      node tools/verify-home-cover.mjs --prove [baseUrl]   # 负向自检：砍掉 overflow-x，必须报红
 * 前置：预览服务在跑（cwd=dist/）+ 无头 Chrome 开着 9222。
 */
const args = process.argv.slice(2)
const prove = args.includes('--prove')
const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8080/').replace(/\/?$/, '/')

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  socket.addEventListener('open', res, { once: true })
  socket.addEventListener('error', rej, { once: true })
})

let nextId = 0
const pending = new Map()
let sessionId
let contextId
socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (!m.id) return
  const req = pending.get(m.id)
  if (!req) return
  clearTimeout(req.timer)
  pending.delete(m.id)
  if (m.error) req.reject(new Error(JSON.stringify(m.error)))
  else req.resolve(m.result)
})
function send(method, params = {}, session = sessionId) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')) }, 30000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
  })
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
async function waitFor(expression, timeout = 12000) {
  return evaluate(`new Promise((resolve, reject) => {
    const t0 = performance.now();
    const check = () => {
      if (${expression}) return resolve(true);
      if (performance.now() - t0 > ${timeout}) return reject(new Error('timed out waiting'));
      setTimeout(check, 70);
    };
    check();
  })`)
}

const MEASURE = `(() => {
  const cover = document.querySelector('.hc-cover')
  const vp = document.querySelector('.hc-viewport')
  if (!cover || !vp) return { missing: true }
  const slides = [...vp.querySelectorAll('.hc-slide')]
  const dots = [...document.querySelectorAll('.hc-dot')]
  const cr = cover.getBoundingClientRect()
  const vr = vp.getBoundingClientRect()
  const hint = document.querySelector('.hm-pagehint')
  const bar = document.querySelector('.tabbar-pp') || document.querySelector('.bottom-bar')
  return {
    cover: { w: Math.round(cr.width), h: Math.round(cr.height) },
    viewport: { w: Math.round(vr.width), h: Math.round(vr.height), top: Math.round(vr.top) },
    overflowX: getComputedStyle(vp).overflowX,
    snap: getComputedStyle(vp).scrollSnapType,
    scrollable: vp.scrollWidth > vp.clientWidth + 4,
    slides: slides.map((s) => {
      const r = s.getBoundingClientRect()
      const im = s.querySelector('img')
      const ir = im ? im.getBoundingClientRect() : null
      return { w: Math.round(r.width), h: Math.round(r.height),
               img: im ? { h: Math.round(ir.height), nw: im.naturalWidth, src: (im.currentSrc || im.src).split('/').pop().slice(0, 30) } : null }
    }),
    dotCount: dots.length,
    dotOn: dots.findIndex((d) => d.classList.contains('is-on')),
    name: (document.querySelector('.hc-name') || {}).textContent || '',
    count: (document.querySelector('.hc-count') || {}).textContent || '',
    hintBottom: hint ? Math.round(hint.getBoundingClientRect().bottom) : null,
    barTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
  }
})()`

const problems = []
const check = (cond, msg) => { if (!cond) problems.push(msg) }

try {
  contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

  await send('Page.navigate', { url: base + '?t=' + Date.now() })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  if (await evaluate(`!!document.querySelector('.ob-skip')`)) {
    await evaluate(`document.querySelector('.ob-skip').click()`)
    await evaluate(`new Promise(r => setTimeout(r, 250))`)
  }
  if (await evaluate(`!!document.querySelector('.hint-close')`)) {
    await evaluate(`document.querySelector('.hint-close').click()`)
    await evaluate(`new Promise(r => setTimeout(r, 250))`)
  }
  await evaluate(`document.fonts.ready.then(() => 1)`)
  await waitFor(`!!document.querySelector('.hc-viewport')`, 8000)
  await evaluate(`new Promise(r => setTimeout(r, 600))`)

  if (prove) {
    // 负向自检：把横向滚动砍掉（overflow 变 hidden）—— 照片还在，但永远翻不动
    await evaluate(`(() => {
      const s = document.createElement('style')
      s.id = 'prove-noscroll'
      s.textContent = '.hc-viewport { overflow-x: hidden !important }'
      document.head.appendChild(s)
      return true
    })()`)
    await evaluate(`new Promise(r => setTimeout(r, 400))`)
    const m = await evaluate(MEASURE)
    if (!m.scrollable) {
      console.log(`\n✅ 负向自检通过：把 overflow-x 砍成 hidden 后，「可横向滚动」这条断言确实报红\n`)
    } else {
      console.log(`\n❌ 负向自检失败：砍掉横向滚动后仍然判定「可滚动」—— 这条守卫是假的\n`)
      process.exitCode = 3
    }
  } else {
    console.log(`\n首页封面守卫 · ${base}`)
    const m = await evaluate(MEASURE)
    if (m.missing) throw new Error('页面上找不到 .hc-cover / .hc-viewport（封面结构变了？）')

    // [1] 不塌、图有高度
    check(m.viewport.h >= 240, `照片区高 ${m.viewport.h}px < 240 —— 封面塌了`)
    m.slides.forEach((s, i) => {
      check(s.h >= 240, `第 ${i + 1} 张 slide 高 ${s.h}px < 240`)
      check(!!s.img && s.img.h >= 200, `第 ${i + 1} 张图渲染高 ${s.img ? s.img.h : '无'} < 200 或没有 img`)
    })
    // [2] 一次正好一张
    m.slides.forEach((s, i) => {
      check(Math.abs(s.w - m.viewport.w) <= 2, `第 ${i + 1} 张宽 ${s.w}px ≠ 可视宽 ${m.viewport.w}px（会露出半张）`)
    })
    check(m.overflowX === 'auto', `.hc-viewport 的 overflow-x 是 ${m.overflowX}，不是 auto —— iOS 上会完全翻不动`)
    check(m.scrollable, `.hc-viewport 不可横向滚动（scrollWidth ≈ clientWidth）—— 只有一张图，或内容被裁了`)
    check(/snap-type|x mandatory/.test(m.snap) || m.snap.includes('x'), `.hc-viewport 没有 scroll-snap（实际 ${m.snap}）`)
    // [3] 圆点 / 计数
    const n = m.slides.length
    check(n >= 2, `只有 ${n} 张 —— 「3-4 张」的需求没落地`)
    check(m.dotCount === n, `圆点 ${m.dotCount} 个 ≠ 图片 ${n} 张`)
    check(m.dotOn === 0, `初始点亮的不是第 1 颗（实际第 ${m.dotOn + 1} 颗）`)
    check(m.count === `01/${String(n).padStart(2, '0')}`, `初始计数是「${m.count}」，应为 01/${String(n).padStart(2, '0')}`)
    check(m.name.trim().length > 0, '相纸下缘那行名字是空的')

    // [4] 滚动 → 计数/圆点跟着走
    await evaluate(`(() => {
      const vp = document.querySelector('.hc-viewport')
      vp.scrollTo({ left: vp.clientWidth, behavior: 'auto' })
      return true
    })()`)
    await evaluate(`new Promise(r => setTimeout(r, 500))`)
    const m2 = await evaluate(MEASURE)
    check(m2.count === `02/${String(n).padStart(2, '0')}`, `滚到第 2 张后计数是「${m2.count}」，应为 02/${String(n).padStart(2, '0')}`)
    check(m2.dotOn === 1, `滚到第 2 张后点亮的还是第 ${m2.dotOn + 1} 颗（滚动没接线到圆点）`)
    check(m2.name !== m.name, `第 2 张的名字还是「${m2.name}」—— 下缘那行没跟着换`)

    // [5] 首屏几何（红线：开屏自成一屏）
    // ⚠️ 必须在点封面之前量 —— 点完就离开首页了，量不到 .hm-pagehint。
    check(m.hintBottom != null && m.barTop != null && m.hintBottom <= m.barTop,
      `收尾线底边 ${m.hintBottom} 越过了底栏顶边 ${m.barTop}`)

    // [6] 点一下照片 → 进这一杯的商品页
    // ⚠️ 2026-09-24 改的：**原来这里是「前进一张」**。因为封面那 4 杯现在都是真商品，
    //    点一下应该去那一杯（用户原话「主页这个图片点击的话应该是能跳到对应商品页面的」）。
    //    翻页路径只剩 横扫 / 圆点 / 键盘 —— [4] 已经单独盯着滚动了。
    //    这条要验的不只是「跳过去了」：**那一行本身要滚到眼前、而且规格是展开的**，
    //    不然用户点进来还得自己再找一次，等于白跳。
    await evaluate(`document.querySelector('.hc-viewport').click()`)
    await waitFor(`!!document.querySelector('.store-head h1')`, 10000)
    await evaluate(`new Promise(r => setTimeout(r, 1100))`) // 等 smooth 滚动走完
    const shop = await evaluate(`(() => {
      const head = document.querySelector('.store-head h1')
      const row = document.querySelector('.menu-row.is-open')
      const inView = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return r.top < innerHeight && r.bottom > 0
      }
      return {
        店: head ? head.textContent.trim() : null,
        展开的菜: row ? (row.querySelector('h3') || {}).textContent : null,
        展开那行在视口里: inView(row),
        规格组数: row ? row.querySelectorAll('.spec-group').length : 0,
        有加入: row ? !!row.querySelector('.spec-add') : false,
        有立即购买: row ? !!row.querySelector('.spec-buy') : false,
      }
    })()`)
    check(shop.店 === '慢活茶饮铺', `点封面进的店是「${shop.店}」—— 特调都在慢活茶饮铺`)
    check(!!shop.展开的菜, '进了店，但没有任何一行是展开的 —— 点的是哪一杯分不出来')
    check(shop.展开那行在视口里 === true, '那一行展开了但不在视口里 —— scrollIntoView 没落到点上')
    check(shop.规格组数 > 0, '展开的那一行里没有规格组 —— 特调应该能选冰量甜度')
    check(shop.有加入 && shop.有立即购买, '展开面板底部不是「加入 + 立即购买」两颗')

    console.log('')
    console.log(`  封面 ${m.cover.w}×${m.cover.h}  照片区 ${m.viewport.w}×${m.viewport.h}  ${n} 张`)
    m.slides.forEach((s, i) => console.log(`   · 第 ${i + 1} 张 ${s.w}×${s.h}  img ${s.img ? `${s.img.h}px 天然宽 ${s.img.nw}  ${s.img.src}` : '—'}`))
    console.log(`  圆点 ${m.dotCount} 个 · 初始「${m.name.trim()}」${m.count}`)
    console.log(`  滚到第 2 张 → 「${m2.name.trim()}」${m2.count}（圆点跟着走）`)
    console.log(`  收尾线底边 ${m.hintBottom} ≤ 底栏顶边 ${m.barTop}`)
    console.log(`  点封面 → 「${shop.店}」· 展开「${shop.展开的菜}」· 规格 ${shop.规格组数} 组 · 加入/立即购买 ${shop.有加入 && shop.有立即购买 ? '都在' : '缺一个'}`)
    console.log('')
    if (problems.length) {
      console.log(`❌ ${problems.length} 条不对：`)
      for (const p of problems) console.log('   · ' + p)
      console.log('')
      process.exitCode = 1
    } else {
      console.log('✅ 封面一叠实拍：尺寸、滚动、圆点、首屏几何，以及「点一下进那一杯」全部正常\n')
    }
  }
} catch (e) {
  console.error('守卫自身出错：', e.message)
  process.exitCode = 2
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null).catch(() => {})
  socket.close()
  for (const r of pending.values()) clearTimeout(r.timer)
}
