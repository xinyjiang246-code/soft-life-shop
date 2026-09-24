/**
 * 管理页 UI 端到端验证（Chrome + CDP，零依赖）。
 *
 * 为什么需要它：接口层过了不等于界面能跑。
 * 一个 import 写错、一个 hook 用错，页面就会白屏，而 curl 完全看不出来。
 * 这个脚本会：
 *   ① 打开页面，抓住 console 报错 / 未捕获异常 / 请求失败
 *   ② 核对渲染结果（标题、行数、统计数字、后端状态灯）
 *   ③ 真的走一遍交互：新建 → 客户端校验 → 提交 → 出现在列表 → 删除
 *   ④ 存一张截图供人工过目
 *
 * 用法：
 *   npm run verify:ui                              # 默认 http://127.0.0.1:8787
 *   npm run verify:ui -- http://127.0.0.1:5173     # 也可以验 Vite 开发服务器
 *
 * 前置：后端已在跑（npm run dev），且 admin 已构建（npm run build）或 Vite 已启动。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ADMIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = (process.argv[2] ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const PORT = 9333
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SHOT_PATH = path.join(ADMIN_ROOT, 'verify-ui.png')
const PROFILE = path.join(os.tmpdir(), `cdp-admin-${Date.now()}`)

let passed = 0
let failed = 0
const failures = []

const check = (label, ok, detail) => {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${label}`)
  } else {
    failed += 1
    failures.push(label)
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${detail}` : ''}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ——————————————————————————————————————————————
// 极简 CDP 客户端（Node 22 自带 WebSocket，无需 ws 包）
// ——————————————————————————————————————————————
class CDP {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    this.listeners = new Set()

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`))
        else resolve(msg.result)
        return
      }
      for (const fn of this.listeners) fn(msg)
    })
  }

  send(method, params = {}, sessionId) {
    const id = (this.seq += 1)
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`${method} 超时`))
        }
      }, 20_000)
    })
  }

  on(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true })
    })
    return new CDP(ws)
  }
}

async function launchChrome() {
  if (!fs.existsSync(CHROME)) throw new Error(`找不到 Chrome：${CHROME}`)

  const proc = spawn(
    CHROME,
    [
      '--headless=new',
      // ⚠️ 不加 --no-sandbox 会被运行沙箱拒（sandbox initialization failed）
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      `--user-data-dir=${PROFILE}`,
      `--remote-debugging-port=${PORT}`,
      '--window-size=1440,1300',
      'about:blank',
    ],
    { stdio: 'ignore', detached: false },
  )

  // 轮询等调试端口起来
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (res.ok) {
        const info = await res.json()
        return { proc, wsUrl: info.webSocketDebuggerUrl }
      }
    } catch {
      /* 还没起来 */
    }
    await sleep(250)
  }

  proc.kill()
  throw new Error('Chrome 调试端口未就绪')
}

/** 在页面里执行表达式并取回值 */
async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  )
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? '页面内执行出错')
  }
  return result.result?.value
}

const q = JSON.stringify

async function main() {
  console.log(`\nUI 验证目标：${TARGET}\n${'─'.repeat(50)}`)

  const { proc, wsUrl } = await launchChrome()

  try {
    const cdp = await CDP.connect(wsUrl)

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })

    // 收集页面侧的所有异常信号
    const consoleErrors = []
    const pageErrors = []
    const failedRequests = []

    cdp.on((msg) => {
      if (msg.method === 'Runtime.consoleAPICalled' && msg.sessionId === sessionId) {
        if (msg.params.type === 'error') {
          consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
        }
      }
      if (msg.method === 'Runtime.exceptionThrown' && msg.sessionId === sessionId) {
        pageErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
      }
      if (msg.method === 'Network.loadingFailed' && msg.sessionId === sessionId) {
        failedRequests.push(`${msg.params.type} ${msg.params.errorText}`)
      }
      if (msg.method === 'Network.responseReceived' && msg.sessionId === sessionId) {
        const { status, url } = msg.params.response
        if (status >= 400) failedRequests.push(`HTTP ${status} ${url}`)
      }
    })

    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Network.enable', {}, sessionId)
    await cdp.send('Page.enable', {}, sessionId)

    const loaded = new Promise((resolve) => {
      const off = cdp.on((msg) => {
        if (msg.method === 'Page.loadEventFired' && msg.sessionId === sessionId) {
          off()
          resolve()
        }
      })
    })

    await cdp.send('Page.navigate', { url: TARGET }, sessionId)
    await Promise.race([loaded, sleep(8000)])

    // 等 React 首次取数回来（列表出现或空态出现）
    for (let i = 0; i < 40; i += 1) {
      const ready = await evaluate(cdp, sessionId, `!!document.querySelector('.table, .state-block')`)
      if (ready) break
      await sleep(250)
    }

    // ——— 1. 页面能渲染且无报错 ———
    console.log('\n【1】页面加载')
    const title = await evaluate(cdp, sessionId, 'document.title')
    check('页面标题正确', title.includes('商品管理'), title)

    const h1 = await evaluate(cdp, sessionId, `document.querySelector('.brand h1')?.textContent ?? ''`)
    check('主标题已渲染（React 挂载成功）', h1.includes('商品管理'), h1)

    check('没有未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
    check('控制台没有 error', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))
    check('没有失败的网络请求', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '))

    // ——— 2. 数据真的从后端来了 ———
    console.log('\n【2】数据渲染')
    const rowCount = await evaluate(cdp, sessionId, `document.querySelectorAll('.table tbody tr').length`)
    check('表格渲染出 20 行（第一页满页）', rowCount === 20, `实际 ${rowCount}`)

    const firstSku = await evaluate(cdp, sessionId, `document.querySelector('.item-sku')?.textContent ?? ''`)
    check('每行显示 SKU', /^[A-Z0-9-]+$/.test(firstSku), firstSku)

    const priceText = await evaluate(cdp, sessionId, `document.querySelector('.price')?.textContent ?? ''`)
    check('价格格式化为 ¥xx.xx', /^¥\d+\.\d{2}$/.test(priceText), priceText)

    const storeCell = await evaluate(cdp, sessionId, `document.querySelector('.table tbody tr td:nth-child(2)')?.textContent ?? ''`)
    check('显示中文店名（联表数据到了前端）', /[\u4e00-\u9fa5]/.test(storeCell), storeCell)

    const statText = await evaluate(cdp, sessionId, `[...document.querySelectorAll('.stat')].map(s => s.textContent).join('|')`)
    check('顶部统计已填充（facets 已加载）', /商品21/.test(statText.replace(/\s/g, '')), statText)

    const statusText = await evaluate(cdp, sessionId, `document.querySelector('.status-dot')?.textContent ?? ''`)
    check('后端状态灯显示已连通', statusText.includes('已连通'), statusText)

    // ——— 3. 筛选真的打到后端 ———
    console.log('\n【3】筛选交互')
    await evaluate(
      cdp,
      sessionId,
      `(() => {
         const el = document.querySelector('#f-store')
         const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
         setter.call(el, 'noodle')
         el.dispatchEvent(new Event('change', { bubbles: true }))
       })()`,
    )
    await sleep(900)
    const filteredRows = await evaluate(cdp, sessionId, `document.querySelectorAll('.table tbody tr').length`)
    check('按店铺筛选后只剩 4 行', filteredRows === 4, `实际 ${filteredRows}`)

    const allNoodle = await evaluate(
      cdp,
      sessionId,
      `[...document.querySelectorAll('.table tbody tr td:nth-child(2)')].every(td => td.textContent.includes('面馆'))`,
    )
    check('筛选结果全部是深夜面馆', allNoodle === true, String(allNoodle))

    const pagerText = await evaluate(cdp, sessionId, `document.querySelector('.pager-info')?.textContent ?? ''`)
    check('分页信息随筛选更新', /共 4 件/.test(pagerText), pagerText)

    // 清空筛选
    await evaluate(cdp, sessionId, `document.querySelector('.btn-reset').click()`)
    await sleep(900)
    const resetRows = await evaluate(cdp, sessionId, `document.querySelectorAll('.table tbody tr').length`)
    check('清空筛选后恢复 20 行', resetRows === 20, `实际 ${resetRows}`)

    // ——— 4. 新建流程（含客户端校验）———
    console.log('\n【4】新建流程')
    await evaluate(cdp, sessionId, `[...document.querySelectorAll('.btn')].find(b => b.textContent.trim() === '新建商品').click()`)
    await sleep(400)

    const modalOpen = await evaluate(cdp, sessionId, `!!document.querySelector('.modal')`)
    check('弹窗已打开', modalOpen === true)

    // 直接提交空表单 → 应该被客户端校验拦住
    await evaluate(cdp, sessionId, `document.querySelector('.modal-foot .btn-primary').click()`)
    await sleep(300)
    const clientErrors = await evaluate(cdp, sessionId, `document.querySelectorAll('.field-error').length`)
    check('空表单提交被客户端校验拦下', clientErrors >= 5, `标红 ${clientErrors} 处`)
    const stillOpen = await evaluate(cdp, sessionId, `!!document.querySelector('.modal')`)
    check('校验失败时弹窗不关闭', stillOpen === true)

    // 填入合法数据（用原生 setter 触发 React 的 onChange）
    const STAMP = Date.now().toString(36).toUpperCase()
    const TEST_SKU = `UITEST-${STAMP}`

    await evaluate(
      cdp,
      sessionId,
      `(() => {
        const setInput = (sel, value, proto) => {
          const el = document.querySelector(sel)
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
          setter.call(el, value)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
        const setSelect = (sel, value) => {
          const el = document.querySelector(sel)
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
          setter.call(el, value)
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
        const inputs = document.querySelectorAll('.modal input')
        const set = (el, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(el, v)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
        // inputs 顺序：0=SKU 1=价格 2=中文名 3=英文名（后面是复选框）
        set(inputs[0], ${q(TEST_SKU)})
        set(inputs[2], 'UI 验证商品')
        set(inputs[3], 'UI VERIFY ITEM')
        setInput('.modal input[inputmode="decimal"]', '13.50', window.HTMLInputElement.prototype)
        setSelect('.modal select', 'life')
        const catInput = document.querySelector('.modal input[list="category-options"]')
        set(catInput, 'UI测试')
        const desc = document.querySelector('.modal textarea')
        const dset = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        dset.call(desc, '由 verify-ui.mjs 写入，验证完会删除。')
        desc.dispatchEvent(new Event('input', { bubbles: true }))
      })()`,
    )
    await sleep(300)

    const filledErrors = await evaluate(cdp, sessionId, `document.querySelectorAll('.field-error').length`)
    check('填好后错误提示消失', filledErrors === 0, `仍有 ${filledErrors} 处`)

    await evaluate(cdp, sessionId, `document.querySelector('.modal-foot .btn-primary').click()`)
    await sleep(1500)

    const modalClosed = await evaluate(cdp, sessionId, `!document.querySelector('.modal')`)
    check('提交后弹窗关闭', modalClosed === true)

    const toastText = await evaluate(cdp, sessionId, `document.querySelector('.toast')?.textContent ?? ''`)
    check('出现成功提示', toastText.includes('已创建'), toastText)

    // 用搜索验证新数据真的落库了
    await evaluate(
      cdp,
      sessionId,
      `(() => {
         const el = document.querySelector('#f-q')
         const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
         setter.call(el, ${q(TEST_SKU)})
         el.dispatchEvent(new Event('input', { bubbles: true }))
       })()`,
    )
    await sleep(1200)
    const hit = await evaluate(cdp, sessionId, `document.querySelectorAll('.table tbody tr').length`)
    check('搜索到刚建的 1 条（已写入数据库）', hit === 1, `实际 ${hit}`)

    const hitPrice = await evaluate(cdp, sessionId, `document.querySelector('.price')?.textContent ?? ''`)
    check('价格按分正确换算回 ¥13.50', hitPrice === '¥13.50', hitPrice)

    // ——— 5. 删除清理 ———
    console.log('\n【5】删除清理')
    await evaluate(cdp, sessionId, `[...document.querySelectorAll('.table tbody tr .btn')].find(b => b.textContent.trim() === '删除').click()`)
    await sleep(300)
    const confirmVisible = await evaluate(cdp, sessionId, `!!document.querySelector('.btn-danger')`)
    check('出现行内二次确认', confirmVisible === true)

    await evaluate(cdp, sessionId, `document.querySelector('.btn-danger').click()`)
    await sleep(1300)
    const emptyAfter = await evaluate(cdp, sessionId, `!!document.querySelector('.state-empty') || document.querySelectorAll('.table tbody tr').length === 0`)
    check('删除后列表为空', emptyAfter === true)

    // ——— 6. 截图 ———
    console.log('\n【6】截图')
    await evaluate(cdp, sessionId, `document.querySelector('.btn-reset').click()`)
    await sleep(1200)
    await evaluate(cdp, sessionId, `(() => { const el = document.querySelector('#f-q'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(el, '抹茶'); el.dispatchEvent(new Event('input', {bubbles:true})) })()`)
    await sleep(1000)

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId)
    fs.writeFileSync(SHOT_PATH, Buffer.from(shot.data, 'base64'))
    check('截图已保存', fs.existsSync(SHOT_PATH), SHOT_PATH)
    console.log(`  → ${SHOT_PATH}`)

    // ——— 7. 收尾后再查一遍有没有隐藏报错 ———
    console.log('\n【7】交互全程无异常')
    check('全程无未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
    check('全程无失败请求', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '))

    console.log(`\n${'─'.repeat(50)}`)
    console.log(`  通过 ${passed}　失败 ${failed}`)
    if (failed > 0) {
      console.log('\n  失败项：')
      for (const f of failures) console.log(`    · ${f}`)
    }
    console.log('')
  } finally {
    proc.kill('SIGKILL')
    fs.rmSync(PROFILE, { recursive: true, force: true })
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(`\nUI 验证无法完成：${err.message}\n`)
  process.exit(1)
})
