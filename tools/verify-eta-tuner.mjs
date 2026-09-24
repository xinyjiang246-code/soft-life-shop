// 验收「这一单等多久」调时器（2026-09-24）：
//   ① 调时器 = 等待页那个 stepper（−/＋/🎲）。它默认等于抬头那句「预计 X 分钟」——
//      两个数必须是同一个，不然用户看到两个说法。
//   ② −/＋ 一次动一分钟，端点 1 / 60 分要**卡住**（按钮 disabled），不能越界。
//   ③ 🎲 摇的时候数字要真的在跳（它只是个 90ms 的 roll），摇完要落在 10~55 分。
//   ④ 等满那一下是**整页**左右摇（像番茄钟），不是只摇抬头区 —— 放下手机的人
//      瞟一眼也要看得出「到了」。摇完 900ms 才翻到结局页。
//   ⑤ 减弱动态偏好下这些动画必须全停（红线：不许跟系统设置对着干）。
//
// ⚠️ 场景 2 用 soft-life-wait-override-v1（**验收脚本专用**的注入通道，产品代码从不写它）
//    把这一单压到 8 秒，好把「等满 → 整页摇」这条完整走一遍。
//    副作用：这个键让等待长于 1 分钟才算正常，8 秒会让调时器显示「0 分」—— 仅验收场景如此。
//
// 用法：node tools/verify-eta-tuner.mjs [url] [截图前缀]
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const url = process.argv[2] || 'http://127.0.0.1:8080/'
const prefix = process.argv[3] || 'eta-tuner'
const workDir = `/tmp/${prefix}`
await mkdir(workDir, { recursive: true })

const version = await fetch('http://127.0.0.1:9222/json/version').then((r) => r.json())
const socket = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  socket.addEventListener('open', res, { once: true })
  socket.addEventListener('error', rej, { once: true })
})

let nextId = 0
const pending = new Map()
const errors = []
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
const tick = (ms = 120) => js(`new Promise(r => setTimeout(r, ${ms}))`)
const results = []
const ok = (label, value) => { results.push(label); console.log('  ✓', label, '=', JSON.stringify(value)) }
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`${workDir}/${name}.png`, Buffer.from(r.data, 'base64'))
}

/** 开一个干净的页面（每个场景一个 context，localStorage 互不污染） */
async function openPage(inject) {
  const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true }, null)
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId }, null)
  sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 2, mobile: true })
  if (inject) await send('Page.addScriptToEvaluateOnNewDocument', { source: inject })
  await send('Page.navigate', { url })
  await waitFor(`document.querySelector('.home-page')`)
  await js(`localStorage.clear()`)
  // 第二次导航：addScriptToEvaluateOnNewDocument 再跑一遍，override 重新落进 localStorage
  await send('Page.navigate', { url })
  await waitFor(`document.querySelector('.home-page')`)
  await js(`document.fonts.ready.then(() => true)`)
}

/** 走一单到配送页（含 2026-09-22 起插在结算与配送之间的模拟支付仪式）。返回抬头的「预计 X 分钟」。 */
async function orderToDelivery() {
  await waitFor(`document.querySelectorAll('.shop-row').length > 0`)
  await js(`document.querySelector('.shop-row').click()`)
  await waitFor(`document.querySelectorAll('.add-button').length > 0`)
  await js(`[...document.querySelectorAll('.add-button')].slice(0, 2).forEach(b => b.click())`)
  // 规格商品点 + 只是展开，等 .spec-add 渲染出来再点一遍（红线 14）
  await tick(150)
  await js(`[...document.querySelectorAll('.spec-add')].forEach(b => b.click())`)
  await waitFor(`document.querySelector('.bag-button')`)
  await js(`document.querySelector('.bag-button').click()`)
  await waitFor(`[...document.querySelectorAll('button')].some(x => /去结账|结算|下单/.test(x.textContent))`)
  await js(clickText('/去结账|结算|下单/'))
  await waitFor(`[...document.querySelectorAll('button')].some(x => /确认|下单|提交/.test(x.textContent))`)
  await js(clickText('/确认|下单|提交/'))
  // 支付仪式：选方式 → 确认 → 6 位密码。
  // ⚠️ 密码键要一下一下点：pressDigit 闭包里的 pin 不含未重渲染的新值，同步连点只记 1 位（红线 17）。
  await waitFor(`document.querySelector('.pay-confirm')`, 15000)
  await js(`document.querySelector('.pay-confirm').click()`)
  await waitFor(`document.querySelectorAll('.pay-key').length > 0`, 15000)
  for (let i = 0; i < 6; i++) {
    await js(`(() => { const ks = [...document.querySelectorAll('.pay-key')].filter(k => !k.classList.contains('blank')); ks[0] && ks[0].click() })()`)
    await tick(160)
  }
  await waitFor(`document.querySelector('.delivery-hero h1')`, 20000)
  let eta = null
  for (let i = 0; i < 40 && eta === null; i++) {
    eta = await js(`(() => {
      const m = /预计\\s*(\\d+)\\s*分钟/.exec(document.querySelector('.delivery-hero h1')?.innerText || '');
      return m ? Number(m[1]) : null;
    })()`)
    if (eta === null) await tick(150)
  }
  assert.ok(eta, '配送页抬头上没有「预计 X 分钟」—— 调时器的默认值就没得比对了')
  return eta
}

const tunerState = (expr = '') => js(`(() => {
  const t = document.querySelector('.eta-tuner'); ${expr}
  if (!t) return null;
  const btns = [...t.querySelectorAll('.eta-tuner-btn')];
  const val = t.querySelector('.eta-tuner-val');
  return {
    标签: t.querySelector('.eta-tuner-label')?.innerText.trim(),
    值: val?.innerText.trim(),
    分钟: Number((val?.innerText || '').replace(/\\D/g, '')),
    减禁用: !!btns[0]?.disabled,
    加禁用: !!btns[1]?.disabled,
    骰子文案: btns[btns.length - 1]?.innerText.trim(),
    骰子转着: btns[btns.length - 1]?.classList.contains('is-rolling'),
    数字在跳: val?.classList.contains('is-rolling'),
  };
})()`)

/** 点第 idx 个调时器按钮（0=减 1=加 2=骰子） */
const tapTuner = (idx) => js(`(() => {
  const b = document.querySelectorAll('.eta-tuner-btn')[${idx}];
  if (!b || b.disabled) return false; b.click(); return true;
})()`)

// ══ 场景 1：真实时长（35 分钟那档）—— −/＋ 与 🎲 ═══════════════════════════
try {
  console.log('\n[1] 调时器默认值 / −＋ / 🎲')
  await openPage()
  const eta = await orderToDelivery()
  await waitFor(`document.querySelector('.eta-tuner')`, 30000) // 预演 4×3s 走完才出现
  await js(`document.querySelector('.eta-tuner').scrollIntoView({ block: 'center' })`)
  await tick(300)

  const init = await tunerState()
  assert.ok(init, '等待页上没有 .eta-tuner —— 调时器根本没渲染')
  assert.equal(init.标签, '这一单等多久', `调时器的说话不对：${init.标签}`)
  assert.equal(init.分钟, eta, `调时器默认 ${init.分钟} 分，抬头写「预计 ${eta} 分钟」—— 同一单两个数`)
  ok('默认值 = 抬头预计', `${init.分钟} 分`)
  ok('🎲 就在 stepper 里', init.骰子文案)

  // 触摸目标：36px 的圆（和「32 分」那颗数字按钮）靠 ::before 撑到 44px（DESIGN.md 下限）。
  // 验法是真去「点边缘外 3px」—— 命中区不是撑给自己看的。
  const hitArea = await js(`(() => {
    const btns = [...document.querySelectorAll('.eta-tuner-btn, .eta-tuner-val')];
    return btns.map((b) => {
      const r = b.getBoundingClientRect();
      const hit = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return { ok: !!el && (el === b || b.contains(el)), 落点: el ? el.className + '|' + el.tagName : null, 坐标: [Math.round(x), Math.round(y)] };
      };
      const bf = getComputedStyle(b, '::before');
      return {
        视觉: Math.round(r.width),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        视口: [innerWidth, innerHeight],
        宿主position: getComputedStyle(b).position,
        伪元素: { position: bf.position, inset: bf.inset, w: bf.width, h: bf.height, content: bf.content },
        左缘外3px: hit(r.left - 3, r.top + r.height / 2),
        右缘外3px: hit(r.right + 3, r.top + r.height / 2),
      };
    });
  })()`)
  assert.equal(hitArea.length, 4, `调时器该有 4 个可点的东西（−/＋/🎲/数字），现在 ${hitArea.length} 个`)
  const miss = hitArea
    .map((h, i) => ({ 第几个: i + 1, ...h }))
    .filter((h) => !h.左缘外3px.ok || !h.右缘外3px.ok)
  assert.ok(
    !miss.length,
    `命中区没撑到 44px：${JSON.stringify(miss.map((m) => ({ 第几个: m.第几个, 视觉: m.视觉, 伪元素: m.伪元素.w, 左缘外3px落到: m.左缘外3px.落点, 右缘外3px落到: m.右缘外3px.落点 })))}`,
  )
  ok('触摸目标 ≥44px', hitArea.map((h) => `${h.视觉}+伪元素${h.伪元素.w}`).join(' / '))

  // ＋ 一次 → +1 分
  assert.ok(await tapTuner(1), '「＋」点不动（初始就被禁用？）')
  await tick(150)
  const afterPlus = await tunerState()
  assert.equal(afterPlus.分钟, eta + 1, `＋ 一次应该 +1 分，现在 ${afterPlus.分钟}`)
  ok('＋ 一次', `${eta} → ${afterPlus.分钟} 分`)

  // − 两次 → 回到 eta-1
  await tapTuner(0); await tick(120)
  await tapTuner(0); await tick(150)
  const afterMinus = await tunerState()
  assert.equal(afterMinus.分钟, eta - 1, `− 两次应该到 ${eta - 1} 分，现在 ${afterMinus.分钟}`)
  ok('− 两次', `${afterPlus.分钟} → ${afterMinus.分钟} 分`)

  // 一直 − 到端点：必须停在 1 分，且「−」自己禁用（不越界）
  let guard = 0
  while (await tapTuner(0)) {
    await tick(60)
    if (++guard > 70) throw new Error('连点「−」70 次还没到端点 —— 下限没卡住')
  }
  const floor = await tunerState()
  assert.equal(floor.分钟, 1, `下限应该是 1 分，现在停在 ${floor.分钟} 分`)
  assert.equal(floor.减禁用, true, '到 1 分后「−」还亮着，能点出 0 分甚至负数')
  ok('下限卡在 1 分', `− 已禁用=${floor.减禁用}`)

  // ＋ 一次能回来，端点不是死锁
  assert.ok(await tapTuner(1), '在 1 分时「＋」点不动 —— 端点死锁了')
  await tick(150)
  const back = await tunerState()
  assert.equal(back.分钟, 2, `1 分时 ＋ 应该到 2 分，现在 ${back.分钟}`)
  assert.equal(back.减禁用, false, '离开端点后「−」应该恢复可用')
  ok('端点可回退', `2 分，− 可用=${!back.减禁用}`)

  // 🎲：摇的时候数字在跳 + 骰子转 + 落点 10~55
  await js(`(() => {
    window.__roll = { seen: [], rolling: false, valRolling: false };
    window.__rollStop = window.setInterval(() => {
      const v = document.querySelector('.eta-tuner-val');
      const d = document.querySelector('.eta-tuner-btn.is-dice');
      if (v) window.__roll.seen.push(v.innerText.trim());
      if (d?.classList.contains('is-rolling')) window.__roll.rolling = true;
      if (v?.classList.contains('is-rolling')) window.__roll.valRolling = true;
    }, 25);
  })()`)
  assert.ok(await tapTuner(2), '「🎲」点不动')
  await tick(1000)
  const roll = await js(`(() => {
    clearInterval(window.__rollStop);
    const el = document.querySelector('.eta-tuner-val');
    return { ...window.__roll, 唯一值: [...new Set(window.__roll.seen)], 落点: Number((el?.innerText || '').replace(/\\D/g, '')) };
  })()`)
  assert.ok(roll.rolling, '🎲 按下去 `.is-dice.is-rolling` 从没出现过 —— diceSpin 那个动画没挂上')
  assert.ok(roll.valRolling, '摇的时候数字没有 `.is-rolling` —— 数字不会跳')
  assert.ok(roll.唯一值.length >= 2, `摇的过程数字只出现过 ${roll.唯一值.length} 种值，根本没在跳：${roll.唯一值}`)
  assert.ok(roll.落点 >= 10 && roll.落点 <= 55, `🎲 落在 ${roll.落点} 分 —— 该是 10~55 之间`)
  ok('🎲 摇动', `过程中 ${roll.唯一值.length} 种值 → 落在 ${roll.落点} 分`)

  // ── 拉条：拖到哪 = 这一单等多久（2026-09-24 用户：「拖动拉条这种」）────────
  const track = await js(`(() => {
    const t = document.querySelector('.eta-track');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return {
      类型: t.type, 下限: t.min, 上限: t.max, 当前: t.value,
      宽: Math.round(r.width), 高: Math.round(r.height),
      已骑段: getComputedStyle(t).getPropertyValue('--elapsed').trim(),
      总长段: getComputedStyle(t).getPropertyValue('--total').trim(),
    };
  })()`)
  assert.ok(track, '等待页上没有 .eta-track —— 拉条没渲染（进度线没换成可拖的）')
  assert.equal(track.类型, 'range', `拉条不是 range（${track.类型}）—— 拖不动`)
  assert.deepEqual([track.下限, track.上限], ['1', '60'], `拉条范围该是 1-60，现在 ${track.下限}-${track.上限}`)
  assert.ok(track.高 >= 44, `拉条可点高度只有 ${track.高}px —— 手指拖不准（该 ≥44）`)
  assert.ok(track.已骑段 && track.总长段, `拉条两端的分界点没喂进去（--elapsed=${track.已骑段} --total=${track.总长段}）`)
  ok('拉条在', `range ${track.下限}-${track.上限}，${track.宽}×${track.高}px`)

  // 真去拖 —— 用原生 setter + input 事件（等价于把滑块拖过去；直接改 .value React 收不到）
  const dragTo = (v) => js(`(() => {
    const t = document.querySelector('.eta-track');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(t, '${v}');
    t.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await dragTo(45)
  await tick(220)
  const dragged = await tunerState()
  assert.equal(dragged.分钟, 45, `拖到 45 分，调时器却写 ${dragged.分钟} 分`)
  ok('拖条改时长', `→ ${dragged.分钟} 分`)

  await dragTo(2)
  await tick(220)
  const draggedLow = await tunerState()
  assert.ok(draggedLow.分钟 >= 1, `拖到 2 分后显示 ${draggedLow.分钟} —— 越界了`)
  ok('拖到很短也不越界', `${draggedLow.分钟} 分`)

  // ── 数字可以手动改（2026-09-24 用户：「时间可以直接手动修改」）────────────
  await js(`document.querySelector('.eta-tuner-val').click()`)
  await waitFor(`document.querySelector('.eta-tuner-input')`, 5000)
  const editBox = await js(`(() => {
    const i = document.querySelector('.eta-tuner-input');
    return { 类型: i.type, 下限: i.min, 上限: i.max, 值: i.value };
  })()`)
  assert.equal(editBox.类型, 'number', `点数字该变成数字输入框，现在是 ${editBox.类型}`)
  ok('点数字变输入框', `${editBox.类型} ${editBox.下限}-${editBox.上限}，现值 ${editBox.值}`)

  const typeIn = (v) => js(`(() => {
    const i = document.querySelector('.eta-tuner-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(i, '${v}');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  })()`)
  await typeIn(18)
  await tick(220)
  const typed = await tunerState()
  assert.equal(typed.分钟, 18, `手输 18 分，调时器却写 ${typed.分钟} 分`)
  ok('手输生效', '→ 18 分')

  // 越界要夹住：输 999 不该变成 999 分（16 个钟头）
  await js(`document.querySelector('.eta-tuner-val').click()`)
  await waitFor(`document.querySelector('.eta-tuner-input')`, 5000)
  await typeIn(999)
  await tick(220)
  const clamped = await tunerState()
  assert.equal(clamped.分钟, 60, `手输 999 分，结果 ${clamped.分钟} 分 —— 没夹到 60`)
  ok('手输越界夹到 60', `999 → ${clamped.分钟} 分`)

  await shot('01-tuner-waiting')

  // 减弱动态：整页摇 + 骰子转 + 数字跳，三个都得停
  const normal = await js(`(() => {
    const el = document.querySelector('.delivery-page');
    const d = document.querySelector('.eta-tuner-btn.is-dice');
    const v = document.querySelector('.eta-tuner-val');
    el.classList.add('is-arriving'); d.classList.add('is-rolling'); v.classList.add('is-rolling');
    const r = { 摇: getComputedStyle(el).animationName, 骰: getComputedStyle(d).animationName, 数: getComputedStyle(v).animationName };
    el.classList.remove('is-arriving'); d.classList.remove('is-rolling'); v.classList.remove('is-rolling');
    return r;
  })()`)
  assert.equal(normal.摇, 'arriving-shake', `等满的整页摇没挂上（animationName=${normal.摇}）`)
  assert.equal(normal.骰, 'diceSpin', `🎲 的 diceSpin 没挂上（animationName=${normal.骰}）`)
  ok('默认媒体下三个动画都在', `摇=${normal.摇} 骰=${normal.骰} 数=${normal.数}`)

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  const reduced = await js(`(() => {
    const el = document.querySelector('.delivery-page');
    const d = document.querySelector('.eta-tuner-btn.is-dice');
    const v = document.querySelector('.eta-tuner-val');
    el.classList.add('is-arriving'); d.classList.add('is-rolling'); v.classList.add('is-rolling');
    const r = { 摇: getComputedStyle(el).animationName, 骰: getComputedStyle(d).animationName, 数: getComputedStyle(v).animationName };
    el.classList.remove('is-arriving'); d.classList.remove('is-rolling'); v.classList.remove('is-rolling');
    return r;
  })()`)
  await send('Emulation.setEmulatedMedia', { features: [] })
  assert.equal(reduced.摇, 'none', `减弱动态下整页摇还在动（${reduced.摇}）`)
  assert.equal(reduced.骰, 'none', `减弱动态下骰子还在转（${reduced.骰}）`)
  assert.equal(reduced.数, 'none', `减弱动态下数字还在跳（${reduced.数}）`)
  ok('减弱动态全部停', `摇=骰=数=none`)

  // ── 定下来（2026-09-24 用户：「这里的时间如果选定了的话就不能换了」）────────
  // 这是这一单**唯一一次**机会：按下之后 ±/拖条/手输 全锁死，只留时间自己走。
  assert.ok(await js(`!!document.querySelector('.eta-lock')`), '找不到「就等这么久」按钮 —— 时间定不下来')
  const beforeLock = (await tunerState()).分钟
  await js(`document.querySelector('.eta-lock').click()`)
  await tick(260)
  const lockState = await js(`(() => {
    const t = document.querySelector('.eta-tuner');
    return {
      锁定态: t.classList.contains('is-locked'),
      按钮全禁: [...t.querySelectorAll('.eta-tuner-btn')].every((b) => b.disabled),
      数字禁用: !!document.querySelector('.eta-tuner-val')?.disabled,
      拉条禁用: !!document.querySelector('.eta-track')?.disabled,
      提示: t.querySelector('.eta-locked')?.innerText || null,
      还能锁: !!t.querySelector('.eta-lock'),
    };
  })()`)
  assert.ok(lockState.锁定态, '按下确定后 .eta-tuner 上没有 is-locked')
  assert.ok(lockState.按钮全禁, '锁定后 −/＋/🎲 还有能点的')
  assert.equal(lockState.数字禁用, true, '锁定后数字还能点开改（该锁死）')
  assert.equal(lockState.拉条禁用, true, '锁定后拉条还能拖（该锁死）')
  assert.equal(lockState.还能锁, false, '「就等这么久」还挂在上面（该换成已定提示）')
  assert.ok(lockState.提示, '锁定后没有任何「已定」的提示 —— 用户不知道到底锁上没有')
  ok('确定后锁死', `提示「${lockState.提示}」`)

  await js(`document.querySelectorAll('.eta-tuner-btn')[1].click()`)
  await tick(200)
  const afterLockClick = (await tunerState()).分钟
  assert.equal(afterLockClick, beforeLock, `锁定后点 ＋ 还能从 ${beforeLock} 变成 ${afterLockClick}`)
  ok('锁定后戳不动', `仍是 ${afterLockClick} 分`)
} catch (e) {
  console.error('\n❌ 场景 1 失败：', e.message)
  await shot('99-scene1-fail').catch(() => {})
  process.exit(1)
}

// ══ 场景 2：8 秒短等待 → 等满整页摇 → 结局页 ═══════════════════════════════
try {
  console.log('\n[2] 等满那一下：整页左右摇')
  await openPage(`(() => {
    Math.random = () => 0;                        // 天气/落点定死，断言才有确定的数
    try { localStorage.setItem('soft-life-wait-override-v1', '8') } catch {}
  })();`)
  await orderToDelivery()
  // 预演页起就挂个采样器，捕捉「等满」那一瞬的样式（进结局页前只有 900ms）
  await js(`(() => {
    window.__arrive = { seen: false, 名: null, 时长: null, 位移: [], 浮层: [] };
    window.__arriveStop = window.setInterval(() => {
      const el = document.querySelector('.delivery-page');
      if (!el || !el.classList.contains('is-arriving')) return;
      const cs = getComputedStyle(el);
      window.__arrive.seen = true;
      window.__arrive.名 = cs.animationName;
      window.__arrive.时长 = cs.animationDuration;
      window.__arrive.位移.push(cs.transform);
      // 摇动期间 .delivery-page 成了包含块：任何还活着的 fixed 子元素都会被收编成
      // 「相对整页」定位，卡片会飘出视口。到达那一刻页内不该有任何可见浮层。
      window.__arrive.浮层 = [...el.querySelectorAll('*')]
        .filter((n) => {
          if (getComputedStyle(n).position !== 'fixed') return false;
          const r = n.getBoundingClientRect();
          return r.width > 1 && r.height > 1;
        })
        .map((n) => String(n.className));
    }, 40);
  })()`)

  await waitFor(`document.querySelector('.eta-tuner')`, 30000)
  const short = await tunerState()
  // 8 秒 < 1 分钟 → 调时器下限已到，「−」该是禁用的（端点逻辑在短等待下同样成立）
  assert.equal(short.减禁用, true, `8 秒（不足 1 分）时「−」还亮着 —— 下限没卡住`)
  ok('短等待下下限照旧', `显示「${short.值}」，− 已禁用`)

  await waitFor(`document.querySelector('.ending-card')`, 40000)
  const arrive = await js(`(() => { clearInterval(window.__arriveStop); return window.__arrive })()`)
  assert.ok(arrive.seen, '等满那一瞬 `.delivery-page` 上没有 `.is-arriving` —— 整页摇没触发')
  assert.equal(arrive.名, 'arriving-shake', `等满挂的不是整页摇（animationName=${arrive.名}）`)
  assert.equal(arrive.时长, '0.95s', `整页摇的时长是 ${arrive.时长} —— 该是 0.95s（之后 900ms 翻页）`)
  assert.ok(arrive.位移.length >= 2, '整页摇期间 transform 只采到 1 个值 —— 页面其实没动')
  assert.ok(new Set(arrive.位移).size >= 2, `整页摇期间 transform 没有变化：${[...new Set(arrive.位移)]}`)
  ok('等满整页摇', `${arrive.名} ${arrive.时长}，采到 ${new Set(arrive.位移).size} 种位移`)
  assert.equal(arrive.浮层.length, 0, `摇动时页内还有可见浮层 ${JSON.stringify(arrive.浮层)} —— 整页 transform 会把它们的 fixed 收编，卡片会飘出视口`)
  ok('摇动时页内无浮层', '0 个')
  ok('摇完进结局页', 'ending-card 已出现')
} catch (e) {
  console.error('\n❌ 场景 2 失败：', e.message)
  await shot('99-scene2-fail').catch(() => {})
  process.exit(1)
}

// ══ 场景 3：开着催单卡等到 0 —— 最容易被「整页摇」坑掉的那条窄路径 ═════════
try {
  console.log('\n[3] 催单卡开着时等到 0')
  await openPage(`(() => {
    Math.random = () => 0;
    try { localStorage.setItem('soft-life-wait-override-v1', '14') } catch {}
  })();`)
  await orderToDelivery()
  await waitFor(`document.querySelector('.eta-tuner')`, 30000)
  // 打开催单卡，然后什么都不做 —— 就让它开着，等倒计时自己走到 0
  assert.ok(await js(`(() => { const b = document.querySelector('.skip-wait-button'); if (!b || b.disabled) return false; b.click(); return true })()`), '催单卡打不开（.skip-wait-button 点不动）')
  await waitFor(`document.querySelector('.exchange-backdrop')`, 8000)
  const cardOpen = await js(`(() => {
    const r = document.querySelector('.exchange-card')?.getBoundingClientRect();
    return r ? { 上: Math.round(r.top), 下: Math.round(r.bottom), 视口: innerHeight } : null;
  })()`)
  assert.ok(cardOpen, '催单卡没渲染出来')
  ok('催单卡已打开', `卡片 ${cardOpen.上}~${cardOpen.下}px（视口 ${cardOpen.视口}）`)

  await waitFor(`document.querySelector('.ending-card')`, 40000)
  const leftover = await js(`({
    遮罩还在: !!document.querySelector('.exchange-backdrop'),
    回话还在: !!document.querySelector('.exchange-reply'),
  })`)
  assert.equal(leftover.遮罩还在, false, '到达后催单卡还挂在页面上 —— 没被关掉')
  ok('到达时催单卡已收起', 'exchange-backdrop 不在 DOM 里')
  assert.ok(await js(`!!document.querySelector('.wait-receipt') || !!document.querySelector('.ending-card')`), '没进到结局页')
  ok('走到了结局页', '没有被催单卡卡住')
} catch (e) {
  console.error('\n❌ 场景 3 失败：', e.message)
  await shot('99-scene3-fail').catch(() => {})
  process.exit(1)
}

if (errors.length) {
  console.error('\n❌ 控制台有异常：', errors.slice(0, 3).join('\n'))
  process.exit(1)
}

console.log(`\n✅ ETA 调时器全部通过（${results.length} 条）；截图在 ${workDir}/`)
socket.close()
