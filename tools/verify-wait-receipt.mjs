// 验收「等待凭证」：等满才开的那张纸，以及它能不能真的离开这个 App。
//
// 为什么要这样验：
//   ① 这张纸的**全部意义**在「等满才开」——快进也给的话，它就不再是凭证了。
//      所以必须有一单是快进走完的，断言那时候**没有**这张纸、并且页面说清了为什么。
//   ② 「能拿给人看」= 真的落一个 PNG 到磁盘。只断言「点了按钮没报错」没用 ——
//      最后必须把那个文件读出来，量尺寸、看它是不是一张**空白纸**（inflate 之后数灰度种类）。
//   ③ 纸上的数字不能是编的：大数字必须等于用户在等待页亲眼看到的那句「预计 X 分钟」，
//      猫粮那一行必须等于他刚按下的那个克数。所以这一条是**跨页面比对**，不是查自己。
//
// ⚠️ 怎么走到「等满」：真实等满 120 秒。这里在页面加载前注入一个计时器改写
//    （只改等待页每秒的倒计时 1000 → 20），产品代码一个字没动 ——
//    真实 120 秒那条路由 tools/verify-wait-modes.mjs 覆盖，这里验的是凭证。
//    预演那 12 秒**故意不加速**：要在它结束前把「预计 X 分钟」读下来做比对。
//
// 用法：node tools/verify-wait-receipt.mjs [url] [截图前缀]
import assert from 'node:assert/strict'
import { mkdir, writeFile, readdir, rm, readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const prefix = process.argv[3] || 'wait-receipt'
const workDir = `/tmp/${prefix}`

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  socket.addEventListener('open', res, { once: true })
  socket.addEventListener('error', rej, { once: true })
})

let nextId = 0
const pending = new Map()
const errors = []
const failedResponses = []
const downloadNames = []
let sessionId
socket.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject, timer } = pending.get(m.id)
    clearTimeout(timer)
    pending.delete(m.id)
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    return
  }
  if (m.sessionId === sessionId && m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)
  }
  if (m.sessionId === sessionId && m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    failedResponses.push({ url: m.params.response.url, status: m.params.response.status })
  }
  if (m.method === 'Browser.downloadWillBegin') downloadNames.push(m.params.suggestedFilename)
})

const send = (method, params = {}, session = sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 30000)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }))
  })

const js = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
const waitFor = (expr, t = 20000) => js(`new Promise((res, rej) => {
  const s = performance.now();
  const c = () => { if (${expr}) return res(true); if (performance.now() - s > ${t}) return rej(new Error('等不到: ' + ${JSON.stringify(expr)})); setTimeout(c, 120) }; c();
})`)
const clickText = (re) => `(()=>{const b=[...document.querySelectorAll('button')].find(x=>${re}.test(x.textContent)); if(!b) return false; b.click(); return true})()`
const results = []
const ok = (label, value) => { results.push(label); console.log('  ✓', label, '=', JSON.stringify(value)) }
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${workDir}/${name}.png`, Buffer.from(r.data, 'base64'))
}

/** PNG 体检：尺寸 + 是不是一张空白纸（inflate 出像素，数灰度种类） */
function pngInfo(buf) {
  assert.equal(buf.readUInt32BE(0), 0x89504e47, '这不是一个 PNG 文件')
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  let off = 8
  const idat = []
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len))
    off += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const tones = new Set()
  for (let i = 0; i < raw.length; i += 61) tones.add(raw[i])
  return { w, h, bytes: buf.length, 灰度种类: tones.size }
}

async function waitFile(dir, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const files = await readdir(dir).catch(() => [])
    const hit = files.find((f) => f.endsWith('.png'))
    if (hit) {
      // 别读到一个还在写的文件
      await new Promise((r) => setTimeout(r, 400))
      return `${dir}/${hit}`
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return null
}

/** 走一单到等待页。返回在配送页读到的「预计 X 分钟」。 */
async function orderToWait() {
  await waitFor(`document.querySelector('.home-page')`, 20000)
  await waitFor(`document.querySelectorAll('.shop-row').length > 0`)
  await js(`document.querySelector('.shop-row').click()`)
  await waitFor(`document.querySelectorAll('.add-button').length > 0`)
  await js(`[...document.querySelectorAll('.add-button')].slice(0, 2).forEach(b => b.click())`)
  // 有规格的商品点 + 是「展开」，等 .spec-add 渲染出来再点一遍（默认规格）加进袋子
  await new Promise((r) => setTimeout(r, 120))
  await js(`[...document.querySelectorAll('.spec-add')].forEach(b => b.click())`)
  await waitFor(`document.querySelector('.bag-button')`)
  await js(`document.querySelector('.bag-button').click()`)
  await waitFor(`[...document.querySelectorAll('button')].some(x => /去结账|结算|下单/.test(x.textContent))`)
  await js(clickText('/去结账|结算|下单/'))
  await waitFor(`[...document.querySelectorAll('button')].some(x => /确认|下单|提交/.test(x.textContent))`)
  await js(clickText('/确认|下单|提交/'))
  // 2026-09-22 结算页插了支付面板（模拟）：确认下单后要先「付」才到配送页。
  // ⚠️ 密码键要一下一下点 —— pressDigit 闭包里的 pin 不含未重渲染的新值，同步连点只记 1 位。
  await waitFor(`document.querySelector('.pay-confirm')`, 15000)
  await js(`document.querySelector('.pay-confirm').click()`)
  await waitFor(`document.querySelectorAll('.pay-key').length > 0`, 15000)
  for (let i = 0; i < 6; i++) {
    await js(`(() => { const ks = [...document.querySelectorAll('.pay-key')].filter(k => !k.classList.contains('blank')); ks[0] && ks[0].click() })()`)
    await js(`new Promise(r => setTimeout(r, 150))`)
  }
  // 预演那 12 秒里把抬头抄下来 —— 这是待会儿要跟凭证上那个大数字比对的数
  await waitFor(`document.querySelector('.delivery-hero h1')`, 20000)
  let eta = null
  for (let i = 0; i < 40 && eta === null; i++) {
    eta = await js(`(() => {
      const m = /预计\\s*(\\d+)\\s*分钟/.exec(document.querySelector('.delivery-hero h1')?.innerText || '');
      return m ? Number(m[1]) : null;
    })()`)
    if (eta === null) await new Promise((r) => setTimeout(r, 150))
  }
  assert.ok(eta, '配送页抬头上没有「预计 X 分钟」——凭证的大数字就没得比对了')
  return eta
}

await mkdir(workDir, { recursive: true })
const dlDir = `${workDir}/download`
await rm(dlDir, { recursive: true, force: true })
await mkdir(dlDir, { recursive: true })

try {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true }, null)
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })
  // ⚠️ downloadPath 必须连 browserContextId 一起给：只给路径的话策略落在默认上下文上，
  //    Browser.downloadWillBegin 照样触发（日志一路绿灯），但文件哪都没落。
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, eventsEnabled: true, browserContextId }, null)
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      Math.random = () => 0;                      // 天气与结局定死，断言才有确定的数可比
      const si = window.setInterval;
      window.setInterval = (fn, ms, ...a) => si(fn, ms === 1000 ? 20 : ms, ...a);  // 只加速等待页那每秒
      // 6 分钟短等待（2026-09-24 等待改真实时长后）：加速 50 倍后约 7 秒等满；
      // 快进那单花费 6 ≤ 剩余额度（15 - 两单付款扣的几分钟），两条路都走得通。
      // 凭证上的「预计 X 分钟」仍按店铺+天气显示，与等待页抬头比对不受影响。
      try { localStorage.setItem('soft-life-wait-override-v1', '360') } catch {}
    })();`,
  })

  await send('Page.navigate', { url })
  await waitFor(`document.querySelector('.home-page')`)
  await js(`localStorage.clear()`)
  await send('Page.navigate', { url })
  await waitFor(`document.querySelector('.home-page')`)
  await js(`document.fonts.ready.then(() => true)`)

  console.log('\n[1] 等满 → 结局页开出这张纸')
  const eta = await orderToWait()
  await waitFor(`document.querySelector('.wait-pet-btn')`)
  await waitFor(`document.querySelector('.ending-card')`, 60000)
  await waitFor(`document.querySelector('.wait-receipt')`, 20000)
  await js(`document.fonts.ready.then(() => true)`)
  await js(`document.querySelector('.wait-receipt').scrollIntoView({ block: 'center' })`)
  await new Promise((r) => setTimeout(r, 500))

  const paper = await js(`(() => {
    const q = (s) => document.querySelector(s);
    const rows = [...document.querySelectorAll('.wr-row')].map(r => [
      r.querySelector('dt').innerText.replace(/\\s+/g, ''),
      r.querySelector('dd').innerText.replace(/\\s+/g, ''),
    ]);
    const acc = q('.wr-accent');
    const cs = acc ? getComputedStyle(acc) : null;
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) } };
    const seal = q('.wr-seal');
    const quote = q('.wr-quote');
    const hit = (a, b) => !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);
    return {
      编号: q('.wr-no').innerText,
      日期: q('.wr-date').innerText,
      大数字: Number(q('.wr-big b').innerText),
      单位: q('.wr-big em').innerText,
      断言行: q('.wr-note').innerText,
      条目: rows,
      小字: q('.wr-fine').innerText,
      重音: acc?.innerText,
      重音样式: cs ? { 字体: cs.fontFamily.split(',')[0].replace(/["']/g, ''), 重: +cs.fontWeight, 斜: cs.fontStyle, 轴: cs.fontVariationSettings } : null,
      中文那句: quote?.innerText.replace(/\\n/g, ''),
      印章: seal?.innerText,
      印章色: seal ? getComputedStyle(seal).borderTopColor : null,
      印章压住中文那句: seal && quote ? hit(box(seal), box(quote)) : null,
      纸: box(q('.wr-paper')),
      卡片: box(q('.ending-card')),
      横向溢出: document.documentElement.scrollWidth > window.innerWidth + 1,
      存图按钮: q('.wr-save')?.innerText,
    };
  })()`)

  ok('编号', paper.编号)
  ok('日期', paper.日期)
  ok('大数字', `${paper.大数字} ${paper.单位}（配送页写的是 预计 ${eta} 分钟）`)
  ok('条目', paper.条目.map((r) => r.join(':')).join(' | '))
  ok('小字', paper.小字)
  ok('重音', `${paper.重音} → ${paper.重音样式.字体} ${paper.重音样式.重}/${paper.重音样式.斜}/${paper.重音样式.轴}`)
  ok('中文那句', paper.中文那句)
  ok('印章', `${paper.印章} · ${paper.印章色} · 压住中文那句=${paper.印章压住中文那句}`)

  assert.match(paper.编号, /^NO\. \d{4}-\d{2}-\d{2}-\d{2}$/, `编号格式不对：${paper.编号}`)
  assert.match(paper.日期, /^\d{4} 年 \d{1,2} 月 \d{1,2} 日 · 星期[日一二三四五六]$/, `日期格式不对：${paper.日期}`)
  // 跨页面比对：凭证上的数就是他在等待页亲眼看到的那个数，不是随便编的
  assert.equal(paper.大数字, eta, `凭证写 ${paper.大数字} 分钟，而等待页写的是 ${eta} 分钟 —— 同一单必须一致`)
  assert.equal(paper.单位, '分钟')
  assert.equal(paper.条目.length, 5, `应该是 5 条：收件 / 这一单 / 没变成 / 记下的猫粮 / 今天等满，实际 ${paper.条目.length}`)
  assert.deepEqual(paper.条目.map((r) => r[0]), ['收件', '这一单', '没变成', '记下的猫粮', '今天等满'])
  assert.match(paper.条目[1][1], /^¥\d+/, '「这一单」应该是金额')
  assert.equal(paper.条目[2][1], '一份没人吃的外卖')
  assert.equal(paper.条目[3][1], '—', '还没决定捐多少的时候，猫粮那行应该是空的「—」，不能先写个数骗人')
  assert.equal(paper.条目[4][1], '第1次', '今天第一次等满')
  // 红线：这张纸上不许出现「已替你捐」这层意思
  assert.ok(/钱还在你手上/.test(paper.小字), `小字必须点明钱还在用户手上，实际「${paper.小字}」`)
  assert.ok(!/已捐|代为捐|替你捐/.test(paper.小字), '这张纸不能暗示我们已经替他捐了')
  // 重音声部（跟结局页那句英文同一个声部）
  assert.ok(/Fraunces/.test(paper.重音样式.字体), `那句英文没走 Fraunces：${paper.重音样式.字体}`)
  assert.equal(paper.重音样式.斜, 'italic')
  assert.ok(paper.重音样式.重 >= 700, `重音只有 ${paper.重音样式.重}`)
  assert.ok(/WONK/.test(paper.重音样式.轴), '重音没开 WONK 轴')
  assert.ok(paper.中文那句.includes(`${eta} 分钟`), `中文那句要带上这段路：${paper.中文那句}`)
  assert.equal(paper.印章, '等满')
  assert.ok(/rgb\(180, 85, 45\)/.test(paper.印章色), `印章该是砖红，实际 ${paper.印章色}`)
  assert.equal(paper.印章压住中文那句, false, '印章压住中文那句了 —— 那张纸最要紧的一句话被盖住')
  assert.ok(paper.纸.w <= paper.卡片.w, '这张纸比卡片还宽 —— 横向溢出了')
  assert.equal(paper.横向溢出, false, '页面横向溢出')
  await shot('1-waited')

  console.log('\n[2] 记下的克数：按下去才出现，而且就是按的那个数')
  await js(clickText('/拆开你的专属惊喜/'))
  await waitFor(`document.querySelector('.donate-card')`)
  const donate = await js(`(() => ({
    预览: document.querySelector('.donate-preview')?.innerText.replace(/\\s+/g, ' '),
    建议: [...document.querySelectorAll('.donate-preset')].find(b => b.classList.contains('is-active'))?.innerText,
    按钮: document.querySelector('.donate-actions .primary-button')?.innerText,
  }))()`)
  ok('捐赠卡', donate)
  await js(`document.querySelector('.donate-actions .primary-button').click()`)
  await new Promise((r) => setTimeout(r, 400))
  const gramNow = await js(`document.querySelector('.wr-row:nth-child(4) dd').innerText.replace(/\\s+/g, '')`)
  // ⚠️ ¥1=0.1g（09-22）之后克数带小数（如「记下 1.3g」）—— 正则要认小数，
  //    老的 [\d,]+ 会把「1.3g」抓成「3」，跟凭证上的 1.3g 对不上（假红）。
  const gramClaim = Number((donate.按钮.match(/([\d,]+(?:\.\d+)?)\s*g/) || [])[1]?.replace(/,/g, ''))
  ok('凭证上的猫粮', gramNow)
  assert.equal(gramNow, `${gramClaim.toLocaleString()}g`, `凭证上的克数（${gramNow}）跟按下那颗按钮承诺的（${gramClaim}g）不一致`)
  const fineNow = await js(`document.querySelector('.wr-fine').innerText`)
  assert.ok(/等你真的去捐/.test(fineNow), `记完之后小字要提醒钱还没走，实际「${fineNow}」`)
  await shot('2-donated')

  console.log('\n[3] 存成图片：真的落一个 PNG，而且不是一张空白纸')
  await js(`document.querySelector('.wr-save').click()`)
  const file = await waitFile(dlDir)
  if (!file) {
    const state = await js(`document.querySelector('.wr-save-note')?.innerText || null`)
    throw new Error(`点了「存成图片」磁盘上没有落文件（页面提示：${state}）`)
  }
  const info = pngInfo(await readFile(file))
  ok('落盘', `${file.split('/').pop()} · ${info.w}×${info.h}px · ${(info.bytes / 1024).toFixed(0)}KB · 灰度种类 ${info.灰度种类}`)
  assert.ok(info.w >= 1200 && info.h >= 1200, `存出来的图太小：${info.w}×${info.h}（至少要 1200 宽，发出去才不糊）`)
  assert.ok(info.h > info.w, '凭证该是竖的（一张单子），现在比宽还扁')
  assert.ok(info.bytes > 20000, `文件只有 ${info.bytes} 字节 —— 大概率是一张空白纸`)
  assert.ok(info.灰度种类 >= 20, `像素只有 ${info.灰度种类} 种灰度 —— 这不是画出来的凭证，是一张空白纸`)
  // 存下来的文件名要跟纸上的编号对得上：两张皮必须说同一件事
  const savedName = (downloadNames[0] || '')
  assert.ok(savedName.includes(paper.编号.replace(/^NO\. /, '')), `文件名「${savedName}」和纸上的编号「${paper.编号}」对不上`)
  assert.equal(await js(`document.querySelector('.wr-save-note')?.innerText || null`), '存下来了 —— 在浏览器的「下载」里找它。')
  await shot('3-saved')

  console.log('\n[4] 快进那一单：没有凭证，而且说清了「为什么没有」')
  console.log('    · 点「再来一单」')
  const againOk = await js(clickText('/再来一单/'))
  console.log('    · 点到了吗：', againOk)
  await waitFor(`document.querySelector('.home-page')`, 15000)
  console.log('    · 回到首页了，再走一单到等待页')
  await orderToWait()
  console.log('    · 到等待页了')
  await waitFor(`document.querySelector('.wait-pet-btn')`)
  console.log('    · 软软在，点「等不及了」')
  await js(`document.querySelector('.skip-wait-button').click()`)
  await waitFor(`document.querySelector('.exchange-option')`, 15000)
  console.log('    · 催单卡开了，选一句')
  await js(`document.querySelector('.exchange-option').click()`)
  await waitFor(`document.querySelector('.ending-card')`, 20000)
  console.log('    · 到结局页了')
  await new Promise((r) => setTimeout(r, 500))
  const skipped = await js(`(() => ({
    有凭证: !!document.querySelector('.wait-receipt'),
    纪念语: document.querySelector('.road-recap-foot')?.innerText || null,
    是快进那一路: !!document.querySelector('.road-recap.is-skipped'),
  }))()`)
  ok('快进这一单', skipped)
  assert.equal(skipped.是快进那一路, true, '这一单应该是「提前打了招呼」那一路')
  assert.equal(skipped.有凭证, false, '快进也发凭证的话，这张纸就不再是凭证了')
  assert.ok(/等待凭证只开给等满的那一份/.test(skipped.纪念语 || ''), `没凭证时要说明白为什么，实际「${skipped.纪念语}」`)
  await shot('4-skipped')

  console.log('\n[5] 全页体检')
  const health = await js(`(() => ({
    坏图: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src),
    残留纸: document.querySelectorAll('.wr-paper').length,
    横向溢出: document.documentElement.scrollWidth > window.innerWidth + 1,
  }))()`)
  ok('体检', health)
  assert.equal(health.坏图.length, 0, '有破图：' + health.坏图)
  assert.equal(health.横向溢出, false, '页面横向溢出')
  assert.equal(errors.length, 0, `控制台不该有报错：${errors.join(' / ')}`)
  assert.equal(failedResponses.length, 0, `不该有失败请求：${JSON.stringify(failedResponses)}`)
  console.log('\n✅ 等待凭证全绿：等满才开 · 数字不编 · 克数按下的那一刻才出现 · 存下来的不是空白纸')
} catch (error) {
  console.error('\n验收失败：', error.message)
  process.exitCode = 1
} finally {
  socket.close()
}
