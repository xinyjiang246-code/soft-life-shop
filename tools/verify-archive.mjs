// 验收「存下这一餐」这一页 —— 2026-09-17 改动后的完整链路。
//
// 为什么必须真上传：这次改动的全部内容就是「照片存到哪去」。不真塞一张图，
// 就只是看了一遍静态页面（而且是最不容易出错的那部分）。
//
// 断言的重点不是「界面长出来了」，而是三件容易悄悄坏掉的事：
//   ① 照片没再以全尺寸 base64 塞进 localStorage（旧版的做法会静默写满配额）
//   ② 照片墙和食物手账是**同一套数据**（上传一张，两边都看得到）
//   ③ 备注卡的新字段真的落了盘（刷新还在），而不是只活在 React state 里
//
// 在独立无痕上下文里跑，不碰用户存档。
// 用法：node tools/verify-archive.mjs [url] [截图前缀]
import { writeFile, mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { findSeedAsset, seedPhotoScript } from './seedPhoto.mjs'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const shotPrefix = process.argv[3] || ''

// 测试素材（项目自带的真照片）——构建产物里名字带 hash，所以按前缀现找
const seedAsset = await findSeedAsset()

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

/**
 * ⚠️ 截图前必须等入场动画播完。
 * 这层是 200ms 的 jhFade（opacity 0→1），抢在中间按快门会截出一张「半透明」的图 ——
 * 看起来像「面板没盖住、底下页面透上来」这种产品 bug，其实是探针太快了（第一次就这么被骗了一回）。
 * 别用 `getAnimations().map(a => a.finished)`：页面上有无限循环的动画，那个 Promise 永远不 resolve。
 */
async function settle() {
  await evaluate(`new Promise((resolve) => {
    const started = performance.now();
    const check = () => {
      const panel = document.querySelector('.jh-peek, .jh-detail-panel');
      const done = !panel || getComputedStyle(panel).opacity === '1';
      if (done || performance.now() - started > 3000) return resolve(true);
      setTimeout(check, 60);
    }; check();
  })`)
}

async function shot(name) {
  if (!shotPrefix) return
  await settle()
  await mkdir(shotPrefix, { recursive: true }).catch(() => {})
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(`${shotPrefix}${name}.png`, Buffer.from(data, 'base64'))
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

  const gotoArchive = async () => {
    await click('.corner-grid .corner-tile:nth-child(3)')
    await waitFor(`document.querySelector('.archive-tabs')`)
    await click('.archive-tabs button:nth-child(1)')
    await waitFor(`document.querySelector('.aw')`)
  }

  console.log('\n[1] 首页 → 把这一餐存下来')
  await send('Page.navigate', { url })
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await gotoArchive()
  ok('页面已挂载', await evaluate(`({ 标题: document.querySelector('.archive-bar span').innerText, 有照片墙: !!document.querySelector('.aw') })`))

  console.log('\n[2] 空态：示例图是「看大图」的入口，不是上传按钮')
  const empty = await evaluate(`({
    有示例: !!document.querySelector('.archive-example'),
    示例文案: document.querySelector('.archive-example span')?.innerText,
    有上传按钮: !!document.querySelector('.upload-zone.compact'),
    墙上文案: document.querySelector('.aw-empty')?.innerText,
    计数: document.querySelector('.aw-count')?.innerText,
  })`)
  ok('空态', empty)
  assert.ok(empty.有示例 && empty.有上传按钮, '空态应该有示例和上传按钮')
  assert.ok(/还是空的/.test(empty.计数), '还没有照片时计数应该直说')

  // 旧版这里点一下会弹文件选择器 —— 用户想看示例，它让你上传。真点一次确认行为变了。
  const exampleOpened = await evaluate(`(() => {
    const input = document.querySelector('.archive-page .file-input');
    let picker = 0;
    const original = input.click.bind(input);
    input.click = () => { picker += 1 };
    document.querySelector('.archive-example').click();
    input.click = original;
    return picker;
  })()`)
  assert.equal(exampleOpened, 0, '点示例**不该**再弹文件选择器')
  await waitFor(`document.querySelector('.jh-detail.is-peek')`)
  await waitFor(`(() => { const i = document.querySelector('.jh-peek-tap img'); return i && i.complete && i.naturalWidth > 200 })()`)
  ok('示例点开 = 看大图', await evaluate(`(() => {
    const i = document.querySelector('.jh-peek-tap img');
    return { 大图尺寸: [i.naturalWidth, i.naturalHeight], 可以翻到备注: !!document.querySelector('button.jh-peek-tap'), 提示: document.querySelector('.jh-peek-hint')?.innerText || null };
  })()`))
  await shot('01_空态与示例')
  await click('.jh-detail-top button')
  await waitFor(`!document.querySelector('.jh-detail')`)

  console.log('\n[3] 真上传一张照片')
  // 素材是项目自带的**真照片**（竖图，一张抹茶拿铁），不是 canvas 画的合成图 ——
  // 那张合成图会一路进到交付图里，用户看到只会问「这个图是啥」。见 tools/seedPhoto.mjs
  const seeded = await evaluate(
    seedPhotoScript({ assetUrl: seedAsset, inputSelector: '.archive-page .file-input' }),
  )
  ok('测试图已送入 input', seeded)

  console.log('\n[4] 落盘方式：照片进 IndexedDB，localStorage 里不许有大 base64')
  // ⚠️ 别拿 `.archive-hint` 当通过条件 —— 那句「正在把这张照片存下来…」是**点下去立刻出现**的，
  //    于是它会瞬间放行，跑到 localStorage 还没写的时候就去读，报一个假警报。
  //    等就等真正要验的那件事：这一笔连照片一起落了盘。
  await waitFor(`(() => {
    const j = JSON.parse(localStorage.getItem('soft-life-journal-v1') || '{"days":{}}');
    return Object.values(j.days || {}).some((d) => (d.items || []).some((i) => i.photoId));
  })()`, 20000)
  // 真出错了才该有提示 —— 顺手确认这次没有
  const noError = await evaluate(`document.querySelector('.archive-hint')?.innerText || null`)
  assert.equal(noError, null, `上传过程不该出现提示文案，实际：${noError}`)

  // ⚠️ 别写死「data URL 超过 N 个字符就是大图」—— 阈值是跟着素材走的。
  //    换成真照片之后，缩略图从几百字符涨到 2935，原先用 2000 当线，缩略图自己就越线了，
  //    于是报一个「localStorage 里塞了大图」的假警报（真凶在那儿从来就没回来过）。
  //    正确的问法不是「长不长」，而是「**它是不是原图**」——拿它跟原图的 base64 长度比：
  //    原图 27KB → base64 约 3.6 万字符；缩略图 2.9K，差着一个数量级，怎么换素材都不会误判。
  const 原图base64约 = Math.ceil(seeded.字节 / 3) * 4
  const storage = await evaluate(`(() => {
    const raw = localStorage.getItem('soft-life-journal-v1') || '{"days":{}}';
    const j = JSON.parse(raw);
    const k = Object.keys(j.days).sort().pop();
    const items = j.days[k].items;
    const withPhoto = items.filter(i => i.photoId);
    // 旧版的元凶：全尺寸 base64 直接躺在 localStorage 里
    const legacy = localStorage.getItem('soft-life-archives-v1');
    const 所有dataURL = raw.match(/data:image\\/[a-z]+;base64,[A-Za-z0-9+/=]+/g) || [];
    return {
      手账笔数: items.length,
      带照片的笔数: withPhoto.length,
      有条目photoId: !!withPhoto[0]?.photoId,
      缩略图字节: (withPhoto[0]?.thumb || '').length,
      缩略图是dataURL: (withPhoto[0]?.thumb || '').startsWith('data:image'),
      旧key还在吗: legacy === null ? '已清掉' : legacy,
      手账JSON总字符: raw.length,
      最长dataURL字符: 所有dataURL.reduce((m, s) => Math.max(m, s.length), 0),
    };
  })()`)
  ok('两处存储', { ...storage, 原图base64约 })
  assert.equal(storage.带照片的笔数, 1, '应该多了一笔带照片的记录')
  assert.ok(storage.有条目photoId, '这一笔应该带 photoId（指向 IndexedDB 里的大图）')
  assert.ok(storage.缩略图字节 > 0 && storage.缩略图字节 < 40000, `缩略图应该是小图，实际 ${storage.缩略图字节} 字符`)
  assert.ok(
    storage.最长dataURL字符 > 0 && storage.最长dataURL字符 < 原图base64约 / 3,
    `localStorage 里最长的 data URL 有 ${storage.最长dataURL字符} 字符，接近原图的 ${原图base64约} —— 说明存的不是缩略图`,
  )
  assert.ok(
    storage.手账JSON总字符 < 原图base64约,
    `整本手账 ${storage.手账JSON总字符} 字符，比一张原图的 base64（${原图base64约}）还大 —— 存几张就得撑爆配额`,
  )

  const idb = await evaluate(`new Promise((resolve) => {
    const req = indexedDB.open('soft-life-photo-v1', 1);
    req.onsuccess = () => {
      const db = req.result;
      const t = db.transaction('photos', 'readonly').objectStore('photos');
      const all = t.getAll(); const keys = t.getAllKeys();
      t.transaction.oncomplete = () => resolve({ 张数: all.result.length, key: keys.result[0] || null, 字节: all.result[0]?.size || 0 });
    };
    req.onerror = () => resolve({ 张数: -1 });
  })`)
  ok('IndexedDB（相册）', idb)
  assert.equal(idb.张数, 1, 'IndexedDB 里应该有 1 张原图')
  assert.ok(idb.字节 > 1000, '原图不该是个空 blob')

  console.log('\n[5] AI 面板整块都看得见（这里曾经被卡片裁掉一半）')
  await waitFor(`document.querySelector('.ai-footer-note')`, 20000)
  await evaluate('new Promise(r => setTimeout(r, 300))')
  const clip = await evaluate(`(() => {
    const card = document.querySelector('.archive-card');
    const foot = document.querySelector('.ai-footer-note');
    const cr = card.getBoundingClientRect(), fr = foot.getBoundingClientRect();
    const cs = getComputedStyle(card);
    // 溢出多少（>1px 就说明有内容被 overflow:hidden 吃掉了）
    const 溢出 = card.scrollHeight - card.clientHeight;
    // 更贴近用户视角：面板最后一行还摸得到吗
    // ⚠️ 探测点要夹在视口内 —— 面板很长时 fr.bottom 可能已经在屏幕外，
    //    那样测到的是「要滚动」而不是「被裁掉」，会得到一条永远失败的假警报。
    const y = Math.min(fr.bottom - 3, innerHeight - 4);
    const hit = document.elementFromPoint(fr.left + 10, y);
    return {
      卡片高: Math.round(cr.height),
      内容高: Math.round(card.scrollHeight),
      溢出像素: 溢出,
      overflow: cs.overflow,
      面板底在卡片内: fr.bottom <= cr.bottom + 1,
      页脚能命中: !!hit && !!hit.closest('.archive-ai-panel'),
      面板总高: Math.round(document.querySelector('.archive-ai-panel').getBoundingClientRect().height),
    };
  })()`)
  ok('AI 面板与卡片', clip)
  assert.ok(clip.溢出像素 <= 1, `AI 面板被卡片裁掉了 ${clip.溢出像素}px —— 用户看不到，也点不到`)
  assert.ok(clip.面板底在卡片内, '卡片应该跟着内容长高，把 AI 面板整个包住')
  assert.ok(clip.页脚能命中, 'AI 面板的最后一行应该能被点到（说明它真的在页面上，不是被裁剪的残影）')
  // AI 推荐位那颗缩略图必须走 **ItemArt**（商品图统一出口）。
  // 之前直接塞 FlipImage：「今日特调」既没有 image 也没有 imageReal，会退回一个通用同心圆占位，
  // 60×80 看着就是个「◎」，像坏图 —— 断言这里不许出现那种兜底占位。
  const thumb = await evaluate(`(() => {
    const t = document.querySelector('.ai-thumb');
    if (!t) return { 存在: false };
    const r = t.getBoundingClientRect();
    const img = t.querySelector('img');
    return {
      存在: true,
      盒子: [Math.round(r.width), Math.round(r.height)],
      有img: !!img,
      img已加载: !!img && img.complete && img.naturalWidth > 0,
      有手绘SVG: !!t.querySelector('svg'),
      通用占位: !!t.querySelector('.flip-emoji, .product-art-placeholder'),
      名字: document.querySelector('.ai-recommendation-info strong')?.innerText,
    };
  })()`)
  ok('AI 推荐位缩略图', thumb)
  assert.ok(thumb.存在, 'AI 面板里应该有推荐位')
  assert.ok(thumb.有img || thumb.有手绘SVG, '推荐位应该有真图或手绘图，不能是空的')
  assert.ok(!thumb.通用占位, '推荐位不该出现那个通用圆圈 / emoji 占位 —— 那是「既没图也没手绘」的兜底')
  await shot('02_AI面板')

  console.log('\n[6] 照片墙：手账里的照片在这里也看得到')
  const wall = await evaluate(`(() => {
    const cells = Array.from(document.querySelectorAll('.aw-cell'));
    const first = cells[0];
    const img = first?.querySelector('img');
    return {
      张数: cells.length,
      计数文案: document.querySelector('.aw-count')?.innerText,
      第一张已加载: !!img && img.complete && img.naturalWidth > 0,
      第一张尺寸: img ? [img.naturalWidth, img.naturalHeight] : null,
      日期标签: first?.querySelector('.aw-cell-date')?.innerText,
      示例图收起了吗: !document.querySelector('.archive-example'),
    };
  })()`)
  ok('照片墙', wall)
  assert.equal(wall.张数, 1, '墙上应该出现刚存的那一张')
  assert.ok(wall.第一张已加载, '缩略图应该真的加载出来')
  assert.ok(wall.示例图收起了吗, '已经有照片了就不该再占着示例图')
  // 墙面本身要滚到能看见才好截图（截图是视口截图，不是整页）
  await evaluate(`document.querySelector('.aw').scrollIntoView({ block: 'start' })`)
  await evaluate('new Promise(r => setTimeout(r, 400))')
  await shot('02b_照片墙')

  console.log('\n[7] 点开 → 先是大图，再点一下才出备注')
  await click('.aw-cell')
  await waitFor(`document.querySelector('.jh-detail.is-peek')`)
  await waitFor(`(() => { const i = document.querySelector('.jh-peek-tap img'); return i && i.complete && i.naturalWidth > 400 })()`, 15000)
  const peek = await evaluate(`(() => {
    const i = document.querySelector('.jh-peek-tap img');
    const panel = document.querySelector('.jh-peek');
    const bg = getComputedStyle(panel).backgroundColor;
    return {
      大图尺寸: [i.naturalWidth, i.naturalHeight],
      来源: i.src.startsWith('blob:') ? 'IndexedDB(blob)' : 'dataURL',
      这一步还没有备注卡: !document.querySelector('.jh-detail-panel'),
      这一层的底色: bg,
      // 半透明的话底下的页面会透上来 —— 顶部标题和底部提示都会和背景文字叠在一起
      底色不透明: !/rgba\\([^)]*,\\s*0?\\.\\d+\\)/.test(bg) && bg !== 'rgba(0, 0, 0, 0)',
      照片占宽比: Math.round(i.getBoundingClientRect().width / panel.getBoundingClientRect().width * 100) + '%',
    };
  })()`)
  ok('第一步 · 只看图', peek)
  assert.equal(peek.来源, 'IndexedDB(blob)', '大图应该从 IndexedDB 读回来')
  assert.ok(peek.这一步还没有备注卡, '先只给看照片，备注要再点一下才出来')
  assert.ok(peek.底色不透明, `大图那一层必须不透明，否则底下的页面会透上来，实际 ${peek.这一层的底色}`)
  await shot('03_点开大图')

  await click('button.jh-peek-tap')
  await waitFor(`document.querySelector('.jh-detail-panel')`)
  await evaluate('new Promise(r => setTimeout(r, 700))')
  const card1 = await evaluate(`(() => ({
    标题: document.querySelector('.jh-detail-top > span')?.innerText,
    可编辑字段: Array.from(document.querySelectorAll('.jh-detail-row.is-input input')).map(i => i.getAttribute('aria-label')),
    心情选项: Array.from(document.querySelectorAll('.jh-detail-chip')).length,
    有AI区: !!document.querySelector('.jh-detail-ai'),
    AI标签: Array.from(document.querySelectorAll('.jh-detail-ai-tag')).map(t => t.innerText),
    AI小记: document.querySelector('.jh-detail-ai-note')?.innerText || null,
  }))()`)
  ok('第二步 · 备注卡', card1)
  assert.deepEqual(
    card1.可编辑字段.slice().sort(),
    ['为什么想吃它', '在哪家买的', '和谁一起', '这一份叫什么', '热量'].sort(),
    '备注卡应该能填这五格'
  )
  assert.equal(card1.心情选项, 6, '这一张的心情应该有 6 个选项')
  await shot('04_备注卡')

  console.log('\n[8] 填进去 → 刷新 → 字还在（而且手账那边也看得到）')
  await evaluate(`(() => {
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const byLabel = (l) => Array.from(document.querySelectorAll('.jh-detail-row.is-input input')).find(i => i.getAttribute('aria-label') === l);
    set(byLabel('这一份叫什么'), '窗边的抹茶拿铁');
    set(byLabel('在哪家买的'), '转角咖啡');
    set(byLabel('为什么想吃它'), '不饿，但想把这半小时留下来');
    set(byLabel('和谁一起'), '一个人');
    set(byLabel('热量'), '约 180');
    // 这一张的心情点第 2 个（「还不错」）
    document.querySelectorAll('.jh-detail-chip')[1].click();
  })()`)
  await click('.jh-detail-ok')
  await waitFor(`!document.querySelector('.jh-detail')`)

  await send('Page.reload')
  await waitFor('document.readyState === "complete" && document.body.innerText.trim().length > 20')
  await gotoArchive()
  await click('.aw-cell')
  await waitFor(`document.querySelector('.jh-detail.is-peek')`)
  await click('button.jh-peek-tap')
  await waitFor(`document.querySelector('.jh-detail-panel')`)
  await evaluate('new Promise(r => setTimeout(r, 600))')
  const persisted = await evaluate(`(() => {
    const byLabel = (l) => Array.from(document.querySelectorAll('.jh-detail-row.is-input input')).find(i => i.getAttribute('aria-label') === l);
    return {
      名字: byLabel('这一份叫什么')?.value,
      店名: byLabel('在哪家买的')?.value,
      为什么: byLabel('为什么想吃它')?.value,
      和谁: byLabel('和谁一起')?.value,
      热量: byLabel('热量')?.value,
      心情选中: Array.from(document.querySelectorAll('.jh-detail-chip.is-on')).map(b => b.innerText),
      日期行: document.querySelector('.jh-detail-row span')?.innerText,
      有AI区: !!document.querySelector('.jh-detail-ai'),
    };
  })()`)
  ok('刷新后 · 备注卡', persisted)
  assert.equal(persisted.名字, '窗边的抹茶拿铁', '名字要落盘')
  assert.equal(persisted.店名, '转角咖啡', '店名要落盘')
  assert.equal(persisted.为什么, '不饿，但想把这半小时留下来', '「为什么想吃它」要落盘')
  assert.equal(persisted.和谁, '一个人', '「和谁一起」要落盘')
  assert.equal(persisted.热量, '约 180', '热量要落盘')
  assert.deepEqual(persisted.心情选中, ['还不错'], '这一张的心情要落盘')
  assert.ok(/年.*月.*日/.test(persisted.日期行 || ''), '日期应该照常显示')
  assert.ok(persisted.有AI区, '上传时 AI 写下的东西也该跟着这一笔留下来')

  await click('.jh-detail-top button')
  await waitFor(`!document.querySelector('.jh-detail')`)

  console.log('\n[9] 联动：切到食物手账，同一笔在那里')
  await click('.archive-tabs button:nth-child(2)')
  await waitFor(`document.querySelector('.jh')`)
  await click('.jh-dock button:nth-child(3)') // 今天
  await waitFor(`document.querySelector('.jh-line')`)
  const journalSide = await evaluate(`(() => {
    const line = document.querySelector('.jh-line');
    const img = line?.querySelector('.jh-line-art img');
    return {
      名字: line?.querySelector('.jh-line-name')?.innerText,
      副行: line?.querySelector('.jh-line-sub')?.innerText,
      是贴纸照片: !!line?.querySelector('.jh-sticker.is-photo'),
      缩略图已加载: !!img && img.complete && img.naturalWidth > 0,
    };
  })()`)
  ok('手账侧看到的同一笔', journalSide)
  assert.equal(journalSide.名字, '窗边的抹茶拿铁', '手账里应该看到同一个名字 —— 两边是同一套数据')
  assert.ok(journalSide.是贴纸照片 && journalSide.缩略图已加载, '手账里也该有这张照片')

  console.log('\n[10] 备注卡回到手账那边也是同一个（两边共用组件）')
  await click('.jh-line')
  await waitFor(`document.querySelector('.jh-detail-panel')`)
  const shared = await evaluate(`(() => ({
    可编辑字段: Array.from(document.querySelectorAll('.jh-detail-row.is-input input')).map(i => i.getAttribute('aria-label')),
    心情: Array.from(document.querySelectorAll('.jh-detail-chip.is-on')).map(b => b.innerText),
    热量值: Array.from(document.querySelectorAll('.jh-detail-row.is-input input')).find(i => i.getAttribute('aria-label') === '热量')?.value,
  }))()`)
  ok('手账里打开的备注卡', shared)
  assert.deepEqual(shared.可编辑字段.slice().sort(), ['为什么想吃它', '在哪家买的', '和谁一起', '这一份叫什么', '热量'].sort(), '两边必须是同一个组件')
  assert.equal(shared.热量值, '约 180', '手账那边读到的是同一份数据')
  await shot('05_手账侧同一笔')
  await click('.jh-detail-top button')
  await waitFor(`!document.querySelector('.jh-detail')`)

  console.log('\n[11] 删掉这一笔 —— 照片也要跟着走（不能留孤儿图在 IndexedDB 里）')
  // 为什么值得单独验：照片原图在 IndexedDB，条目在 localStorage，**两个地方、两把钥匙**。
  // 只删条目不删图 → 用户以为清干净了，相册里却越堆越多，而那条数据在 UI 上根本没有入口能再删一次。
  await click('.jh-line')
  await waitFor(`document.querySelector('.jh-detail-panel')`)
  await waitFor(`document.querySelector('.jh-detail-del')`)
  // ⚠️ 别在 `el.click()` 之后**同一 tick** 里读文案 —— React 的状态更新是异步的，
  //    那一瞬间读到的还是旧文案，看起来像「点了没反应 / 直接删了」，其实只是探针读早了。
  //    等就等确认态自己长出来（`.is-armed`），别 sleep 一个魔法数字。
  const before = await evaluate(`document.querySelector('.jh-detail-del')?.innerText`)
  await click('.jh-detail-del')
  await waitFor(`document.querySelector('.jh-detail-del.is-armed')`, 3000)
  const arm = {
    点之前: before,
    点之后: await evaluate(`document.querySelector('.jh-detail-del')?.innerText`),
    条目还在: await evaluate(`!!document.querySelector('.jh-line')`),
  }
  ok('第一次点只是「上膛」', arm)
  assert.notEqual(arm.点之后, arm.点之前, '第一次点要变成「再点一下」的确认态，不该直接删')
  assert.equal(
    await evaluate(`(() => !!document.querySelector('.jh-line'))()`),
    true,
    '还没确认的时候，这一笔必须还在',
  )

  await click('.jh-detail-del')
  await waitFor(`!document.querySelector('.jh-line')`)
  const afterDelete = await evaluate(`new Promise((resolve) => {
    const raw = localStorage.getItem('soft-life-journal-v1') || '{"days":{}}';
    const j = JSON.parse(raw);
    const 条目 = Object.values(j.days || {}).reduce((n, d) => n + (d.items || []).length, 0);
    const req = indexedDB.open('soft-life-photo-v1', 1);
    req.onsuccess = () => {
      const t = req.result.transaction('photos', 'readonly').objectStore('photos');
      const all = t.getAll();
      t.transaction.oncomplete = () => resolve({
        手账笔数: 条目,
        IndexedDB剩余张数: all.result.length,
        残留缩略图: /data:image\\/[a-z]+;base64,/.test(raw),
      });
    };
    req.onerror = () => resolve({ 手账笔数: 条目, IndexedDB剩余张数: -1 });
  })`)
  ok('删除之后', afterDelete)
  assert.equal(afterDelete.手账笔数, 0, '这一笔该从手账里消失（照片墙也读它）')
  assert.equal(afterDelete.IndexedDB剩余张数, 0, '原图也该一起删掉 —— 不然相册里会堆满没人认领的孤儿图')
  assert.ok(!afterDelete.残留缩略图, 'localStorage 里也不该留着那张缩略图')

  console.log('\n[12] 体检')
  await evaluate('document.fonts.ready.then(() => true)')
  await waitFor('Array.from(document.images).every(i => i.complete || !i.src)')
  const health = await evaluate(`({
    破图: Array.from(document.images).filter(i => i.complete && i.src && i.naturalWidth === 0).map(i => i.src).slice(0, 5),
    图总数: document.images.length,
    横向溢出: document.documentElement.scrollWidth > innerWidth,
    有emoji: /[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(document.body.innerText),
  })`)
  ok('体检', health)
  assert.equal(health.破图.length, 0, '不该有破图')

  console.log('\n控制台报错:', errors)
  console.log('失败请求:', failedResponses)
  if (errors.length) throw new Error(`控制台有 ${errors.length} 条报错`)
  if (failedResponses.length) throw new Error(`有 ${failedResponses.length} 个请求失败`)
  if (health.横向溢出) throw new Error('页面横向溢出了')
  console.log('\n✅ 全绿：上传 → 两边同一套数据 → 点开两步 → 备注落盘 → 刷新还在')
} catch (error) {
  console.error('\n❌ 验收失败:', error.message)
  process.exitCode = 1
} finally {
  if (contextId) await send('Target.disposeBrowserContext', { browserContextId: contextId }, null).catch(() => {})
  socket.close()
  for (const request of pending.values()) clearTimeout(request.timer)
}
