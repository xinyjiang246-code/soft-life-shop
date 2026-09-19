// 把「等待凭证」画成一张能离开 App 的 PNG（2026-09-18）。
//
// 为什么是 Canvas 手画、而不是截 DOM：
//   项目里没有 html2canvas 这类依赖，也不该为一张小票引进来；而且「截 DOM」
//   存出来的东西经常跟看到的不是一回事（要自己处理滚动位置、DPR、字体是否已加载）。
//   凭证上只有四样东西：纸、线、字、章 —— 用 2D 画一遍，尺寸和内容完全可控。
//
// ⚠️ 三个坑（都踩过或差点踩）：
//   ① 画之前必须 await document.fonts.ready，并且**显式 load 用到的字重** ——
//      不 load 的话第一张会拿到回落的 Georgia/宋体，第二次才对，最难查。
//   ② canvas 的 `ctx.font` 简写**解析失败时静默保留上一次的字号**（不抛错）。
//      少一个引号 = 「字号看着不对但也查不出为什么」。
//   ③ 量文字和画文字必须是同一套布局代码。所以下面把「量」和「画」写成一个函数，
//      用 phase 区分（第一遍用一张 1×1 的画布量出总高，再建真画布画一遍）。

const W = 720        // 逻辑宽；输出 2x = 1440px
const SCALE = 2

const PAPER = '#FCFBF7'
const INK = '#4A4540'
const SUB = '#8D867C'
const CARAMEL = '#9F7F5F'
const LINE = 'rgba(74, 69, 64, .32)'
const SEAL = '#B4552D'

const PAD = 44       // 纸内左右留白
const EDGE = 26      // 纸边框离画布边

/** 从 :root 取字型角色变量（全站只有这一处是字体真相，别再写死字体名） */
function fontRoles() {
  const cs = getComputedStyle(document.documentElement)
  const get = (n, fb) => cs.getPropertyValue(n).trim() || fb
  return {
    serif: get('--f-serif', '"Fraunces", Georgia, serif'),
    display: get('--f-display', '"Fraunces", Georgia, serif'),
    mono: get('--f-mono', 'ui-monospace, monospace'),
    body: get('--f-body', 'sans-serif'),
    cn: get('--f-cn-serif', 'serif'),
  }
}

/** 中英混排按字断行（中文没有空格，按 word 断会整段溢出） */
function wrap(ctx, text, maxWidth) {
  const lines = []
  let cur = ''
  for (const ch of String(text)) {
    if (ch === '\n') {
      lines.push(cur)
      cur = ''
      continue
    }
    const next = cur + ch
    if (cur && ctx.measureText(next).width > maxWidth) {
      lines.push(cur)
      cur = ch
    } else {
      cur = next
    }
  }
  lines.push(cur)
  return lines
}

function setFont(ctx, roles, spec) {
  ctx.font = spec(roles)
}

/** letterSpacing 是较新的 canvas 属性 —— 不支持的浏览器上赋值会被静默忽略，先探一下 */
function setTracking(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`
}

/**
 * 同一套布局代码，两遍走：
 *   phase='measure' 只量（不画像素），返回总高与折行结果
 *   phase='paint'   真画
 * 这样「量出来的高度」和「画上去的东西」不可能对不上。
 */
function layout(ctx, data, roles, phase) {
  const inner = W - PAD * 2
  const paint = phase === 'paint'
  const text = (s, x, y, align = 'left') => {
    if (!paint) return
    ctx.textAlign = align
    ctx.fillText(s, x, y)
  }

  let y = EDGE + 30

  // ---- 抬头：店号 + 编号 ----
  ctx.fillStyle = INK
  setFont(ctx, roles, (r) => `400 17px ${r.mono}`)
  if (paint) setTracking(ctx, 2.5)
  text('慢活小铺 · 等待凭证', PAD, y)
  if (paint) setTracking(ctx, 1.5)
  text(`NO. ${data.no}`, W - PAD, y, 'right')
  if (paint) setTracking(ctx, 0)

  y += 24
  ctx.fillStyle = SUB
  setFont(ctx, roles, (r) => `400 12.5px ${r.mono}`)
  text(data.dateLine, PAD, y)

  // ---- 实线 ----
  y += 14
  if (paint) {
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, y + .5)
    ctx.lineTo(W - PAD, y + .5)
    ctx.stroke()
  }
  y += 30

  // ---- 现在这一块：等了多少 ----
  const bigSize = 148
  setFont(ctx, roles, (r) => `600 ${bigSize}px ${r.serif}`)
  const numW = ctx.measureText(String(data.minutes)).width
  setFont(ctx, roles, (r) => `400 22px ${r.cn}`)
  const unitW = ctx.measureText('分钟').width
  const gap = 12
  const blockW = numW + gap + unitW
  const left = (W - blockW) / 2

  const bigBase = y + bigSize * 0.76
  if (paint) {
    ctx.fillStyle = INK
    ctx.font = `600 ${bigSize}px ${roles.serif}`
    ctx.textAlign = 'left'
    ctx.fillText(String(data.minutes), left, bigBase)
    ctx.fillStyle = CARAMEL
    ctx.font = `400 22px ${roles.cn}`
    ctx.fillText('分钟', left + numW + gap, bigBase)
  }
  y = y + bigSize * 0.76 + 34

  if (paint) {
    ctx.fillStyle = SUB
    ctx.font = `400 19px ${roles.cn}`
    ctx.textAlign = 'center'
    ctx.fillText(data.note, W / 2, y)
  }
  y += 24

  // ---- 条目 ----
  if (paint) {
    ctx.strokeStyle = LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, y + .5)
    ctx.lineTo(W - PAD, y + .5)
    ctx.stroke()
  }
  y += 30

  const ROW_H = 44
  for (const row of data.rows) {
    const base = y + 15
    if (paint) {
      ctx.fillStyle = SUB
      ctx.font = `400 14px ${roles.mono}`
      ctx.textAlign = 'left'
      ctx.fillText(row.label, PAD, base)

      ctx.fillStyle = INK
      ctx.font = `400 17px ${roles.body}`
      ctx.textAlign = 'right'
      ctx.fillText(row.value, W - PAD, base)

      // 引导点：把左右拉到一起，才像一张单子（点太多会脏，只在中段铺）
      const lw = ctx.measureText(row.value).width
      const startX = PAD + ctx.measureText(row.label).width + 14
      const endX = W - PAD - lw - 14
      if (endX - startX > 24) {
        ctx.save()
        ctx.strokeStyle = 'rgba(141, 134, 124, .5)'
        ctx.lineWidth = 1
        ctx.setLineDash([1.5, 5])
        ctx.beginPath()
        ctx.moveTo(startX, base - 4)
        ctx.lineTo(endX, base - 4)
        ctx.stroke()
        ctx.restore()
      }
    }
    y += ROW_H
  }

  // ---- 小字（诚实那一条）----
  y += 8
  setFont(ctx, roles, (r) => `400 12.5px ${r.cn}`)
  const fineLines = wrap(ctx, data.fine, inner)
  if (paint) {
    ctx.fillStyle = SUB
    ctx.font = `400 12.5px ${roles.cn}`
    ctx.textAlign = 'left'
    fineLines.forEach((l, i) => ctx.fillText(l, PAD, y + i * 20))
  }
  y += fineLines.length * 20 + 20

  // ---- 撕口：一把小剪刀 + 虚线（跟屏幕上那张纸同一个位置关系）----
  // 剪刀用几何画，**不要**用 '✂' 字符 —— 那个码位在 Chrome 里会渲染成彩色 emoji，
  // 跟这张纸的墨色不是一路（项目里也是禁 emoji 的）。
  if (paint) {
    const cx = PAD + 8
    ctx.save()
    ctx.strokeStyle = 'rgba(141, 134, 124, .9)'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.arc(cx - 2.6, y + 3.4, 2.6, 0, Math.PI * 2)   // 两个指环
    ctx.moveTo(cx + 2.6 + 2.6, y + 3.4)
    ctx.arc(cx + 2.6, y + 3.4, 2.6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()                                   // 两片刃在中间交叉
    ctx.moveTo(cx - 1.4, y + 1.2)
    ctx.lineTo(cx + 5.4, y - 6.4)
    ctx.moveTo(cx + 1.4, y + 1.2)
    ctx.lineTo(cx - 5.4, y - 6.4)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(74, 69, 64, .22)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 7])
    ctx.beginPath()
    ctx.moveTo(PAD + 24, y + .5)
    ctx.lineTo(W - PAD, y + .5)
    ctx.stroke()
    ctx.restore()
  }
  y += 34

  // ---- 那一句（重音 + 中文）----
  if (paint) {
    ctx.fillStyle = CARAMEL
    ctx.font = `italic 800 31px ${roles.display}`
    ctx.textAlign = 'center'
    ctx.fillText(data.accent, W / 2, y + 24)
  }
  y += 24 + 26

  setFont(ctx, roles, (r) => `600 21px ${r.cn}`)
  const quoteLines = wrap(ctx, data.quote, inner - 30)
  if (paint) {
    ctx.fillStyle = INK
    ctx.font = `600 21px ${roles.cn}`
    ctx.textAlign = 'center'
    quoteLines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * 32))
  }
  y += quoteLines.length * 32

  // ---- 印章 ----
  const S = 92
  const cx = W - 62
  const cy = y + 6 + S / 2
  if (paint) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((-7 * Math.PI) / 180)
    ctx.globalAlpha = 0.92
    ctx.strokeStyle = SEAL
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-S / 2, -S / 2, S, S, 6); ctx.stroke() }
    else ctx.strokeRect(-S / 2, -S / 2, S, S)
    ctx.lineWidth = 1
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(-S / 2 + 5, -S / 2 + 5, S - 10, S - 10, 4); ctx.stroke() }
    else ctx.strokeRect(-S / 2 + 5, -S / 2 + 5, S - 10, S - 10)
    ctx.fillStyle = SEAL
    ctx.font = `600 23px ${roles.cn}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    setTracking(ctx, 3)
    ctx.fillText(data.seal, 0, 1)
    ctx.restore()
  }
  y = cy + S / 2 + 8

  return { height: Math.ceil(y + EDGE), fineLines, quoteLines }
}

/** 画一张凭证，返回 canvas（2x 输出，可直接 toBlob） */
export async function renderReceiptCanvas(data) {
  const roles = fontRoles()
  await readyFonts(roles)

  const measureCanvas = document.createElement('canvas')
  measureCanvas.width = measureCanvas.height = 1
  const mctx = measureCanvas.getContext('2d')
  const { height } = layout(mctx, data, roles, 'measure')

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)

  // 纸：底色 + 1px 印刷实线（跟屏幕上那张纸同一个规矩）
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, height)
  ctx.strokeStyle = LINE
  ctx.lineWidth = 1
  ctx.strokeRect(EDGE + .5, EDGE + .5, W - EDGE * 2 - 1, height - EDGE * 2 - 1)

  layout(ctx, data, roles, 'paint')
  return canvas
}

async function readyFonts(roles) {
  if (!document.fonts?.load) return
  const specs = [
    `400 17px ${roles.mono}`,
    `italic 800 31px ${roles.display}`,
    `600 148px ${roles.serif}`,
    `400 17px ${roles.body}`,
  ]
  await Promise.all(specs.map((s) => document.fonts.load(s).catch(() => null)))
  await document.fonts.ready
}

export function receiptFileName(data) {
  return `慢活小铺_等待凭证_${data.no}.png`
}

/**
 * 存成图片。返回 { width, height, bytes } —— 调用方只需要知道成没成。
 * ⚠️ 非 Chinese 文件名在部分系统会被改写，但 download 属性仍是给用户看的那个名字。
 */
export async function saveReceiptImage(data) {
  const canvas = await renderReceiptCanvas(data)
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('这张纸没能画出来')
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = receiptFileName(data)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return { width: canvas.width, height: canvas.height, bytes: blob.size }
}
