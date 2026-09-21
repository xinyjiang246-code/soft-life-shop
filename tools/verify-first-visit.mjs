// 守卫「新人第一次进来看到的东西」（2026-09-19 用户点的「修陌生人第一次的入口」＋
// 「把揭晓那句话改对」＋「交代铺子是谁开的」＋「给捐猫粮一条落地路径」）。
//
// 为什么必须单独守着：这一整块**全是文案**，而文案最容易在后续改动里被悄悄改回去，
// 编译、类型、别的守卫都不会红。最贵的一条是 [5] 的前半段 ——
// 结算页那句是全产品**唯一一次**告诉用户「这是什么」，
// 旧版写着「你只是完整地经历了『挑选的快乐』」：诚实是有了，却把产品定义成
// 别人也有、且最没壁垒的部分（假购物车谁都能做）。退回旧版等于把护城河填掉。
//
// 用法：node tools/verify-first-visit.mjs [url]
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const url = process.argv[2] || 'http://127.0.0.1:8080/'

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let nextId = 0
const pending = new Map()
const errors = []
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

const ok = (label, value) => console.log('  ✓', label, '=', JSON.stringify(value))
const homeReady = `document.readyState === "complete" && document.body.innerText.trim().length > 20`

try {
  // 全新的浏览器上下文 = 一套干净的 localStorage，天然就是「从没来过的人」。
  // 比「进页面再 clear()」可靠：后者要先把页面跑起来，而首访判断恰恰发生在那一刻。
  contextId = (await send('Target.createBrowserContext', { disposeOnDetach: true }, null)).browserContextId
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId: contextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

  console.log('\n[1] 全新访客：第一句不能是「欢迎回来」')
  await send('Page.navigate', { url })
  await waitFor(homeReady)
  await waitFor(`document.querySelector('.hm-greet')`)
  const greet1 = await evaluate(`document.querySelector('.hm-greet').innerText`)
  const hint1 = await evaluate(`document.querySelector('.hint-bubble p')?.innerText || ''`)
  const visited = await evaluate(`localStorage.getItem('soft-life-visited-v1')`)
  ok('问候语', greet1); ok('提示气泡', hint1); ok('已落 visit 标记', visited)
  assert.ok(!/欢迎回来/.test(greet1), `第一次来的人不该被告知「欢迎回来」：${greet1}`)
  assert.ok(/第一次/.test(greet1), `第一次来就该被认出来：${greet1}`)
  // 首页本身长得完全像真外卖（这是有意的），所以「这里是干什么的」必须有人主动说一句。
  assert.ok(/不会真的送来/.test(hint1), `新人第一眼就该知道这里的外卖不会送来：${hint1}`)
  assert.equal(visited, '1', 'visit 标记要当场落下，否则下次进来还会被当成新人')

  console.log('\n[2] 滚到底：关于小铺在，且说了「谁开的」')
  await evaluate(`window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }); 'ok'`)
  await new Promise((r) => setTimeout(r, 700))
  const about = await evaluate(`document.querySelector('.about-shop')?.innerText || ''`)
  ok('关于小铺', about.replace(/\s+/g, ' ').slice(0, 46) + '…')
  assert.ok(/一个人开的/.test(about), '关于小铺必须交代是谁开的 —— 一个让你去喂猫的东西，不说身份可疑度翻倍')
  assert.ok(/不会真的送来/.test(about), '关于小铺要把「这里的外卖是假的」说明白')
  assert.ok(/喂|投喂|猫/.test(about), '关于小铺要接上「省下的钱可以拿去喂猫」，否则只剩坦白没有去处')

  console.log('\n[3] 回头客：这时才该说「欢迎回来」')
  await send('Page.navigate', { url })
  await waitFor(homeReady)
  await waitFor(`document.querySelector('.hm-greet')`)
  const greet2 = await evaluate(`document.querySelector('.hm-greet').innerText`)
  const hint2 = await evaluate(`document.querySelector('.hint-bubble p')?.innerText || ''`)
  ok('问候语', greet2); ok('提示气泡', hint2)
  assert.ok(/欢迎回来/.test(greet2), `来过一次就该被当成熟人：${greet2}`)
  assert.ok(!/不会真的送来/.test(hint2), '新人解释只说一次 —— 回头客每次都被解释一遍就成了啰嗦')

  console.log('\n[4] 猫粮账本：说清这笔钱可以往哪儿去')
  // ⚠️ 2026-09-21：猫粮入口从首页磁贴区搬到「我的」页
  await evaluate(`(() => { const b = Array.from(document.querySelectorAll('.tabbar-pp-item')).find((x) => x.textContent.trim() === '我的'); if (b) b.click(); return true })()`)
  await evaluate('new Promise((r) => setTimeout(r, 700))')
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('.corner-tile')].find((x) => /猫粮/.test(x.innerText));
    if (!b) throw new Error('找不到「慢活猫粮计划」磁贴');
    b.scrollIntoView({ block: 'center', behavior: 'instant' }); b.click();
  })()`)
  await waitFor(`document.querySelector('.charity-note')`)
  const note = await evaluate(`document.querySelector('.charity-note').innerText`)
  assert.ok(/可以捐给谁/.test(note), '账本要说清这笔钱可以捐给谁 —— 「我真去捐了」之后那一步一直缺着')
  assert.ok(/投喂点|猫协|救助/.test(note), '至少给出能找的地方，而不是只留一个空输入框')
  assert.ok(!/替你捐|帮你捐|已捐给|我们捐/.test(note), '红线：绝不暗示「我们替你捐了」')
  ok('账本说明', note.replace(/\s+/g, ' ').slice(0, 40) + '…')

  console.log('\n[5] 结算页：唯一一次揭晓，必须说对这一单真正发生了什么')
  await send('Page.navigate', { url })
  await waitFor(homeReady)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /慢活茶饮铺|SLOW LIFE TEA/.test(x.innerText || ''));
    if (!b) throw new Error('找不到第一家店');
    b.scrollIntoView({ block: 'center', behavior: 'instant' }); b.click();
  })()`)
  await waitFor(`document.querySelector('.add-button, button[aria-label^="加入"]')`)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^加入/.test((x.getAttribute('aria-label') || '') + (x.innerText || '')));
    if (!b) throw new Error('找不到加入购物篮的按钮');
    b.click();
  })()`)
  await waitFor(`document.querySelector('.bag-button')`)
  await evaluate(`document.querySelector('.bag-button').click()`)
  await waitFor(`document.querySelector('.simple-hero')`)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /去结算/.test(x.innerText || ''));
    if (!b) throw new Error('找不到「去结算」');
    b.click();
  })()`)
  await waitFor(`document.querySelector('.checkout-note p')`)
  const reveal = await evaluate(`document.querySelector('.checkout-note p').innerText`)
  ok('揭晓那句', reveal.replace(/\s+/g, ' '))
  assert.ok(/不会扣款|不会真的扣款/.test(reveal), '诚实必须留着：这是虚拟订单')
  assert.ok(!/挑选的快乐/.test(reveal), '那句「你只是经历了挑选的快乐」把产品说小了 —— 不许回来')
  assert.ok(/等/.test(reveal) && /猫粮|凭证/.test(reveal), '揭晓之后要接上这一单真正发生的事：你要真的等，等待换来一张纸')

  console.log('\n[6] 全站文案红线（扫构建产物，覆盖这次没走到的页面）')
  const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url))
  const bundleName = readdirSync(assets).find((f) => /^index-.*\.js$/.test(f))
  assert.ok(bundleName, '找不到构建产物 —— 先 npm run build')
  const code = readFileSync(assets + bundleName, 'utf8')
  // 先证明这个扫描真的读到了内容，否则下面几条「不包含」全是假绿
  assert.ok(code.includes('钱一直在你手上'), '扫不到已知文案 —— 这个扫描本身失效了，别信它下面的否定断言')
  assert.ok(code.includes('可以捐给谁'), '账本那句「可以捐给谁」应该进包')
  assert.ok(!code.includes('挑选的快乐'), '那句把自己说小的话不该再出现在任何页面')
  assert.ok(!/已替你捐|我们替你捐|帮你捐|已为你捐/.test(code), '红线：全站不许出现「替你捐」的说法')
  ok('构建产物', `${bundleName} · ${(code.length / 1024).toFixed(0)} KB`)

  assert.equal(errors.length, 0, `控制台不该有报错：${errors.join(' / ')}`)
  console.log('\n全绿：新人/回头客分流正确 · 揭晓那句在位 · 关于小铺在位 · 捐猫粮有去处 · 红线未破')
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null).catch(() => {})
  socket.close()
}
