// 验收「点软软 → 身体有反应」这条链。
//
// 为什么必须真点：上一次的坑就是「用 el.click() 走程序化点击」——
// 程序化点击 clientX/Y 都是 0，分部位判定会直接失效，
// 等于只验了「按钮能点」，没验「点在哪儿有区别」。
// 这里一律用 CDP 派发**真实鼠标事件**，带屏幕坐标。
//
// 用法：node tools/verify-pet-pat.mjs [url] [screenshot.png]
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
// 台词池与里程碑都从源码里取，不在守卫里抄一遍 —— 改了文案这里不会悄悄失配
import { PAT_MILESTONES, ZONE_LINES } from '../src/petTouch.js'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const screenshot = process.argv[3]

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
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('找不到 ' + ${JSON.stringify(selector)});
    el.click();
  })()`)
}

/** 真鼠标点击（带坐标）—— 分部位判定全靠它 */
async function mouseTap(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

/** 猫身上某个部位对应的屏幕坐标（归一化 → 按钮矩形内） */
async function pointOf(nx, ny, selector = '.pet-pat-btn') {
  const r = await evaluate(`(() => {
    const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { left: b.left, top: b.top, w: b.width, h: b.height };
  })()`)
  return { x: r.left + r.w * nx, y: r.top + r.h * ny }
}

/**
 * 心情角标读法：`SoftPet` 把 mood 写进了 role="img" 的 aria-label
 * （`虚拟伙伴软软，love`）。比解 SVG 里的颜色常量稳，也不会因为换色板而假红。
 */
const moodOf = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)}).querySelector('[role="img"]');
  if (!el) return null;
  const m = /，([a-z]+)$/.exec(el.getAttribute('aria-label') || '');
  return m ? m[1] : null;
})()`

const results = []
const ok = (label, value) => { results.push({ label, value }); console.log('  ✓', label, '=', JSON.stringify(value)) }

try {
  contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

  console.log('\n[1] 走到软软的小屋')
  await send('Page.navigate', { url })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  // ⚠️ 首页磁贴区（.corner-grid）已随 2026-09-21 的 IA 重排删掉 —— 改走
  //    「邻居猫 → 去小屋看看」这条入口（与 tools/verify-color-scheme.mjs 同一条）。
  //    别再改回磁贴：等不到 .corner-tile 报的是「宠物页进不去」，看着像宠物页坏了。
  await evaluate(`(() => { const e = document.querySelector('.pet-visit-btn'); if (e) { e.scrollIntoView({ block: 'center', behavior: 'instant' }); e.click(); } return true })()`)
  await evaluate('new Promise(r => setTimeout(r, 420))')
  await evaluate(`(() => { const e = Array.from(document.querySelectorAll('.pet-visit-bubble [role="button"]')).find((x) => /小屋/.test(x.textContent)); if (e) e.click(); return true })()`)
  await waitFor(`document.querySelector('.pet-pat-btn')`)
  ok('宠物页已挂载', await evaluate(`document.querySelector('.pet-hero h1').innerText`))

  console.log('\n[2] 平时就是「活的」：待机呼吸挂在独立的层上')
  const idle = await evaluate(`(() => {
    const idleEl = document.querySelector('.pet-idle');
    const hitEl = document.querySelector('.pet-hit');
    const a = idleEl.getAnimations();
    return {
      有待机层: !!idleEl,
      有反应层: !!hitEl,
      两层不是同一个元素: idleEl !== hitEl,
      待机动画数: a.length,
      待机无限循环: a[0] ? a[0].effect.getTiming().iterations === Infinity : false,
      反应层初始无形变: ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(hitEl).transform),
      提示语: document.querySelector('.pet-pat-hint')?.innerText || null,
    };
  })()`)
  ok('待机与反应分层', idle)
  assert.ok(idle.有待机层 && idle.有反应层, '软软应该同时有待机层和反应层')
  assert.ok(idle.两层不是同一个元素, '呼吸和反应必须在不同元素上，否则 transform 互相覆盖')
  assert.equal(idle.待机无限循环, true, '待机呼吸应该是无限循环')
  assert.equal(idle.反应层初始无形变, true, '没有人点的时候，反应层不该有残留形变')

  console.log('\n[3] 六个部位各点一下：形变种类、连击时长、落点判定')
  // 归一化坐标按图片从上到下：耳朵 0.1 / 头 0.36 / 脸颊 0.4 / 肚子 0.7 / 爪尾 0.93
  const ZONES = [
    ['ear', 0.5, 0.1],
    ['head', 0.5, 0.36],
    ['cheekL', 0.15, 0.4],
    ['cheekR', 0.85, 0.4],
    ['tummy', 0.5, 0.7],
    ['paw', 0.5, 0.93],
  ]
  const seen = {}
  for (const [expect, nx, ny] of ZONES) {
    const { x, y } = await pointOf(nx, ny)
    const hitTarget = await evaluate(`(!!document.elementFromPoint(${x}, ${y})?.closest('.pet-pat-btn'))`)
    assert.ok(hitTarget, `(${x},${y}) 应该落在按钮上，否则真实点击根本到不了软软`)
    await mouseTap(x, y)
    // 采样：动画确实在跑 + 关键帧内容是哪种形变
    const sample = await evaluate(`(async () => {
      const el = document.querySelector('.pet-hit');
      const a = el.getAnimations().filter((x) => x.playState === 'running' || x.currentTime > 0);
      await new Promise((r) => setTimeout(r, 130));
      const t1 = getComputedStyle(el).transform;
      await new Promise((r) => setTimeout(r, 130));
      const t2 = getComputedStyle(el).transform;
      const timing = a[0] ? a[0].effect.getTiming() : null;
      const frames = a[0] ? a[0].effect.getKeyframes().map((k) => k.transform).filter(Boolean) : [];
      return {
        zone: document.querySelector('.pet-pat-btn').dataset.zone,
        pats: Number(document.querySelector('.pet-pat-btn').dataset.pats),
        动画数: a.length,
        时长: timing ? Math.round(timing.duration) : null,
        已推进: a[0] ? a[0].currentTime > 0 : false,
        中间形变: [t1, t2],
        形变种类: frames.join(' | '),
        粒子数: document.querySelectorAll('.pat-pop svg').length,
        粒子是矢量: Array.from(document.querySelectorAll('.pat-pop')).every((p) => p.querySelector('svg')),
        台词: document.querySelector('.pet-pat-bubble')?.innerText || null,
      };
    })()`)
    seen[expect] = sample
    ok(`点${expect}`, {
      判定: sample.zone,
      时长: sample.时长,
      粒子: sample.粒子数,
      台词: sample.台词,
      形变种类: sample.形变种类.slice(0, 58),
    })
    assert.equal(sample.zone, expect, `点在图上的 (${nx}, ${ny}) 应该判成 ${expect}，实际 ${sample.zone}`)
    assert.ok(sample.动画数 >= 1, `${expect}：点下去应该立刻有一条形变动画`)
    assert.ok(sample.已推进, `${expect}：动画应该在真的跑（currentTime > 0）`)
    assert.ok(
      sample.中间形变.some((t) => t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)'),
      `${expect}：采样期间必须看到真实形变，否则等于没动`,
    )
    assert.ok(sample.粒子数 >= 3, `${expect}：指尖应该冒出小图，实际 ${sample.粒子数}`)
    assert.equal(sample.粒子是矢量, true, '粒子必须是 SVG（项目禁 emoji）')
    await evaluate('new Promise((r) => setTimeout(r, 700))') // 等这次反应播完，别串到下一种部位
  }

  console.log('\n[4] 各部位的反应确实不一样（不是同一个动作）')
  const kinds = Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.形变种类]))
  assert.ok(kinds.tummy.includes('scale('), '摸肚子应该是压扁回弹（scale）')
  assert.ok(kinds.ear.includes('rotate('), '点耳朵应该是抖动（rotate）')
  assert.ok(kinds.head.includes('translate'), '摸头应该带位移（蹭手）')
  assert.notEqual(kinds.tummy, kinds.head, '肚子和头的反应不能是同一套')
  assert.notEqual(kinds.head, kinds.paw, '头和爪子的反应不能是同一套')
  ok('六种部位反应互不相同', Object.keys(kinds).length)

  console.log('\n[5] 连击：越点越快、幅度越大')
  await evaluate('new Promise((r) => setTimeout(r, 1700))') // 先让连击窗口过期
  const { x: tx, y: ty } = await pointOf(0.5, 0.7)
  await mouseTap(tx, ty)
  const first = await evaluate(`(() => {
    const a = document.querySelector('.pet-hit').getAnimations()[0];
    const f = a.effect.getKeyframes().find((k) => k.offset === 0.25) || a.effect.getKeyframes()[1];
    return { 时长: Math.round(a.effect.getTiming().duration), 关键帧: f.transform };
  })()`)
  for (let i = 0; i < 3; i++) {
    await mouseTap(tx, ty)
    await evaluate('new Promise((r) => setTimeout(r, 90))')
  }
  const fourth = await evaluate(`(() => {
    const a = document.querySelector('.pet-hit').getAnimations()[0];
    const f = a.effect.getKeyframes().find((k) => k.offset === 0.25) || a.effect.getKeyframes()[1];
    return { 时长: Math.round(a.effect.getTiming().duration), 关键帧: f.transform, 连击数: Number(document.querySelector('.pet-pat-btn').dataset.pats) };
  })()`)
  ok('第一下', first)
  ok('连点到第四下', fourth)
  assert.ok(fourth.时长 < first.时长, `连击后节奏应该更快：${first.时长}ms → ${fourth.时长}ms`)
  assert.notEqual(fourth.关键帧, first.关键帧, '连击后幅度应该更大（关键帧不同）')

  if (screenshot) {
    await evaluate('new Promise((r) => setTimeout(r, 1700))')
    await mouseTap(tx, ty)
    await evaluate('new Promise((r) => setTimeout(r, 190))') // 停在形变最大的那一帧
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(screenshot, Buffer.from(data, 'base64'))
    console.log('SCREENSHOT', screenshot)
  }

  console.log('\n[6] 键盘 / 无坐标点击也不能崩（走「摸肚子」兜底）')
  const fallback = await evaluate(`(async () => {
    const btn = document.querySelector('.pet-pat-btn');
    btn.click();
    await new Promise((r) => setTimeout(r, 60));
    const a = document.querySelector('.pet-hit').getAnimations();
    return { zone: btn.dataset.zone, 动画数: a.length };
  })()`)
  ok('程序化点击兜底', fallback)
  assert.equal(fallback.zone, 'tummy', '没有坐标时应该按「摸肚子」兜底')
  assert.ok(fallback.动画数 >= 1, '兜底路径也要有身体反应')
  await evaluate('new Promise((r) => setTimeout(r, 1200))')

  console.log('\n[7] 首页那只溜达猫摸一下也要有反应')
  await click('.topbar .menu-button') // 左上角返回
  await waitFor(`document.querySelector('.home-cat-btn')`, 12000)
  // ⚠️ 新手引导（.ob-backdrop）是全屏遮罩：**程序化 click 穿得过去，真实鼠标事件穿不过去**。
  //    不点掉的话下面 elementFromPoint 命中的是 .ob-body，会误报「首页摸猫没反应」
  //    （2026-09-21 新引导上线后踩到）。
  await evaluate(`(() => { const b = document.querySelector('.ob-skip'); if (b) b.click(); return true })()`)
  await evaluate('new Promise((r) => setTimeout(r, 500))')
  // ⚠️ 必须先把猫滚进视口再量坐标：从磁贴进来时页面停在顶部，
  //    .home-cat 在屏幕外，getBoundingClientRect 给出的是负/超屏坐标，
  //    鼠标事件会落空 —— 上一版就是这么误报「首页摸猫没反应」的。
  await evaluate(`(() => {
    document.querySelector('.home-cat').scrollIntoView({ block: 'center' });
    return true;
  })()`)
  await evaluate('new Promise((r) => setTimeout(r, 600))')
  const homePt = await evaluate(`(() => {
    const r = document.querySelector('.home-cat-btn').getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height * 0.7;
    const hit = document.elementFromPoint(x, y);
    return { x, y, 命中按钮: !!(hit && hit.closest('.home-cat-btn')), 命中: hit ? hit.className : null, 在视口内: r.top > 0 && r.bottom < innerHeight };
  })()`)
  ok('首页摸猫落点', homePt)
  assert.ok(homePt.命中按钮, `摸猫坐标应该落在按钮上，实际命中 ${homePt.命中}`)
  await mouseTap(homePt.x, homePt.y)
  const homePat = await evaluate(`(async () => {
    await new Promise((r) => setTimeout(r, 120));
    const el = document.querySelector('.home-cat-hit');
    const a = el.getAnimations();
    return {
      动画数: a.length,
      形变: getComputedStyle(el).transform,
      粒子: document.querySelectorAll('.pat-pop svg').length,
      台词: document.querySelector('.home-cat-bubble')?.innerText || null,
    };
  })()`)
  ok('首页摸摸', homePat)
  assert.ok(homePat.动画数 >= 1, '首页摸猫也要有身体反应')
  assert.ok(homePat.形变 !== 'none', '首页摸猫时应该有真实形变')
  assert.ok(homePat.粒子 >= 2, '首页摸猫也该冒小图')

  console.log('\n[8] 全页体检')
  // 粒子的寿命是 1400ms（组件里 setTimeout 回收）—— 等够再查残留，
  // 否则查的是「还在飞」而不是「收不干净」
  await evaluate('new Promise((r) => setTimeout(r, 2200))')
  const health = await evaluate(`(() => ({
    坏图: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
    残留粒子: document.querySelectorAll('.pat-pop').length,
    残留形变: getComputedStyle(document.querySelector('.home-cat-hit')).transform,
  }))()`)
  ok('体检', health)
  assert.equal(health.坏图.length, 0, '不能有破图')
  assert.equal(health.残留粒子, 0, '粒子应该自己收干净，不该堆在页面上')
  assert.equal(health.残留形变, 'none', '反应播完要回到原位，不能歪着不动')

  console.log('\n[9] 等待页那只也要分部位 —— 等外卖时最想摸的偏偏是它')
  // 以前这里点一下只是把旁边那句陪等的话换成下一句，猫一动不动（2026-09-18 补上）。
  // 走一单到等待阶段：4 步 × 3000ms = 12 秒才进 waiting，别把 waitFor 设短了。
  await waitFor(`document.querySelector('.shop-row')`, 20000)
  await evaluate(`document.querySelector('.shop-row').click()`)
  await waitFor(`document.querySelectorAll('.add-button').length > 0`)
  await evaluate(`[...document.querySelectorAll('.add-button')].slice(0, 2).forEach((b) => b.click())`)
  await waitFor(`document.querySelector('.bag-button')`)
  await click('.bag-button')
  await waitFor(`[...document.querySelectorAll('button')].some((x) => /去结账|结算|下单/.test(x.textContent))`)
  await evaluate(`[...document.querySelectorAll('button')].find((x) => /去结账|结算|下单/.test(x.textContent)).click()`)
  await waitFor(`[...document.querySelectorAll('button')].some((x) => /确认|下单|提交/.test(x.textContent))`)
  await evaluate(`[...document.querySelectorAll('button')].find((x) => /确认|下单|提交/.test(x.textContent)).click()`)
  await waitFor(`document.querySelector('.wait-pet-btn')`, 30000)
  // 到等待页时页面停在顶部，猫可能在屏幕外（同 [7] 的坑）——先滚进视口再量坐标
  await evaluate(`(() => { document.querySelector('.wait-pet').scrollIntoView({ block: 'center' }); return true; })()`)
  await evaluate('new Promise((r) => setTimeout(r, 600))')

  const W_ZONES = [
    ['ear', 0.5, 0.1],
    ['head', 0.5, 0.36],
    ['cheekL', 0.15, 0.4],
    ['cheekR', 0.85, 0.4],
    ['tummy', 0.5, 0.7],
    ['paw', 0.5, 0.93],
  ]
  // 台词池从源码里取，不在守卫里抄一遍 —— 免得改了文案这里悄悄失配
  const pool = ZONE_LINES
  const wSeen = {}
  for (const [expect, nx, ny] of W_ZONES) {
    const { x, y } = await pointOf(nx, ny, '.wait-pet-btn')
    const hitTarget = await evaluate(`(!!document.elementFromPoint(${x}, ${y})?.closest('.wait-pet-btn'))`)
    assert.ok(hitTarget, `等待页 (${x},${y}) 应该落在按钮上，否则真实点击根本到不了软软`)
    await mouseTap(x, y)
    const sample = await evaluate(`(async () => {
      const el = document.querySelector('.wait-pet-btn .pet-hit');
      const a = el.getAnimations();
      await new Promise((r) => setTimeout(r, 140));
      const t = getComputedStyle(el).transform;
      const frames = a[0] ? a[0].effect.getKeyframes().map((k) => k.transform).filter(Boolean) : [];
      const btn = document.querySelector('.wait-pet-btn');
      return {
        zone: btn.dataset.zone,
        mood: ${moodOf('.wait-pet-btn')},
        形变种类: frames.join(' | '),
        中间形变: t,
        粒子数: document.querySelectorAll('.pat-pop svg').length,
        台词: document.querySelector('.wait-pet-text p').innerText,
      };
    })()`)
    wSeen[expect] = sample
    ok(`等待页点${expect}`, { 判定: sample.zone, 角标: sample.mood, 粒子: sample.粒子数, 台词: sample.台词 })
    assert.equal(sample.zone, expect, `等待页点 (${nx}, ${ny}) 应该判成 ${expect}，实际 ${sample.zone}`)
    assert.ok(sample.中间形变 !== 'none', `${expect}：等待页摸下去必须看到真实形变（不能像以前那样一动不动）`)
    assert.ok(sample.粒子数 >= 3, `${expect}：等待页也该冒小图，实际 ${sample.粒子数}`)
    assert.ok(
      pool[expect].includes(sample.台词) || Object.values(PAT_MILESTONES).includes(sample.台词),
      `${expect}：这句「${sample.台词}」不属于该部位的台词池 —— 说明被别的东西顶掉了`,
    )
    await evaluate('new Promise((r) => setTimeout(r, 700))')
  }

  console.log('\n[10] 换部位就换话：里程碑不再吞掉部位台词（2026-09-18 修的）')
  // 老毛病：里程碑按「本次会话累计点击数」算，摸到第 3 下不管摸哪儿都说同一句，
  // 连摸几个不同部位的人听到的是「说的都是同一句」——「分部位」这件事就被吃掉了。
  const lineOf = (zone) => wSeen[zone].台词
  assert.equal(new Set(W_ZONES.map((z) => lineOf(z[0]))).size >= 4, true, '六个部位摸下来，说的不该是同一句话')
  const moods = Object.fromEntries(W_ZONES.map((z) => [z[0], wSeen[z[0]].mood]))
  assert.equal(moods.tummy, 'sparkle', `摸肚子角标该是 sparkle，实际 ${moods.tummy}`)
  assert.equal(moods.paw, 'angry', `摸爪子角标该是 angry（敏感处），实际 ${moods.paw}`)
  assert.equal(moods.ear, 'love', `摸耳朵角标该是 love，实际 ${moods.ear}`)
  // 连点同一个部位到第三下 → 该出里程碑；紧接着换一个部位 → 必须立刻回到那个部位的话
  for (let i = 0; i < 3; i++) {
    const { x, y } = await pointOf(0.5, 0.1, '.wait-pet-btn')
    await mouseTap(x, y)
    await evaluate('new Promise((r) => setTimeout(r, 160))')
  }
  const milestone = await evaluate(`document.querySelector('.wait-pet-text p').innerText`)
  ok('连点耳朵第三下', milestone)
  assert.ok(Object.values(PAT_MILESTONES).includes(milestone), `同一部位连点到第三下该出里程碑，实际「${milestone}」`)
  await evaluate('new Promise((r) => setTimeout(r, 700))')
  const { x: hx, y: hy } = await pointOf(0.5, 0.36, '.wait-pet-btn')
  await mouseTap(hx, hy)
  const afterSwitch = await evaluate(`(async () => { await new Promise((r) => setTimeout(r, 140)); return document.querySelector('.wait-pet-text p').innerText })()`)
  ok('换成摸头', afterSwitch)
  assert.ok(
    pool.head.includes(afterSwitch),
    `换部位后应该立刻说「头」的话，实际「${afterSwitch}」—— 说明里程碑把部位台词吞了`,
  )

  console.log('\n[11] 全页体检（含等待页）')
  await evaluate('new Promise((r) => setTimeout(r, 2200))')
  const wHealth = await evaluate(`(() => ({
    坏图: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
    残留粒子: document.querySelectorAll('.pat-pop').length,
    残留形变: getComputedStyle(document.querySelector('.wait-pet-btn .pet-hit')).transform,
  }))()`)
  ok('等待页体检', wHealth)
  assert.equal(wHealth.坏图.length, 0, '等待页不能有破图')
  assert.equal(wHealth.残留粒子, 0, '等待页的粒子也要自己收干净')
  assert.equal(wHealth.残留形变, 'none', '等待页的反应播完要回到原位')

  assert.equal(errors.length, 0, `控制台不该有报错：${errors.join(' / ')}`)
  assert.equal(failedResponses.length, 0, `不该有失败请求：${JSON.stringify(failedResponses)}`)
  console.log('\n全绿：坏图 0 / 报错 0 / 失败请求 0（小屋 + 首页 + 等待页三处都验过）')
} catch (error) {
  console.error('\n验收失败：', error.message)
  process.exitCode = 1
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null).catch(() => {})
  socket.close()
}
