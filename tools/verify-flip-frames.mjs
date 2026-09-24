#!/usr/bin/env node
/**
 * verify-flip-frames.mjs —— 翻面卡不许「塌成一条」
 *
 * 为什么有这个守卫（2026-09-21 第二次踩）：
 *   `.flip-frame` 是 `width:100%; height:100%`，**自己没有任何内在高度**，
 *   里面 `.flip-face` 又是 `position:absolute; inset:0`（不贡献高度）。
 *   所以父盒子一旦没给高度，整块就塌成「只剩 border 的一条」——
 *   照片看不见、印章压到别的字上，而 build 永远绿、控制台一句报错都没有。
 *   已经踩过两次：① 明信片邮票 `.pc-stamp`（grid 父容器不给高度 → 0 高）
 *   ② 首页报头 `.hm-polaroid`（重构时只搬了类名、没搬旧 .hero-flip 的尺寸 → 104×12）。
 *
 * 判据（刻意不依赖图片是否加载完，避免 lazy 假警报）：
 *   ① 凡是**可见**的 `.flip-frame`，渲染高度必须 ≥ 36px；
 *   ② 帧里如果已经塞了 <img>，这个 img 的**渲染高度**必须 ≥ 28px
 *      （只量 rect，不量 naturalWidth —— 后者在视口外/懒加载时必然是 0）。
 *
 * 用法：
 *   node tools/verify-flip-frames.mjs [baseUrl]        # 默认 http://127.0.0.1:8080/
 *   node tools/verify-flip-frames.mjs --prove [baseUrl]# 负向自检：压扁首页第一个翻面卡，必须报红
 *
 * 前置：预览服务在跑（cwd=dist/）+ 无头 Chrome 打开 9222 调试端口。
 */
const args = process.argv.slice(2)
const prove = args.includes('--prove')
const base = (args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:8080/').replace(/\/?$/, '/')

const MIN_FRAME_H = 36
const MIN_IMG_H = 28

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
      if (performance.now() - t0 > ${timeout}) return reject(new Error('timed out waiting: ${expression.replace(/'/g, "")}'));
      setTimeout(check, 70);
    };
    check();
  })`)
}

/** 每个「页」= 重载 + 从首页走一遍（不用回退，确定性最好） */
const SCREENS = [
  { id: '首页', steps: [] },
  { id: '店铺详情', steps: [{ click: 'button.shop-row', wait: '.menu-row' }] },
  { id: '购物袋', steps: [{ click: '.special-add', wait: null }, { click: '[aria-label^="购物袋"]', wait: '.cart-row' }] },
  { id: '世界菜单', steps: [{ click: '.world-entry', wait: '.world-card' }] },
  { id: '惜食柜', steps: [{ click: '.rescue-strip', wait: '.shelf-row' }] },
]

const COLLECT = `(() => {
  const out = []
  document.querySelectorAll('.flip-frame').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return               // 彻底不可见（display:none 等），不算违规
    const host = el.closest('[class]')
    const img = el.querySelector('img')
    const ir = img ? img.getBoundingClientRect() : null
    out.push({
      host: host ? host.className.split(' ').slice(0, 2).join('.') : '?',
      w: Math.round(r.width), h: Math.round(r.height),
      img: img ? { src: (img.currentSrc || img.src).split('/').pop().slice(0, 34),
                   w: Math.round(ir.width), h: Math.round(ir.height),
                   complete: img.complete, nw: img.naturalWidth } : null,
    })
  })
  return out
})()`

const violations = []
const report = []

async function runScreen(screen) {
  await send('Page.navigate', { url: base + '?t=' + Date.now() })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  if (await evaluate(`!!document.querySelector('.ob-skip')`)) {
    await evaluate(`document.querySelector('.ob-skip').click()`)
    await evaluate(`new Promise(r => setTimeout(r, 200))`)
  }
  for (const step of screen.steps) {
    await waitFor(`document.querySelector(${JSON.stringify(step.click)})`, 8000)
    await evaluate(`document.querySelector(${JSON.stringify(step.click)}).click()`)
    if (step.wait) await waitFor(`document.querySelector(${JSON.stringify(step.wait)})`, 8000)
    await evaluate(`new Promise(r => setTimeout(r, 260))`)
  }
  await evaluate(`new Promise(r => setTimeout(r, 700))`)

  const frames = await evaluate(COLLECT)
  if (!frames.length) {
    report.push(`  ·  ${screen.id}：没有翻面卡（这一页确实没有就正常；若本来该有，说明上面的入口没点到）`)
    return
  }
  let bad = 0
  for (const f of frames) {
    const problems = []
    if (f.h < MIN_FRAME_H) problems.push(`帧高 ${f.h}px < ${MIN_FRAME_H}`)
    if (f.img && f.img.h < MIN_IMG_H) problems.push(`图高 ${f.img.h}px < ${MIN_IMG_H}`)
    if (problems.length) {
      bad += 1
      violations.push(`${screen.id} · ${f.host} (${f.w}×${f.h}) — ${problems.join('；')}`)
      report.push(`  ❌ ${screen.id} · ${f.host}  ${f.w}×${f.h}  img ${f.img ? f.img.w + '×' + f.img.h : '—'}  → ${problems.join('；')}`)
    }
  }
  report.push(`  ${bad ? '❌' : '✅'} ${screen.id}：${frames.length} 个翻面卡${bad ? `，${bad} 个塌了` : '，尺寸都正常'}`)
}

try {
  contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })   // 坑点：不关缓存会验到旧产物
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

  console.log(`\n翻面卡尺寸守卫 · ${base}${prove ? '  [--prove 负向自检]' : ''}`)

  if (prove) {
    // 负向自检：把首页**第一个翻面卡**压回「塌成一条」的样子 —— 守卫必须报红。
    // ⚠️ 2026-09-21 改：以前这里写死 `.hm-polaroid .flip-frame`（首页拍立得），
    //    但封面换成了 HomeCover（可横扫的实拍相纸，不再是 .flip-frame），
    //    再写死那个选择器 = 压不到任何东西 → 自检会假报「守卫是假的」。
    //    现在改成「页面上第一个 .flip-frame」内联压扁，跟具体页面结构解耦。
    await send('Page.navigate', { url: base })
    await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
    if (await evaluate(`!!document.querySelector('.ob-skip')`)) await evaluate(`document.querySelector('.ob-skip').click()`)
    const collapsed = await evaluate(`(() => {
      const el = document.querySelector('.flip-frame')
      if (!el) return null
      el.style.height = '12px'
      el.style.padding = '0'
      return el.className
    })()`)
    if (!collapsed) {
      console.log('\n❌ 负向自检无法执行：首页一个 .flip-frame 都没有 —— 要么页面结构变了，要么入口没点到\n')
      process.exitCode = 3
    } else {
      await evaluate(`new Promise(r => setTimeout(r, 500))`)
      const frames = await evaluate(COLLECT)
      const hit = frames.filter((f) => f.h < MIN_FRAME_H)
      if (hit.length >= 1) {
        console.log(`\n✅ 负向自检通过：把首页第一个翻面卡（${collapsed}）压成 12px 后，守卫抓到 ${hit.length} 个塌掉的帧`)
        console.log(`   （说明这条断言真的会报红，不是永远绿的摆设）\n`)
      } else {
        console.log(`\n❌ 负向自检失败：压扁了却一个都没抓到 —— 这条守卫是假的，别信它的绿灯\n`)
        process.exitCode = 3
      }
    }
  } else {
    for (const s of SCREENS) await runScreen(s)
    console.log('')
    for (const line of report) console.log(line)
    console.log('')
    if (violations.length) {
      console.log(`❌ ${violations.length} 个翻面卡塌了：`)
      for (const v of violations) console.log('   · ' + v)
      console.log('\n   正解：给父盒子一个确定高度（`.xxx .flip-frame { height: Npx; padding: … ; background: #FBF8F1 }`）——')
      console.log('   参考 `.hero-flip .flip-frame` / `.pc-stamp .flip-tag` 那两处已经写对的写法。\n')
      process.exitCode = 1
    } else {
      console.log('✅ 全部翻面卡尺寸正常\n')
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
