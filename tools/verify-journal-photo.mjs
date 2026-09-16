// 验收「自己拍照上传 → 贴纸 → 展开详情 → 刷新还在」这条链。
//
// 为什么单独写一个：tools/check-preview.mjs 没有「塞文件」这一步，
// 而上传是这次改动的全部内容 —— 不真塞一张图进去，就只是看了一遍静态页面。
//
// 在独立无痕上下文里跑，不碰用户存档。
// 用法：node tools/verify-journal-photo.mjs [url] [screenshot.png]
import { writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

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

  const gotoJournal = async () => {
    await click('.corner-grid .corner-tile:nth-child(3)')
    await waitFor(`document.querySelector('.archive-tabs')`)
    await click('.archive-tabs button:nth-child(2)')
    await waitFor(`document.querySelector('.jh')`)
  }

  console.log('\n[1] 走到手账页')
  await send('Page.navigate', { url })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await gotoJournal()
  ok('手账已挂载', await evaluate(`!!document.querySelector('.jh')`))

  console.log('\n[2] 「今天」页的上传入口真的接到了那个 input')
  await click('.jh-dock button:nth-child(3)') // 今天
  await waitFor(`document.querySelector('.jh-shoot')`)
  const wired = await evaluate(`(() => {
    const input = document.querySelector('.jh .file-input');
    if (!input) throw new Error('手账里没有 file input');
    let hits = 0;
    const original = input.click.bind(input);
    input.click = () => { hits += 1 };
    document.querySelector('.jh-shoot').click();          // 今天页那颗「贴一张自己拍的照片」
    document.querySelector('.jh-dock-add').click();        // 底栏那颗橙色的 +
    input.click = original;
    return hits;
  })()`)
  assert.equal(wired, 2, '「贴一张照片」和底栏 + 都应该打开选择器')
  ok('两个入口都接到同一个 input', wired)

  console.log('\n[3] 塞一张真照片进去')
  const seeded = await evaluate(`(async () => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 1200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#E4D6BE'; ctx.fillRect(0, 0, 1200, 1200);
    ctx.fillStyle = '#9A6434'; ctx.beginPath(); ctx.arc(600, 640, 330, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FBF6EC'; ctx.beginPath(); ctx.arc(600, 640, 210, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#C4703F'; ctx.beginPath(); ctx.arc(600, 640, 96, 0, Math.PI * 2); ctx.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const file = new File([blob], '自己拍的一张.png', { type: 'image/png' });
    const input = document.querySelector('.jh .file-input');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return { size: blob.size, kind: blob.type };
  })()`)
  ok('测试图已送入 input', seeded)

  console.log('\n[4] 存完自动展开，看到的是「我拍的那张」')
  await waitFor(`document.querySelector('.jh-detail')`, 15000)
  // ⚠️ 这里必须等到**大图**，不能只等 naturalWidth > 0 ——
  // 详情页会先用 180px 的缩略图顶一下，再去 IndexedDB 取大图；
  // 只判 >0 的话会在缩略图上就通过，等于什么都没验（踩过一次）。
  await waitFor(`(() => {
    const i = document.querySelector('.jh-detail-photo img');
    return i && i.complete && i.naturalWidth > 400;
  })()`, 15000)
  const detail = await evaluate(`(() => {
    const img = document.querySelector('.jh-detail-photo img');
    return {
      有大图: !!img,
      大图尺寸: img ? [img.naturalWidth, img.naturalHeight] : null,
      容器是照片样式: !!document.querySelector('.jh-detail-photo.is-photo'),
      可编辑字段: Array.from(document.querySelectorAll('.jh-detail-row.is-input input')).map(i => i.getAttribute('aria-label')),
      像素抽样: (() => {
        // 抽一个像素，确认显示的是我们画的那张图，而不是一张空白占位
        const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
        const cx = cv.getContext('2d');
        cx.drawImage(img, 0, 0, 8, 8);
        const d = cx.getImageData(4, 4, 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      })(),
    };
  })()`)
  ok('展开页', detail)
  assert.ok(detail.有大图, '展开页应该显示上传的那张照片')
  assert.ok(detail.容器是照片样式, '自己拍的照片应该走 cover（.is-photo）')
  assert.equal(detail.可编辑字段.length, 2, '展开页应该能补名字和店名')

  console.log('\n[5] 补上名字和店名，按 ✓ 存下')
  await evaluate(`(() => {
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = document.querySelectorAll('.jh-detail-row.is-input input');
    set(inputs[0], '楼下那家拿铁');
    set(inputs[1], '转角咖啡');
  })()`)
  await click('.jh-detail-ok')
  await waitFor(`JSON.parse(localStorage.getItem('soft-life-journal-v1')).days[Object.keys(JSON.parse(localStorage.getItem('soft-life-journal-v1')).days).pop()].items.some(i => i.name === '楼下那家拿铁' && i.place === '转角咖啡')`)
  ok('名字与店名已落盘', await evaluate(`(() => {
    const j = JSON.parse(localStorage.getItem('soft-life-journal-v1'));
    const k = Object.keys(j.days).sort().pop();
    const it = j.days[k].items.find(i => i.photoId);
    return { 日期: k, 名字: it.name, 店名: it.place, 有photoId: !!it.photoId, 缩略图字节: (it.thumb || '').length };
  })()`))

  console.log('\n[6] 展开页已收起 → 日列表里是一张贴纸')
  await waitFor(`!document.querySelector('.jh-detail')`)
  await waitFor(`document.querySelector('.jh-line-art img') && document.querySelector('.jh-line-art img').naturalWidth > 0`)
  ok('日列表贴纸', await evaluate(`(() => {
    const img = document.querySelector('.jh-line-art img');
    return { 有图: !!img, 尺寸: [img.naturalWidth, img.naturalHeight], 名字: document.querySelector('.jh-line-name')?.innerText, 副行: document.querySelector('.jh-line-sub')?.innerText };
  })()`))

  console.log('\n[7] 月视图：日历格子里贴出这一张')
  await click('.jh-dock button:nth-child(1)') // 月
  await waitFor(`document.querySelector('.jh-cell.is-today .jh-thumbs img') && document.querySelector('.jh-cell.is-today .jh-thumbs img').naturalWidth > 0`)
  ok('今天那一格', await evaluate(`(() => {
    const img = document.querySelector('.jh-cell.is-today .jh-thumbs img');
    return { 尺寸: [img.naturalWidth, img.naturalHeight], 角标: document.querySelector('.jh-cell.is-today .jh-badge')?.innerText };
  })()`))

  console.log('\n[8] 刷新 —— 照片和字都得还在')
  await send('Page.reload')
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await gotoJournal()
  await click('.jh-dock button:nth-child(3)')
  await waitFor(`document.querySelector('.jh-line-art img') && document.querySelector('.jh-line-art img').naturalWidth > 0`)
  ok('刷新后', await evaluate(`(() => {
    const img = document.querySelector('.jh-line-art img');
    return { 缩略图尺寸: [img.naturalWidth, img.naturalHeight], 名字: document.querySelector('.jh-line-name')?.innerText };
  })()`))

  console.log('\n[9] 刷新后再展开，大图从 IndexedDB 里读回来')
  await click('.jh-line')
  await waitFor(`(() => {
    const i = document.querySelector('.jh-detail-photo img');
    return i && i.complete && i.naturalWidth > 400;
  })()`, 15000)
  const reopened = await evaluate(`(() => {
    const img = document.querySelector('.jh-detail-photo img');
    return { 尺寸: [img.naturalWidth, img.naturalHeight], 来源: img.src.startsWith('blob:') ? 'IndexedDB(blob)' : 'dataURL' };
  })()`)
  ok('重开的大图', reopened)
  assert.deepEqual(reopened.尺寸, [1200, 1200], '刷新后应该从相册里读回原尺寸的那张，而不是缩略图')
  assert.equal(reopened.来源, 'IndexedDB(blob)', '大图应该来自 IndexedDB')

  // 截图里总是「顶部标题糊、背景文字透过来」——那条得查清楚，不能靠眼睛判。
  // ⚠️ 但测量前必须等入场动画播完（0.34s 的 translateY+scale）：
  //    getBoundingClientRect 返回的是**变换之后**的矩形，动画中途测会得到 top=5 这种假偏移，
  //    第一次就被它骗成了「面板没铺满视口」。
  await evaluate('new Promise(r => setTimeout(r, 800))')
  const geom = await evaluate(`(() => {
    const panel = document.querySelector('.jh-detail-panel');
    const top = document.querySelector('.jh-detail-top');
    const img = document.querySelector('.jh-detail-photo img');
    const pr = panel.getBoundingClientRect(), tr = top.getBoundingClientRect(), ir = img.getBoundingClientRect();
    const bg = getComputedStyle(panel).backgroundColor;
    // 别拿 rect 和 innerWidth/innerHeight 比 —— 移动端模拟下有 2~3px 的视口口径差，
    // 只会得到一条永远失败的假警报。改成问用户真正看得见的那件事：
    // 贴着视口四边往下 4px 戳一下，命中的元素还在不在面板里。
    const probe = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      return { 命中: hit?.className || hit?.tagName || null, 在面板内: !!hit?.closest('.jh-detail-panel') };
    };
    return {
      面板尺寸: [Math.round(pr.width), Math.round(pr.height)],
      视口尺寸: [innerWidth, innerHeight],
      面板位置: [Math.round(pr.left), Math.round(pr.top)],
      四边探测: [
        { 上: probe(innerWidth / 2, 3) },
        { 下: probe(innerWidth / 2, innerHeight - 3) },
        { 左: probe(3, innerHeight / 2) },
        { 右: probe(innerWidth - 3, innerHeight / 2) },
      ],
      // fixed 元素本该贴着视口。top/left 不为 0 就说明有祖先偷偷建了包含块 —— 把它揪出来。
      可疑祖先: (() => {
        const out = [];
        let el = panel.parentElement;
        while (el && el !== document.documentElement) {
          const cs = getComputedStyle(el);
          const flags = [];
          if (cs.transform !== 'none') flags.push('transform:' + cs.transform);
          if (cs.filter !== 'none') flags.push('filter');
          if (cs.willChange !== 'auto') flags.push('will-change:' + cs.willChange);
          if (cs.contain !== 'none') flags.push('contain:' + cs.contain);
          if (cs.perspective !== 'none') flags.push('perspective');
          if (cs.backdropFilter && cs.backdropFilter !== 'none') flags.push('backdrop-filter');
          if (flags.length) out.push({ 类名: el.className, position: cs.position, 线索: flags });
          el = el.parentElement;
        }
        return out;
      })(),
      面板底色: bg,
      底色不透明: !/rgba\\([^)]*,\\s*0?\\.[0-9]+\\)/.test(bg),
      标题在照片上方: ir.top >= tr.bottom,
    };
  })()`)
  ok('展开页几何', geom)
  assert.ok(geom.四边探测.every((p) => Object.values(p)[0].在面板内), `展开面板应该盖住视口四边，实际 ${JSON.stringify(geom.四边探测)}`)
  assert.ok(geom.底色不透明, '展开面板底色必须不透明，否则会透出背景页')
  assert.ok(geom.标题在照片上方, '照片不能盖住顶部标题')

  if (screenshot) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(screenshot.replace(/(\.png)?$/, '') + '_展开页.png', Buffer.from(data, 'base64'))
    console.log('SCREENSHOT(展开页)', screenshot.replace(/(\.png)?$/, '') + '_展开页.png')
  }

  await click('.jh-detail-top button')
  await waitFor(`!document.querySelector('.jh-detail')`)

  console.log('\n[11] 回归：点外卖自动记下的那一笔，商品图还得照常显示')
  // 这次把「图」的统一出口 .jh-thumbs img 换成了 .jh-sticker —— 老路径必须回头验一遍，
  // 否则很容易出现「新功能好了、老条目全变破图」这种只在一半页面上炸的回归。
  await evaluate(`(() => {
    const j = JSON.parse(localStorage.getItem('soft-life-journal-v1') || '{"days":{}}');
    const k = Object.keys(j.days).sort().pop();
    j.days[k].items.push({ id: 'm14', name: '味噌豚骨拉面', at: Date.now() });
    localStorage.setItem('soft-life-journal-v1', JSON.stringify(j));
  })()`)
  await send('Page.reload')
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await gotoJournal()
  await click('.jh-dock button:nth-child(3)')
  await waitFor(`document.querySelectorAll('.jh-line').length >= 2`)
  await waitFor(`Array.from(document.querySelectorAll('.jh-line-art img')).every(i => i.complete)`)
  const both = await evaluate(`Array.from(document.querySelectorAll('.jh-line')).map(r => ({
    名字: r.querySelector('.jh-line-name')?.innerText,
    有图: !!r.querySelector('.jh-line-art img'),
    图可见: (r.querySelector('.jh-line-art img')?.naturalWidth || 0) > 0,
    是自己拍的: !!r.querySelector('.jh-sticker.is-photo'),
  }))`)
  ok('两种条目并存', both)
  assert.equal(both.length, 2, '照片一笔 + 商品一笔')
  assert.ok(both.every((r) => r.有图 && r.图可见), '两种条目的图都应该显示出来')
  assert.ok(both.some((r) => r.是自己拍的) && both.some((r) => !r.是自己拍的), '一张自己拍、一张商品图')

  if (screenshot) {
    // 这一张是「今天」页：上传入口 + 自己拍的贴纸 + 商品图贴纸，两种并排。
    // 同样要等 jhRiseIn 播完，否则截出来是一列半透明的幽灵行。
    await waitFor(`Array.from(document.querySelectorAll('.jh-line')).every(l => getComputedStyle(l).opacity === '1')`, 6000)
    await evaluate('new Promise(r => setTimeout(r, 250))')
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(screenshot.replace(/(\.png)?$/, '') + '_今天.png', Buffer.from(data, 'base64'))
    console.log('SCREENSHOT(今天)', screenshot.replace(/(\.png)?$/, '') + '_今天.png')
  }

  console.log('\n[10] 全页体检')
  await evaluate('document.fonts.ready.then(() => true)')
  await waitFor('Array.from(document.images).every(i => i.complete || !i.src)')
  const health = await evaluate(`({
    // 懒加载没触发时 complete 会是 false，不能只判 naturalWidth === 0
    破图: Array.from(document.images).filter(i => i.complete && i.src && i.naturalWidth === 0).map(i => i.src),
    图总数: document.images.length,
    横向溢出: document.documentElement.scrollWidth > innerWidth,
    手账里emoji: /[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(document.querySelector('.jh')?.innerText || ''),
  })`)
  ok('体检', health)

  // 月视图截一张（等贴纸和入场动画都就位）
  await click('.jh-dock button:nth-child(1)')
  await waitFor(`document.querySelector('.jh-cell.is-today .jh-thumbs img')`)
  // ⚠️ 月历格子是逐个弹进来的（--i 排到 30 就 330ms），动画没播完就截图会得到一张**空日历**
  // —— 第一次截图就是这么被骗的。等所有格子 opacity 到 1 再按下快门。
  await waitFor(`Array.from(document.querySelectorAll('.jh-cell')).every(c => getComputedStyle(c).opacity === '1')`, 6000)
  await evaluate('new Promise(r => setTimeout(r, 300))')
  const monthView = await evaluate(`(() => {
    const cells = Array.from(document.querySelectorAll('.jh-cell'));
    const today = document.querySelector('.jh-cell.is-today');
    return {
      格子数: cells.length,
      可见格子: cells.filter(c => getComputedStyle(c).opacity === '1').length,
      今天那格: today?.querySelector('.jh-dnum')?.innerText,
      今天那格有贴纸: !!today?.querySelector('.jh-thumbs img'),
    };
  })()`)
  ok('月视图', monthView)
  assert.ok(monthView.可见格子 === monthView.格子数 && monthView.格子数 >= 28, '月历格子应该全部可见')
  assert.ok(monthView.今天那格有贴纸, '今天那一格应该贴着上传的照片')
  if (screenshot) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(screenshot, Buffer.from(data, 'base64'))
    console.log('\nSCREENSHOT', screenshot)
  }

  console.log('\n控制台报错:', errors)
  console.log('失败请求:', failedResponses)
  if (errors.length) throw new Error(`控制台有 ${errors.length} 条报错`)
  if (health.破图.length) throw new Error(`有 ${health.破图.length} 张破图`)
  if (failedResponses.length) throw new Error(`有 ${failedResponses.length} 个请求失败`)
  console.log('\n✅ 全绿：上传 → 贴纸 → 展开 → 刷新，链路通')
} catch (error) {
  console.error('\n❌ 验收失败:', error.message)
  process.exitCode = 1
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null).catch(() => {})
  socket.close()
  for (const request of pending.values()) clearTimeout(request.timer)
}
