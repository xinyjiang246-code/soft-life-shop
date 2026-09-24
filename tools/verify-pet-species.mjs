#!/usr/bin/env node
/**
 * 小狗「团团」接线守卫（09-24 用户「我的小狗呢，怎么没有小狗」）
 * 断言：
 *   ① 初始是猫：pet 页标题「软软的小屋」、hero 图是 a-cream-*；
 *   ② 点「狗 · 团团」切换：标题变「团团的小屋」、hero 图变 d-cream-*、tab 标签变「团团」；
 *   ③ 全局联动：回首页，溜达伙伴（home-cat 里的 SoftPet）也是狗（d-cream-*）；
 *   ④ 成长阶梯图全用狗素材（d-cream-stage*）。
 * 跑法：先起 dist 预览 8080 + Chrome CDP 9222，再 node 本脚本。
 */
import { setTimeout as sleep } from 'node:timers/promises'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8080/'
const ok = (n, c, e = '') => console.log(`${c ? '✅' : '❌'} ${n}${e ? ` — ${e}` : ''}`)

const CDP = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(BASE), { method: 'PUT' }).then(r => r.json())
const ws = new WebSocket(CDP.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let id = 0; const pending = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const one = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })) })
const js = async (expr) => (await one('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value
const shot = async (file) => { const { writeFileSync } = await import('node:fs'); const { data } = await one('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(data, 'base64')) }
const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await js(expr)) return true; await sleep(120) } return false }

await one('Page.enable')
await one('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
// 干净开局：清宠物存档（默认猫）
await one('Page.navigate', { url: BASE })
await sleep(2000)
await js(`localStorage.removeItem('soft-life-pets-v1'); localStorage.removeItem('soft-life-pet-v1'); localStorage.removeItem('soft-life-last-screen')`)
await one('Page.navigate', { url: BASE })
await sleep(2200)
if (await js(`!!document.querySelector('.ob-backdrop')`)) { await js(`document.querySelector('.ob-skip')?.click()`); await sleep(500) }

// 进 pet 页（点 tabbar 的「软软」）
await waitFor(`!!document.querySelector('.tabbar-pp-item')`)
await js(`[...document.querySelectorAll('.tabbar-pp-item')].find(b => b.textContent.includes('软软'))?.click()`)
await waitFor(`!!document.querySelector('.pet-hero')`)

// ① 默认猫
const catState = await js(`(() => {
  const title = document.querySelector('.topbar-title')?.textContent || ''
  const img = document.querySelector('.pet-avatar-wrap .pet-photo img')?.src || ''
  return { title, isCat: /a-cream-stage/.test(img), img }
})()`)
ok('① 默认是猫（软软的小屋 + a-cream 图）', catState.title.includes('软软') && catState.isCat, `title=${catState.title}`)

// ② 切换到狗
const hasToggle = await js(`!!document.querySelector('.pet-species-btn')`)
await js(`[...document.querySelectorAll('.pet-species-btn')].find(b => b.textContent.includes('团团'))?.click()`)
await sleep(700)
const dogState = await js(`(() => {
  const title = document.querySelector('.topbar-title')?.textContent || ''
  const img = document.querySelector('.pet-avatar-wrap .pet-photo img')?.src || ''
  const tab = [...document.querySelectorAll('.tabbar-pp-item')].map(b => b.textContent.trim()).join(',')
  return { title, isDog: /d-cream-stage/.test(img), img, tab }
})()`)
ok('② 切到狗：标题「团团的小屋」', hasToggle && dogState.title.includes('团团'), `title=${dogState.title}`)
ok('② 切到狗：hero 图是 d-cream', dogState.isDog, dogState.img.split('/').pop())
ok('② 切到狗：tab 标签变「团团」', dogState.tab.includes('团团'), `tabs=${dogState.tab}`)
await shot('/tmp/pet-dog.png')

// ③ 成长阶梯全用狗素材
const ladderDog = await js(`(() => {
  const imgs = [...document.querySelectorAll('.pet-ladder .pet-photo img')].map(i => i.src)
  return { n: imgs.length, allDog: imgs.every(s => /d-cream-stage/.test(s)) }
})()`)
ok('③ 成长阶梯 5 张全是狗素材', ladderDog.n === 5 && ladderDog.allDog, `n=${ladderDog.n} allDog=${ladderDog.allDog}`)

// ④ 全局联动：回首页，溜达伙伴是狗
await js(`[...document.querySelectorAll('.tabbar-pp-item')].find(b => b.textContent.includes('首页'))?.click()`)
await waitFor(`!!document.querySelector('.home-cat .pet-photo img')`)
const homeDog = await js(`(() => {
  const img = document.querySelector('.home-cat .pet-photo img')?.src || ''
  return /d-cream-stage/.test(img)
})()`)
ok('④ 首页溜达伙伴也是狗', homeDog)
await shot('/tmp/home-dog.png')

// ⑤ 切回猫：软软还在（两只都一直在，可随时切回 —— 09-24 用户「两个都要在，切换用哪个」）
await js(`[...document.querySelectorAll('.tabbar-pp-item')].find(b => b.textContent.includes('团团'))?.click()`)
await waitFor(`!!document.querySelector('.pet-hero')`)
await js(`[...document.querySelectorAll('.pet-species-btn')].find(b => b.textContent.includes('软软'))?.click()`)
await sleep(700)
const backCat = await js(`(() => {
  const title = document.querySelector('.topbar-title')?.textContent || ''
  const img = document.querySelector('.pet-avatar-wrap .pet-photo img')?.src || ''
  return { title, isCat: /a-cream-stage/.test(img) }
})()`)
ok('⑤ 切回猫：软软还在（标题 + a-cream 图）', backCat.title.includes('软软') && backCat.isCat, `title=${backCat.title}`)

// ⑥ 独立档案：存档里 cat / dog 两本账，切物种只改 active 不改进度
const arch = await js(`(() => {
  const p = JSON.parse(localStorage.getItem('soft-life-pets-v1') || '{}')
  return { hasCat: !!p.cat, hasDog: !!p.dog, active: p.active, catMeals: p.cat?.meals ?? null, dogMeals: p.dog?.meals ?? null }
})()`)
ok('⑥ 独立档案：cat/dog 各一本账 + active 正确', arch.hasCat && arch.hasDog && arch.active === 'cat', JSON.stringify(arch))

// ⑦ 各自成长：改团团档案的 meals，软软不受影响（各长各的，不共享）
await js(`(() => {
  const p = JSON.parse(localStorage.getItem('soft-life-pets-v1'))
  p.dog.meals = 5
  localStorage.setItem('soft-life-pets-v1', JSON.stringify(p))
  return true
})()`)
await one('Page.navigate', { url: BASE })
await sleep(1800)
const indep = await js(`(() => {
  const p = JSON.parse(localStorage.getItem('soft-life-pets-v1') || '{}')
  return { catMeals: p.cat?.meals, dogMeals: p.dog?.meals }
})()`)
ok('⑦ 各自成长：团团 5 块 / 软软 0 块（互不影响）', indep.catMeals === 0 && indep.dogMeals === 5, JSON.stringify(indep))

console.log(`\n截图：/tmp/pet-dog.png / /tmp/home-dog.png`)
ws.close(); process.exit(0)
