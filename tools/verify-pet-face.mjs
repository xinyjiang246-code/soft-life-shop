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
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const shotPrefix = process.argv[3] || '/tmp/petface/'
// 自己建目录：以前是「刚好」目录已存在才没炸，换个前缀就 ENOENT
await mkdir(shotPrefix, { recursive: true })

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
  // ⚠️ 拍之前先把「指尖小图」藏掉。粒子和表情的存活窗口是重叠的
  //    （粒子 1400ms、表情 1150ms），等粒子自己飘走时表情已经收回去了 ——
  //    所以永远等不到干净的一帧，图里一直是几块大贴纸糊在脸上。
  //    只影响截图：所有断言读的都是 DOM 状态，不看像素。
  await hidePopLayer(true)
  try {
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 } })
    await writeFile(`${shotPrefix}${name}.png`, Buffer.from(data, 'base64'))
  } finally {
    await hidePopLayer(false)
  }
  return `${shotPrefix}${name}.png`
}

async function hidePopLayer(hide) {
  await evaluate(`(() => {
    document.querySelectorAll('.pat-pop-layer').forEach((n) => {
      if (${hide}) { n.style.visibility = 'hidden'; }
      else { n.style.visibility = ''; }
    });
    return true;
  })()`)
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
  return { eyeL: num('eyeL'), eyeR: num('eyeR'), nose: num('nose'), eyeW: one('eyeW'), eyeH: one('eyeH'), gap: one('gap'), tilt: one('tilt') }
}

// ---- 嘴形也**从 PetFace.jsx 里解析**，不在脚本里抄第二份映射 ----
// （抄一份就会出现「组件改了嘴、验收还在按老一套断言」的假绿）
const faceSrc = await readFile(new URL('../src/components/PetFace.jsx', import.meta.url), 'utf8')
function mouthKindOf(expr) {
  const block = faceSrc.match(new RegExp(`\\n  ${expr}: \\{([^}]*)\\}`))
  assert.ok(block, `PetFace.jsx 的 EXPRESSIONS 里应该有 ${expr}`)
  const m = block[1].match(/mouth: '([a-z]+)'/)
  return m ? m[1] : null
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
  // ⚠️ 2026-09-24：必须写**新键** `soft-life-pets-v1`（`{cat, dog, active}`）。
  //    两只伙伴改版后老键 `soft-life-pet-v1` 只当迁移源、平时不再被读 ——
  //    往它写 meals 等于没写，于是 5 个阶段渲染的是同一张图，却各自拿本阶段的锚点去比，
  //    报出来是「stage0 眼睛偏离锚点 14px」这种**看着像产品坏了**的假红。
  //    （当时的实锤：当前图是 `a-cream-stage3-t-*.webp`，而 stage3 的锚点代进去分毫不差。）
  await evaluate(`(() => {
    const cur = JSON.parse(localStorage.getItem('soft-life-pets-v1') || 'null') || {};
    localStorage.setItem('soft-life-pets-v1', JSON.stringify({
      cat: { ...(cur.cat || {}), meals: ${meals} },
      dog: cur.dog || {},
      active: 'cat',
    }));
    return true;
  })()`)
  await send('Page.reload')
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  // ⚠️ 首页磁贴区（.corner-grid）已随 2026-09-21 的 IA 重排删掉 —— 改走
  //    「邻居猫 → 去小屋看看」这条入口（与 tools/verify-color-scheme.mjs / verify-pet-pat.mjs 一致）。
  await evaluate(`(() => { const e = document.querySelector('.pet-visit-btn'); if (e) { e.scrollIntoView({ block: 'center', behavior: 'instant' }); e.click(); } return true })()`)
  await wait(420)
  await evaluate(`(() => { const e = Array.from(document.querySelectorAll('.pet-visit-bubble [role="button"]')).find((x) => /小屋/.test(x.textContent)); if (e) e.click(); return true })()`)
  await waitFor(`document.querySelector('.pet-pat-btn')`)
  await evaluate(`(() => { document.querySelector('.pet-avatar-wrap').scrollIntoView({ block: 'center' }); return true; })()`)
  await wait(650)
  // 自检：存档真的生效了吗？—— 渲染出来的必须是**这一阶段**的图。
  // 没有这一步，上面那个「写错键」的坑会以「锚点偏了 / 眼睛画歪了」的面目出现，很难往回查。
  const shown = await evaluate(`new Promise((resolve) => {
    const t0 = performance.now();
    const check = () => {
      const im = document.querySelector('.pet-photo img');
      const src = im ? (im.currentSrc || im.src) : '';
      if (src.includes('stage${stage}-')) return resolve(src.split('/').pop());
      if (performance.now() - t0 > 6000) return resolve(null);
      setTimeout(check, 60);
    };
    check();
  })`)
  assert.ok(shown, `阶段 ${stage}：宠物页渲染的不是 stage${stage} 的图 —— 存档没写进去（要写 soft-life-pets-v1，老键 soft-life-pet-v1 已废弃）`)
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
    // 眼睛用**明确的类名**找，不靠「带 transform 的 <g>」猜 ——
    // 2026-09-17 加嘴的时候就是这么炸的：嘴的外层 <g> 也带 translate，
    // 被当成第三只眼睛，于是去比对不存在的锚点，报「Cannot read properties of undefined」。
    // 看着像产品坏了，其实是探针太宽松（同类坑见 #48「文本包含匹配」）。
    const eyes = face ? Array.from(face.querySelectorAll('.pf-eye')).map((g) => {
      const b = g.getBoundingClientRect();
      return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, children: g.children.length };
    }) : [];
    const shapes = face ? Array.from(face.querySelectorAll('path, ellipse, circle, rect')) : [];
    const mouth = face ? face.querySelector('.pf-mouth') : null;
    const mb = mouth ? mouth.getBoundingClientRect() : null;
    // 嘴的**几何尺寸用 getBBox()** —— 它返回的是 SVG 用户坐标系（viewBox 单位），
    // 跟宠物显示多大无关。用 getBoundingClientRect() 得到的是屏幕像素，而宠物页上
    // 软软只有 150px 宽 → 眼睛才 7px、嘴才 2px 高，拿屏幕像素设阈值等于在量放大倍数。
    const mbb = mouth && mouth.getBBox ? mouth.getBBox() : null;
    // 嘴里的形状签名：只看几何，不看类名 —— 类名对了但画的是同一张嘴也得算数
    const mShapes = mouth ? Array.from(mouth.querySelectorAll('path, ellipse, circle')) : [];
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
      嘴: mb
        ? {
            cls: mouth.className.baseVal.trim(),
            子元素: mShapes.length,
            签名: mShapes
              // ⚠️ 这里**不能用反引号模板**：整段代码本身就是一个模板字符串，
              //    嵌套反引号会把它提前闭合 → 报 "missing ) after argument list"。
              //    跟下面那条 \s 的坑是一家人：注入进去的代码里，转义和引号都得少一层。
              .map((s) => s.tagName + ':' + (s.getAttribute('d') || '(' + s.getAttribute('rx') + 'x' + s.getAttribute('ry') + ')'))
              .join('|'),
            box: [mb.left + mb.width / 2, mb.top + mb.height / 2],
            // viewBox 单位（跟显示尺寸无关）—— 判断「够不够大」要用这个
            w: mbb ? Math.round(mbb.width) : 0,
            h: mbb ? Math.round(mbb.height) : 0,
            偏心: mbb ? Math.round(mbb.x + mbb.width / 2) : 0,   // 相对嘴心的横向偏移，应该≈0
            宽: Math.round(mb.width),
            高: Math.round(mb.height),
          }
        : null,
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
  const seenMouths = {}
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

    // ---- 嘴：原图根本没有嘴，七种表情共用一张下半脸是最容易漏掉的那一半 ----
    assert.ok(s.嘴, `${zone}：表情层上应该有嘴（原图没有嘴，全靠我们画）`)
    assert.equal(s.嘴.cls, `pf-mouth pf-mouth-${mouthKindOf(ZONE_EXPR[zone])}`,
      `${zone} 的嘴形应该跟 PetFace.jsx 里声明的一致，实际 ${s.嘴.cls}`)
    assert.ok(s.嘴.子元素 >= 1, `${zone}：嘴不能是空的`)
    // 尺寸用 viewBox 单位跟眼睛比（跟显示尺寸无关）：嘴至少要跟眼睛一个量级，
    // 不然在 150px 的宠物身上等于没有。
    // 门槛放到 0.85 个眼半径是因为「惊」的圆嘴本来就该小 —— 但小也是有限度的。
    const eyeRx = (anchor.eyeW * 720) / 2
    const eyeRy = (anchor.eyeH * 812) / 2
    assert.ok(s.嘴.w >= eyeRx * 0.85, `${zone}：嘴太窄了（${s.嘴.w} vs 眼半径 ${eyeRx.toFixed(0)}，viewBox 单位）`)
    assert.ok(s.嘴.h >= eyeRy * 0.25, `${zone}：嘴太扁了（${s.嘴.h} vs 眼半径 ${eyeRy.toFixed(0)}，viewBox 单位）`)
    // 嘴必须**以鼻子为轴左右对称**。ω 嘴第一版的第二段贝塞尔只走了 w/1.5，
    // 整条路径止于 +0.33w → 嘴整体偏左 1/3 个宽度（小尺寸下就是「嘴歪了」）。
    assert.ok(Math.abs(s.嘴.偏心) <= eyeRx * 0.3, `${zone}：嘴没对中，偏离嘴心 ${s.嘴.偏心}（viewBox 单位）`)

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
    // 先断言数量再算偏差：不然多抓到一个元素就会变成 TypeError，
    // 报「Cannot read properties of undefined」—— 看不出是哪儿的问题
    assert.equal(got.length, want.length, `${zone}：眼睛分组数量不对，抓到 ${got.length} 组（应为 ${want.length}）`)
    const dev = got.map((g, i) => Math.hypot(g[0] - want[i][0], g[1] - want[i][1]))
    assert.equal(got.length, 2, `${zone}：应该有左右两组眼睛`)
    assert.ok(Math.max(...dev) < 6, `${zone}：眼睛画歪了，偏离锚点 ${dev.map((d) => d.toFixed(1)).join('/')}px`)

    // 嘴必须在**鼻子正下方**：横向对齐鼻尖、纵向落在鼻子以下、又不能掉到下巴上。
    // 位置是从鼻子推出来的（见 PetFace.jsx），推错了就会糊在鼻子上或飘到胸口。
    const noseY = rect.top + anchor.nose[1] * rect.h
    const noseX = rect.left + anchor.nose[0] * rect.w
    const ry = (anchor.eyeH * rect.h) / 2      // 眼睛半高（换算到容器像素）
    const dx = Math.abs(s.嘴.box[0] - noseX)
    const dy = s.嘴.box[1] - noseY
    assert.ok(dx < 8, `${zone}：嘴没对在鼻子下方（横向偏了 ${dx.toFixed(1)}px）`)
    assert.ok(dy > ry * 0.4 && dy < ry * 2.6, `${zone}：嘴的纵向位置不对（离鼻子 ${dy.toFixed(1)}px，瞳高的一半是 ${ry.toFixed(1)}px）`)

    seenCls[zone] = s.cls
    seenShapes[zone] = `${s.形状标签.join('+')}|${s.形状数}`
    seenMouths[zone] = s.嘴.签名
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

  console.log('\n[4b] 嘴不是摆设：七种表情的嘴真的不一样，而且位置对')
  const uniqMouths = new Set(Object.values(seenMouths))
  ok('每个部位的嘴', Object.fromEntries(Object.entries(seenMouths).map(([k, v]) => [k, v.split('|')[0]])))
  // 六个部位里左/右脸共用 smile，所以独立嘴形至少 5 种；
  // 若只剩 1 种就是「所有表情共用一张嘴」的退化（那正是补这一刀之前的样子）
  assert.ok(uniqMouths.size >= 5, `六种部位至少要有 5 种不同的嘴，实际 ${uniqMouths.size} 种`)
  assert.notEqual(seenMouths.tummy, seenMouths.paw, '呼噜的 ω 嘴和受惊的圆嘴不能同形')
  assert.notEqual(seenMouths.head, seenMouths.tummy, '闭眼享受和呼噜的嘴不能同形')
  ok('不同嘴形数', uniqMouths.size)

  console.log('\n[5] 连击升级：第三下爱心眼、第五下星星眼')
  await wait(1400)
  const { x: cx, y: cy } = await pointOf(0.5, 0.7)
  const stages = []
  const combos = []
  for (let i = 1; i <= 5; i++) {
    await mouseTap(cx, cy)
    await wait(120)
    const cls = await evaluate(`(document.querySelector('.pet-face')?.className.baseVal || '').trim()`)
    stages.push(cls)
    combos.push(await evaluate(`(document.querySelector('.pf-mouth')?.className.baseVal || '').trim()`))
    if (i === 2) await shotHero('stage3_combo2')
    if (i === 3) await shotHero('stage3_combo3')
    if (i === 5) await shotHero('stage3_combo5')
  }
  ok('连点五下的表情', stages)
  assert.ok(stages[0].endsWith('-purr'), `第一下应该是 purr，实际 ${stages[0]}`)
  assert.ok(stages[2].endsWith('-heart'), `第三下应该升级成爱心眼，实际 ${stages[2]}`)
  assert.ok(stages[4].endsWith('-star'), `第五下应该升级成星星眼，实际 ${stages[4]}`)
  // 连击升级时嘴也得跟着升级：爱心眼是张口的笑，星星眼是更大的笑（还要有舌头）
  ok('连击时的嘴', combos)
  assert.equal(combos[2], `pf-mouth pf-mouth-${mouthKindOf('heart')}`, `爱心眼的嘴形不对：${combos[2]}`)
  assert.equal(combos[4], `pf-mouth pf-mouth-${mouthKindOf('star')}`, `星星眼的嘴形不对：${combos[4]}`)

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
    assert.equal(got.length, want.length, `stage${st}：眼睛分组数量不对，抓到 ${got.length} 组（应为 ${want.length}）`)
    const dev = got.map((g, i) => Math.hypot(g[0] - want[i][0], g[1] - want[i][1]))
    assert.ok(Math.max(...dev) < 6, `stage${st}：眼睛偏离锚点 ${dev.map((d) => d.toFixed(1)).join('/')}px`)
    // 嘴的位置是从**这个阶段的鼻子**推出来的 —— 五个阶段的鼻子高度差很多（趴着的胖崽 vs 坐姿侧脸），
    // 所以这里必须逐阶段验一遍，不能只验阶段 3
    assert.ok(s.嘴, `stage${st}：应该有嘴`)
    const noseY = rect.top + a.nose[1] * rect.h
    const dxm = Math.abs(s.嘴.box[0] - (rect.left + a.nose[0] * rect.w))
    const dym = s.嘴.box[1] - noseY
    assert.ok(dxm < 8, `stage${st}：嘴横向没对在鼻子上（偏 ${dxm.toFixed(1)}px）`)
    assert.ok(dym > 2, `stage${st}：嘴没在鼻子下面（差 ${dym.toFixed(1)}px）`)
    ok(`stage${st}`, { 偏离: dev.map((d) => Number(d.toFixed(1))), 形状: s.形状标签.join('+'), 嘴: s.嘴.cls.replace('pf-mouth pf-mouth-', '') })
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
