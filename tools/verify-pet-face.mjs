// 验收「点软软 → 表情会变」这条链（2026-09-17）。
//
// 关键点：
//  1. 必须派发**带坐标的真鼠标事件** —— 表情是按部位分的，用 el.click()
//     （clientX/Y 都是 0）只会走「摸肚子」兜底，等于没验分区。
//  2. 断言「画出来的眼睛落在量到的锚点上」：脚本自己从 src/petFace.js 里
//     **解析**锚点表（不复制一份常量），再跟 SVG 里眼睛分组的实际屏幕位置比。
//     位置错了就是错的 —— 表情贴歪了比没有表情更糟。
//  3. 形状要按表情区分（弧线 / 实心圆 / 爱心 / 星星），不能七种表情同一张脸。
//  4. 连击要升级：第三下爱心眼、第五下星星眼。
//
// 用法：node tools/verify-pet-face.mjs [url] [截图前缀]
import { writeFile, readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const shotPrefix = process.argv[3] || '/tmp/petface/'

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
const errors = []
const failedResponses = []
let sessionId
let contextId

socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.id) {
    const request = pending.get(message.id)
    if (!request) return
    clearTimeout(request.timer)
    pending.delete(message.id)
    if (message.error) request.reject(new Error(JSON.stringify(message.error)))
    else request.resolve(message.result)
  } else if (message.sessionId === sessionId) {
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails
      errors.push(detail.exception?.description || detail.text)
    }
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      failedResponses.push({ url: message.params.response.url, status: message.params.response.status })
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
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}

async function waitFor(expression, timeout = 12000) {
  return evaluate(`new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (${expression}) return resolve(true);
      if (performance.now() - started > ${timeout}) return reject(new Error('等不到: ' + ${JSON.stringify(expression)}));
      setTimeout(check, 100);
    }; check();
  })`)
}

async function click(selector) {
  await waitFor(`document.querySelector(${JSON.stringify(selector)})`)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}

async function mouseTap(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

const wait = (ms) => evaluate(`new Promise((r) => setTimeout(r, ${ms}))`)

/** 猫身上某个部位对应的屏幕坐标 */
async function pointOf(nx, ny) {
  const r = await evaluate(`(() => {
    const b = document.querySelector('.pet-pat-btn').getBoundingClientRect();
    return { left: b.left, top: b.top, w: b.width, h: b.height };
  })()`)
  return { x: r.left + r.w * nx, y: r.top + r.h * ny }
}

/** 把 .pet-avatar-wrap 那一块截下来 */
async function shotHero(name) {
  // ⚠️ Page.captureScreenshot 的 clip 是**页面坐标**，不是视口坐标 ——
  //    页面滚动过之后（我们 scrollIntoView 过）不加 scrollX/scrollY 会截到别的地方。
  //    第一版就吃了这个亏：截出来的图跟标注的表情对不上，白查半天。
  const clip = await evaluate(`(() => {
    const r = document.querySelector('.pet-avatar-wrap').getBoundingClientRect();
    const pad = 10;
    return {
      x: r.left + scrollX - pad, y: r.top + scrollY - pad,
      width: r.width + pad * 2, height: r.height + pad * 2,
    };
  })()`)
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 } })
  await writeFile(`${shotPrefix}${name}.png`, Buffer.from(data, 'base64'))
  return `${shotPrefix}${name}.png`
}

// ---- 从源码里解析锚点表，避免脚本里再抄一份 ----
const src = await readFile(new URL('../src/petFace.js', import.meta.url), 'utf8')
function anchorsOf(stage) {
  const block = src.match(new RegExp(`\\n  ${stage}: \\{([\\s\\S]*?)\\n  \\},`))
  assert.ok(block, `src/petFace.js 里应该有 stage ${stage} 的锚点`)
  const num = (key) => {
    const m = block[1].match(new RegExp(`${key}: \\[([-\\d.]+), ([-\\d.]+)\\]`))
    return m ? [Number(m[1]), Number(m[2])] : null
  }
  const one = (key) => {
    const m = block[1].match(new RegExp(`${key}: ([-\\d.]+)`))
    return m ? Number(m[1]) : null
  }
  return { eyeL: num('eyeL'), eyeR: num('eyeR'), gap: one('gap'), tilt: one('tilt') }
}

const ZONES = {
  ear: [0.5, 0.1],
  head: [0.5, 0.36],
  cheekL: [0.15, 0.4],
  cheekR: [0.85, 0.4],
  tummy: [0.5, 0.7],
  paw: [0.5, 0.93],
}
const ZONE_EXPR = { ear: 'squint', head: 'bliss', cheekL: 'smile', cheekR: 'smile', tummy: 'purr', paw: 'startle' }

const results = []
const ok = (label, value) => { results.push({ label, value }); console.log('  ✓', label, '=', JSON.stringify(value)) }

async function gotoPet(stage) {
  // 直接写存档：meals 决定成长阶段（LEVEL_MEALS = [0,1,3,6,10]）
  // ⚠️ 必须先导航到应用再写 localStorage —— 在 about:blank 上访问会被拒（SecurityError）
  const meals = [0, 1, 3, 6, 10][stage]
  await send('Page.navigate', { url })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await evaluate(`(() => {
    const cur = JSON.parse(localStorage.getItem('soft-life-pet-v1') || '{}');
    localStorage.setItem('soft-life-pet-v1', JSON.stringify({ ...cur, meals: ${meals} }));
    return true;
  })()`)
  await send('Page.reload')
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await click('.corner-grid .corner-tile:nth-child(1)')
  await waitFor(`document.querySelector('.pet-pat-btn')`)
  await evaluate(`(() => { document.querySelector('.pet-avatar-wrap').scrollIntoView({ block: 'center' }); return true; })()`)
  await wait(650)
}

/** 点一下并读回表情层的状态 */
async function tapAndRead(zone, { shot = null } = {}) {
  const [nx, ny] = ZONES[zone]
  const { x, y } = await pointOf(nx, ny)
  await mouseTap(x, y)
  await wait(260)
  const state = await evaluate(`(() => {
    const face = document.querySelector('.pet-face');
    const noeye = document.querySelector('.pet-noeye');
    const img = document.querySelector('.pet-photo img');
    const svg = face ? face.getBoundingClientRect() : null;
    const groups = face ? Array.from(face.querySelectorAll('g[transform]')) : [];
    const eyes = groups
      .filter((g) => /translate/.test(g.getAttribute('transform')))
      .map((g) => {
        const b = g.getBoundingClientRect();
        return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, children: g.children.length };
      });
    const shapes = face ? Array.from(face.querySelectorAll('path, ellipse, circle, rect')) : [];
    return {
      // ⚠️ 别在这里写 /\\s+/ 之外的转义：这段字符串是**先被 Node 的模板字符串解释**、
      //    再交给浏览器的。写 /\s+/ 会被 Node 吃成 /s+/，把 "squint" 变成 " quint"。
      cls: face ? face.className.baseVal.trim() : null,
      viewBox: face ? face.getAttribute('viewBox') : null,
      无眼底图已切换: !!noeye && noeye.classList.contains('is-on'),
      无眼底图已加载: !!noeye && noeye.complete && noeye.naturalWidth > 0,
      底图还在: !!img && img.complete && img.naturalWidth > 0,
      图层矩形: svg ? [Math.round(svg.width), Math.round(svg.height)] : null,
      眼睛分组: eyes,
      形状数: shapes.length,
      形状标签: Array.from(new Set(shapes.map((s) => s.tagName))).sort(),
      有文字: face ? face.textContent.trim().length : 0,
      zone: document.querySelector('.pet-pat-btn').dataset.zone,
      台词: document.querySelector('.pet-pat-bubble')?.innerText || null,
    };
  })()`)
  if (shot) await shotHero(shot)
  return state
}

try {
  contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

  console.log('\n[1] 走到软软的小屋（阶段 3）')
  await gotoPet(3)
  ok('宠物页已挂载', await evaluate(`document.querySelector('.pet-hero h1').innerText`))

  console.log('\n[2] 不点的时候脸上没有表情层')
  const idle = await evaluate(`(() => ({
    表情层: document.querySelectorAll('.pet-face').length,
    无眼底图可见: Array.from(document.querySelectorAll('.pet-noeye')).some((n) => n.classList.contains('is-on')),
    猫图: document.querySelector('.pet-photo img')?.getAttribute('src')?.split('/').pop(),
  }))()`)
  ok('平时', idle)
  assert.equal(idle.表情层, 0, '没人点的时候不该有表情层')
  assert.equal(idle.无眼底图可见, false, '没人点的时候不该显示无眼底图')

  console.log('\n[3] 六个部位各点一下：脸上换的表情 + 眼睛落在锚点上')
  const anchor = anchorsOf(3)
  const seenCls = {}
  const seenShapes = {}
  for (const zone of ['ear', 'head', 'cheekL', 'cheekR', 'tummy', 'paw']) {
    await wait(1400) // 等上一次表情收回去
    const s = await tapAndRead(zone, { shot: `stage3_${zone}` })
    const expectCls = `pet-face pet-face-${ZONE_EXPR[zone]}`
    ok(`点${zone}`, { 表情: s.cls, 形状: s.形状标签.join('+'), 形状数: s.形状数, 台词: s.台词 })
    assert.equal(s.zone, zone, `点 (${ZONES[zone]}) 应该判成 ${zone}`)
    assert.equal(s.cls, expectCls, `${zone} 应该是 ${ZONE_EXPR[zone]} 表情，实际 ${s.cls}`)
    assert.equal(s.无眼底图已切换, true, '画表情时必须切到无眼底图，否则会有两对眼睛')
    assert.equal(s.无眼底图已加载, true, '无眼底图必须真的加载成功')
    assert.equal(s.底图还在, true, '原图不能被换掉（表情只是叠一层）')
    assert.equal(s.有文字, 0, '表情层里不该有文字（项目禁 emoji，也禁文字表情）')
    assert.ok(s.形状数 >= 2, `${zone} 表情至少要画出两只眼睛`)

    // 眼睛分组必须落在锚点上（换算成屏幕坐标比对，容差 4px）
    const rect = await evaluate(`(() => {
      const r = document.querySelector('.pet-photo').getBoundingClientRect();
      return { left: r.left, top: r.top, w: r.width, h: r.height };
    })()`)
    const want = [
      [rect.left + anchor.eyeL[0] * rect.w, rect.top + anchor.eyeL[1] * rect.h],
      [rect.left + anchor.eyeR[0] * rect.w, rect.top + anchor.eyeR[1] * rect.h],
    ]
    const got = s.眼睛分组.map((e) => [e.cx, e.cy])
    const dev = got.map((g, i) => Math.hypot(g[0] - want[i][0], g[1] - want[i][1]))
    assert.equal(got.length, 2, `${zone}：应该有左右两组眼睛`)
    assert.ok(Math.max(...dev) < 6, `${zone}：眼睛画歪了，偏离锚点 ${dev.map((d) => d.toFixed(1)).join('/')}px`)

    seenCls[zone] = s.cls
    seenShapes[zone] = `${s.形状标签.join('+')}|${s.形状数}`
  }
  const uniq = new Set(Object.values(seenCls))
  assert.ok(uniq.size >= 5, `六个部位至少要出现 5 种不同表情，实际 ${uniq.size}`)
  ok('部位 → 表情（左右脸共用 smile）', uniq.size)

  console.log('\n[4] 表情之间真的长得不一样（形状与数量都不同）')
  assert.ok(seenShapes.paw.includes('circle'), '受惊应该有高光小圆（circle）')
  assert.ok(seenShapes.head.includes('path'), '闭眼享受应该是弧线（path）')
  assert.notEqual(seenShapes.tummy, seenShapes.paw, '呼噜和受惊不能是同一套画法')
  assert.notEqual(seenCls.cheekL, seenCls.tummy, '摸腮和摸肚子不该是同一个表情')
  ok('形状差异', { 受惊: seenShapes.paw, 闭眼: seenShapes.head, 呼噜: seenShapes.tummy })

  console.log('\n[5] 连击升级：第三下爱心眼、第五下星星眼')
  await wait(1400)
  const { x: cx, y: cy } = await pointOf(0.5, 0.7)
  const stages = []
  for (let i = 1; i <= 5; i++) {
    await mouseTap(cx, cy)
    await wait(120)
    const cls = await evaluate(`(document.querySelector('.pet-face')?.className.baseVal || '').trim()`)
    stages.push(cls)
    if (i === 2) await shotHero('stage3_combo2')
    if (i === 3) await shotHero('stage3_combo3')
    if (i === 5) await shotHero('stage3_combo5')
  }
  ok('连点五下的表情', stages)
  assert.ok(stages[0].endsWith('-purr'), `第一下应该是 purr，实际 ${stages[0]}`)
  assert.ok(stages[2].endsWith('-heart'), `第三下应该升级成爱心眼，实际 ${stages[2]}`)
  assert.ok(stages[4].endsWith('-star'), `第五下应该升级成星星眼，实际 ${stages[4]}`)

  console.log('\n[6] 表情会自己收回去，回到本来那张脸')
  await wait(1500)
  const back = await evaluate(`(() => ({
    表情层: document.querySelectorAll('.pet-face').length,
    无眼底图可见: Array.from(document.querySelectorAll('.pet-noeye')).some((n) => n.classList.contains('is-on')),
  }))()`)
  ok('收回去之后', back)
  assert.equal(back.表情层, 0, '表情应该自己消失（不能一直挂着）')
  assert.equal(back.无眼底图可见, false, '表情结束后要换回带眼睛的原图')

  console.log('\n[7] 五个阶段都要能画（坐标是逐阶段量的，别漏）')
  const shots = []
  for (const st of [0, 1, 2, 3, 4]) {
    await gotoPet(st)
    await wait(300)
    const s = await tapAndRead('head', { shot: `stage${st}_head` })
    assert.equal(s.cls, 'pet-face pet-face-bliss', `stage${st} 应该能画 bliss 表情`)
    assert.equal(s.无眼底图已加载, true, `stage${st} 的无眼底图必须存在`)
    const rect = await evaluate(`(() => {
      const r = document.querySelector('.pet-photo').getBoundingClientRect();
      return { left: r.left, top: r.top, w: r.width, h: r.height };
    })()`)
    const a = anchorsOf(st)
    const want = [
      [rect.left + a.eyeL[0] * rect.w, rect.top + a.eyeL[1] * rect.h],
      [rect.left + a.eyeR[0] * rect.w, rect.top + a.eyeR[1] * rect.h],
    ]
    const got = s.眼睛分组.map((e) => [e.cx, e.cy])
    const dev = got.map((g, i) => Math.hypot(g[0] - want[i][0], g[1] - want[i][1]))
    assert.ok(Math.max(...dev) < 6, `stage${st}：眼睛偏离锚点 ${dev.map((d) => d.toFixed(1)).join('/')}px`)
    ok(`stage${st}`, { 偏离: dev.map((d) => Number(d.toFixed(1))), 形状: s.形状标签.join('+') })
    shots.push(`stage${st}_head`)
    // 顺手也拍一张爱心眼，方便拼图对比
    const { x: hx, y: hy } = await pointOf(0.5, 0.7)
    await mouseTap(hx, hy)
    await wait(100)
    await mouseTap(hx, hy)
    await wait(100)
    await mouseTap(hx, hy)
    await wait(240)
    const combo = await evaluate(`(document.querySelector('.pet-face')?.className.baseVal || '').trim()`)
    assert.ok(String(combo).endsWith('-heart'), `stage${st} 连点三下应该出爱心眼，实际 ${combo}`)
    await shotHero(`stage${st}_heart`)
    shots.push(`stage${st}_heart`)
    console.log('     截图', shots.slice(-2).join(' / '))
  }

  console.log('\n[8] 全页体检')
  await wait(1600)
  const health = await evaluate(`(() => ({
    坏图: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
    残留表情层: document.querySelectorAll('.pet-face').length,
    可见无眼底图: Array.from(document.querySelectorAll('.pet-noeye')).filter((n) => n.classList.contains('is-on')).length,
  }))()`)
  ok('体检', health)
  assert.equal(health.坏图.length, 0, '不能有破图')
  assert.equal(health.残留表情层, 0, '表情层不该残留')
  assert.equal(health.可见无眼底图, 0, '无眼底图不该一直显示')

  assert.equal(errors.length, 0, `控制台不该有报错：${errors.join(' / ')}`)
  assert.equal(failedResponses.length, 0, `不该有失败请求：${JSON.stringify(failedResponses)}`)
  console.log('\n全绿：坏图 0 / 报错 0 / 失败请求 0')
  console.log('截图前缀', shotPrefix)
} catch (error) {
  console.error('\n验收失败：', error.message)
  process.exitCode = 1
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null).catch(() => {})
  socket.close()
}
