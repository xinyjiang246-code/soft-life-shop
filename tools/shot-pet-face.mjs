// 给「点软软 → 表情会变」出交付图（2026-09-17）。
//
// 跟 verify-pet-face.mjs 的分工：那个负责**断言**，这个负责**出图**。
// 断言脚本里的截图是为了出事时能对着看，命名和取景都是为了排查；
// 这里的取景是为了给人看 —— 一张一张按「表情」排好，并写下它是怎么被触发的。
//
// 三条纪律：
//  1. 必须派发带坐标的真鼠标事件（el.click() 的 clientX/Y 是 0，只会走兜底）。
//  2. 截图前要**等有限动画播完**（petFaceIn .22s / pfMarkIn .36s），但又不能等过
//     FACE_HOLD（1150ms）—— 表情会自己收回去。所以固定停 500ms，落在窗口内。
//  3. 别用 getAnimations().map(a => a.finished) 等动画 —— 待机呼吸是
//     iterations: Infinity，finished 永不 resolve，会挂到超时。固定 sleep 最稳。
//
// 用法：node tools/shot-pet-face.mjs [url] [输出目录]
import { writeFile, mkdir } from 'node:fs/promises'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const outDir = (process.argv[3] || '/tmp/petface-shots/').replace(/\/?$/, '/')

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
let sessionId

socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (!message.id) return
  const request = pending.get(message.id)
  if (!request) return
  clearTimeout(request.timer)
  pending.delete(message.id)
  if (message.error) request.reject(new Error(JSON.stringify(message.error)))
  else request.resolve(message.result)
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

async function pointOf(nx, ny) {
  const r = await evaluate(`(() => {
    const b = document.querySelector('.pet-pat-btn').getBoundingClientRect();
    return { left: b.left, top: b.top, w: b.width, h: b.height };
  })()`)
  return { x: r.left + r.w * nx, y: r.top + r.h * ny }
}

/** 截 .pet-avatar-wrap 那一块 —— ⚠️ clip 用的是**页面坐标**，必须加 scrollX/scrollY */
async function shot(name) {
  const clip = await evaluate(`(() => {
    const r = document.querySelector('.pet-avatar-wrap').getBoundingClientRect();
    const pad = 10;
    return {
      x: r.left + scrollX - pad, y: r.top + scrollY - pad,
      width: r.width + pad * 2, height: r.height + pad * 2,
    };
  })()`)
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 } })
  await writeFile(`${outDir}${name}.png`, Buffer.from(data, 'base64'))
}

async function faceState() {
  return evaluate(`(() => {
    const face = document.querySelector('.pet-face');
    const btn = document.querySelector('.pet-pat-btn');
    return {
      expr: face ? face.className.baseVal.trim().replace('pet-face pet-face-', '') : null,
      zone: btn ? btn.dataset.zone : null,
      line: document.querySelector('.pet-pat-bubble')?.innerText || null,
    };
  })()`)
}

// 部位 → 归一化落点（跟 verify-pet-face.mjs 保持一致）
const ZONES = {
  ear: [0.5, 0.1],
  head: [0.5, 0.36],
  cheek: [0.15, 0.4],
  tummy: [0.5, 0.7],
  paw: [0.5, 0.93],
}
// 交付图里的中文名与顺序（按「摸上去的路径」排：耳朵→头→脸→肚子→爪子）
const ORDER = [
  ['ear', '摸耳朵', 'squint', '眯起眼睛'],
  ['head', '摸头顶', 'bliss', '闭眼享受'],
  ['cheek', '摸脸颊', 'smile', '闭眼笑 + 脸红'],
  ['tummy', '摸肚子', 'purr', '弯月眼 + 呼噜'],
  ['paw', '摸爪子', 'startle', '瞪大眼睛'],
]

const manifest = []
let targetId = null

try {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true }, null)
  ;({ targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId }, null))
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Page.enable')
  await send('Runtime.enable')

  await mkdir(outDir, { recursive: true })

  // ---- 走到软软的小屋（阶段 3，青年猫；这一档脸部锚点最清楚） ----
  // ⚠️ 必须先导航到应用再写 localStorage，在 about:blank 上访问会被拒（SecurityError）。
  // meals 决定成长阶段：LEVEL_MEALS = [0, 1, 3, 6, 10]
  await send('Page.navigate', { url })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await evaluate(`(() => {
    const cur = JSON.parse(localStorage.getItem('soft-life-pet-v1') || '{}');
    localStorage.setItem('soft-life-pet-v1', JSON.stringify({ ...cur, meals: 6 }));
    return true;
  })()`)
  await send('Page.reload')
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await click('.corner-grid .corner-tile:nth-child(1)')
  await waitFor(`document.querySelector('.pet-pat-btn')`)
  await evaluate(`(() => { document.querySelector('.pet-avatar-wrap').scrollIntoView({ block: 'center' }); return true; })()`)
  await wait(650)

  // ---- 0. 平常的脸：什么都没点 ----
  await shot('00_idle')
  manifest.push({ file: '00_idle', title: '平常', expr: 'idle', how: '没有点的时候', line: null })
  console.log('  ✓ 00_idle', JSON.stringify(await faceState()))

  // ---- 1–5. 五个部位 ----
  let i = 1
  for (const [zone, zh, expr, feel] of ORDER) {
    const [nx, ny] = ZONES[zone]
    const { x, y } = await pointOf(nx, ny)
    await mouseTap(x, y)
    await wait(500) // 落在 260ms（动画播完）～1150ms（表情收回）之间
    const state = await faceState()
    const name = `${String(i).padStart(2, '0')}_${expr}`
    await shot(name)
    manifest.push({ file: name, title: zh, expr, how: `点${zh.replace('摸', '')}`, line: state.line, feel })
    console.log(`  ✓ ${name}`, JSON.stringify(state))
    // 让连击热度和表情都归零（HEAT_WINDOW = 1500）
    await wait(1700)
    i += 1
  }

  // ---- 6–7. 连击：第三下爱心眼、第五下星星眼 ----
  for (const [taps, expr] of [[3, 'heart'], [5, 'star']]) {
    const { x, y } = await pointOf(0.5, 0.36)
    for (let t = 0; t < taps; t += 1) {
      await mouseTap(x, y)
      await wait(600) // 每下间隔 < HEAT_WINDOW，热度才累得起来
    }
    const state = await faceState()
    const name = `0${i}_${expr}`
    await shot(name)
    manifest.push({
      file: name, title: `连点 ${taps} 下`, expr,
      how: `同一个地方连点 ${taps} 下`, line: state.line,
      feel: expr === 'heart' ? '眼睛变爱心' : '眼睛变星星',
    })
    console.log(`  ✓ ${name}`, JSON.stringify(state))
    await wait(1700)
    i += 1
  }

  await writeFile(`${outDir}manifest.json`, JSON.stringify(manifest, null, 2))
  console.log('\n出图完成：', outDir)
} finally {
  if (targetId) { try { await send('Target.closeTarget', { targetId }) } catch { /* 收尾失败无所谓 */ } }
  socket.close()
}
