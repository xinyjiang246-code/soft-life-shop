// 逐家店铺走一遍，数清楚「到底有几样东西可以点」，并查每张商品图有没有真的加载出来。
//
// 用法：node tools/verify-shop-menu.mjs [url]
//   默认打线上链接；也可传 http://127.0.0.1:8080/ 验本地。
//
// 为什么要有这个（2026-09-20 加的）：
//   用户说「食物怎么感觉这么少」。查过 git 历史 + data.js + dist 指纹，都证明一样没少 ——
//   但那些都是**文件层面**的证据，回答不了「他打开页面到底看见几样」。
//   所以这个脚本直接从渲染结果数：每家店几行菜单、有没有走 fallback、有没有断图。
//   ⚠️ 别用 data.js 的长度代替它 —— 数据对不代表渲染得出来（build 绿 ≠ 接线对）。
import { writeFile, mkdir } from 'node:fs/promises'

const url = process.argv[2] || 'https://soft-life-shop-18918.app.workbuddy.host/'
// 逐店截图存这儿（拼总览图用）。它在 gitignore 里（预览截图/ 整目录），不进仓库。
const SHOT_DIR = '预览截图/店铺菜单'

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
const jsErrors = []
const httpFails = []
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
      jsErrors.push(d.exception?.description || d.text)
    }
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
      httpFails.push(`${m.params.response.status} ${m.params.response.url}`)
    }
  }
})

function send(method, params = {}, session = sessionId) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 25000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
  })
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

async function waitFor(expression, timeout = 20000) {
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

const settle = () => evaluate('new Promise(r => setTimeout(r, 700))')

// 图片是否真的解出来了（naturalWidth 为 0 = 404 / 解码失败）
const IMG_PROBE = `(() => {
  const bad = [];
  document.querySelectorAll('img').forEach((im) => {
    if (im.complete && im.naturalWidth === 0) bad.push(im.currentSrc || im.src);
  });
  return bad;
})()`

// 等所有图要么 load 要么 error（带 4s 硬上限）
const WAIT_IMAGES = `Promise.race([
  Promise.all(Array.from(document.images).filter((im) => !im.complete).map((im) => new Promise((r) => {
    im.addEventListener('load', r, { once: true });
    im.addEventListener('error', r, { once: true });
  }))),
  new Promise((r) => setTimeout(r, 4000)),
]).then(() => true)`

let pass = 0
let fail = 0
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}${detail ? `  —— ${detail}` : ''}`) }
}

try {
  contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

  console.log(`【0】打开 ${url}`)
  await send('Page.navigate', { url })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await evaluate('document.fonts.ready.then(() => true)')
  await evaluate(WAIT_IMAGES)
  await settle()
  const badHome = await evaluate(IMG_PROBE)
  check('首页没有断图', badHome.length === 0, badHome.join(' '))

  // 首页的店铺行（点它进店）
  // ⚠️ 别写死一个选择器:`.shop-row` 与 `.shop-row-wrap` 是嵌套的两层，
  //    两个都查会把每家店数成两遍（第一次跑就报「12 家」的假警报）。
  //    改成「把候选选择器全查一遍，挑数量最少且≥2 的那个」。
  const pick = await evaluate(`(() => {
    const cands = ['.shop-row', '.shop-row-wrap', '.shop-list > *'];
    const found = cands.map((sel) => {
      const els = Array.from(document.querySelectorAll(sel));
      return { sel, n: els.length,
        // ⚠️ 别取 innerText 的第一行 —— 店铺行第一行是满减标签（「20减8」），
        //    真正的店名在下面。按「以 铺/柜/选物/馆/件/店 结尾」挑一行。
        names: els.map((e) => {
          const lines = (e.innerText || '').split('\\n').map((s) => s.trim()).filter(Boolean);
          return lines.find((s) => /(铺|柜|选物|馆|件|店)$/.test(s)) || lines[0] || '(无名)';
        }) };
    }).filter((c) => c.n >= 2);
    found.sort((a, b) => a.n - b.n);
    return found[0] || null;
  })()`)
  if (!pick) throw new Error('首页没找到店铺行（.shop-row / .shop-row-wrap 都是空的）')
  const shopSel = pick.sel
  const shops = pick.names.map((name, i) => ({ i, name }))
  console.log(`   （用选择器 ${shopSel}，候选数量：${pick.n}）`)
  console.log(`\n【1】首页店铺列表：${shops.length} 家`)
  shops.forEach((s) => console.log(`   ${s.i + 1}. ${s.name}`))
  check('店铺数量是 6', shops.length === 6, `实际 ${shops.length}`)

  console.log('\n【2】逐家进店，数菜单行')
  const rows = []
  let total = 0
  for (const s of shops) {
    await send('Page.navigate', { url })
    await waitFor('document.readyState === "complete" && document.querySelectorAll(' + JSON.stringify(shopSel) + ').length > 0')
    await evaluate('document.fonts.ready.then(() => true)')
    await settle()

    await evaluate(`document.querySelectorAll(${JSON.stringify(shopSel)})[${s.i}].click()`)
    await waitFor('document.querySelector(".menu-list, .menu-empty")')
    await evaluate(WAIT_IMAGES)
    await settle()

    // ⚠️ 断图要「连续两次都断」才算。单次判定会把「img 的 src 刚换好、还没解码」的瞬间
    //    误报成 404 —— 第一次跑这个脚本就假报过茶饮铺 5 张断图，实测那些图全是 200
    //    （而且都是体积最大的几张）。假警报比漏报更贵。
    let bad = await evaluate(IMG_PROBE)
    if (bad.length) {
      await evaluate('new Promise(r => setTimeout(r, 900))')
      const again = await evaluate(IMG_PROBE)
      bad = again.filter((u) => bad.includes(u))
    }

    const info = await evaluate(`(() => {
      const rows = Array.from(document.querySelectorAll('.menu-row'))
      const empty = !!document.querySelector('.menu-empty')
      const tabs = Array.from(document.querySelectorAll('.category-tabs > *')).map(t => t.innerText.trim())
      // 店名从店内页头取 —— 首页那行的 innerText 第一行是满减标签（「40减12」），不是店名
      const head = document.querySelector('.store-head')
      const storeName = head
        ? (head.innerText || '').split('\\n').map((x) => x.trim()).filter(Boolean)[0]
        : ''
      return {
        rows: rows.length,
        storeName,
        names: rows.map(r => (r.querySelector('.menu-en, .menu-desc, strong') || r).innerText.split('\\n')[0]).slice(0, 30),
        empty, tabs,
      }
    })()`)
    info.bad = bad
    total += info.rows
    rows.push({ shop: s.name, ...info })
    const flag = info.bad.length ? `　❌ 断图 ${info.bad.length}` : ''
    console.log(`   ${(info.storeName || s.name).padEnd(10, '　')} 菜单 ${String(info.rows).padStart(2)} 行${info.empty ? '（显示空状态）' : ''}${flag}`)
    if (info.bad.length) console.log('        ', info.bad.join('\n         '))

    // 顺手截一张店内菜单页（拼「全部商品」总览图用）
    await evaluate('window.scrollTo(0, 0)')
    await settle()
    const { data: png } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await mkdir(SHOT_DIR, { recursive: true })
    const shot = `${SHOT_DIR}/${s.i + 1}-${info.storeName || s.name}.png`
    await writeFile(shot, Buffer.from(png, 'base64'))
    info.shot = shot
  }

  console.log(`\n【3】合计 ${total} 行菜单`)
  // 基线（2026-09-20 线上实测）：6 家店 = 5 / 3 / 3 / 3 / 4 / 4 = 22 行（含 1 杯今日特调）。
  // 🔴 2026-09-24 改版：特调从 1 杯变 **4 杯** —— 封面那叠相纸现在全是**能点进去买的真商品**
  //    （见 data.js `toItemFromSpecial` / `onShelf`），茶饮铺 +3 → **合计 25**。
  //    25 = 21 样常驻商品 + 4 杯在架特调。这个数**写死**：少一行都说明真丢了东西
  //    （特调的杯数由 getSpecialRun(4) 决定，恒为 4，不再有「今天没特调」这种情况）。
  check('合计 25 行（21 样商品 + 4 杯特调）', total === 25, `实际 ${total}`)
  check('每家店都至少有 3 行', rows.every((r) => r.rows >= 3),
    rows.filter((r) => r.rows < 3).map((r) => `${r.shop}:${r.rows}`).join('、'))
  check('没有一家店显示「空」', rows.every((r) => !r.empty),
    rows.filter((r) => r.empty).map((r) => r.shop).join('、'))
  const anyBad = rows.flatMap((r) => r.bad)
  check('店内所有商品图都加载出来了', anyBad.length === 0, `${anyBad.length} 张断图`)

  console.log('\n【4】顺手记一笔品类（分类标签）')
  rows.forEach((r) => console.log(`   ${r.shop}: ${r.tabs.length ? r.tabs.join(' / ') : '（无分类）'}`))

  if (jsErrors.length) { console.log('\n⚠️ JS 报错', JSON.stringify(jsErrors.slice(0, 3), null, 1)); fail++ }
  if (httpFails.length) { console.log('\n⚠️ HTTP ≥400', JSON.stringify(httpFails.slice(0, 5), null, 1)); fail++ }

  await writeFile('/tmp/shop-menu-report.json', JSON.stringify({ shops, rows, total }, null, 2))
  console.log(`\n=== 通过 ${pass} 项，失败 ${fail} 项 ===`)
  console.log('明细写到 /tmp/shop-menu-report.json')
  process.exitCode = fail ? 1 : 0
} catch (e) {
  console.error('inspect failed:', e.message)
  process.exitCode = 1
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null).catch(() => {})
  socket.close()
  for (const r of pending.values()) clearTimeout(r.timer)
}
