// 手账里用户自己拍的照片存在 IndexedDB，删条目时要把照片一起带走，否则相册只增不减
import { deletePhoto } from './photoStore.js'

const KEY_CART = 'soft-life-cart-v1'
const KEY_HOUSE = 'soft-life-house-v1'
const KEY_ARCHIVES = 'soft-life-archives-v1'
const KEY_PET = 'soft-life-pet-v1'
const KEY_CUSTOM_ITEMS = 'soft-life-custom-items-v1'

// 宠物默认初始状态（形象：小猫「软软」，2026-09-14 由用户敲定的猫咪设计替换原兔熊）
export const DEFAULT_PET = {
  meals: 0,        // 累计小饼干 = 完成的虚拟订单数（= 现实里少点的外卖次数）
  totalOrders: 0,  // 累计完成订单
  stickers: [],    // 已收集贴纸 id
  level: 0,        // 成长等级 0-4
  colorway: 'cream', // 毛色：用户敲定的猫只有一种配色，旧存档里的 pink/blue 一律归一到 cream
}

export function loadCart() {
  try {
    const raw = localStorage.getItem(KEY_CART)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveCart(cart) {
  try {
    localStorage.setItem(KEY_CART, JSON.stringify(cart))
  } catch {}
}

export function loadHouseName() {
  try {
    return localStorage.getItem(KEY_HOUSE) || ''
  } catch {
    return ''
  }
}

export function saveHouseName(name) {
  try {
    localStorage.setItem(KEY_HOUSE, name)
  } catch {}
}

export function loadArchives() {
  try {
    const raw = localStorage.getItem(KEY_ARCHIVES)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveArchives(archives) {
  try {
    localStorage.setItem(KEY_ARCHIVES, JSON.stringify(archives))
  } catch {}
}

export function loadPet() {
  try {
    const raw = localStorage.getItem(KEY_PET)
    const pet = raw ? { ...DEFAULT_PET, ...JSON.parse(raw) } : { ...DEFAULT_PET }
    // 存档消毒：旧版（兔熊期）可能存着 pink / blue，而现在的猫只有一种配色、
    // 那一对 hue-rotate 占位滤镜也已删除 —— 归一化，避免读到幽灵毛色
    if (pet.colorway !== 'cream') pet.colorway = 'cream'
    return pet
  } catch {
    return { ...DEFAULT_PET }
  }
}

export function savePet(pet) {
  try {
    localStorage.setItem(KEY_PET, JSON.stringify(pet))
  } catch {}
}

// ===== 用户自建商品（像真外卖平台一样可无限扩展） =====
export function loadCustomItems() {
  try {
    const raw = localStorage.getItem(KEY_CUSTOM_ITEMS)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCustomItems(items) {
  try {
    localStorage.setItem(KEY_CUSTOM_ITEMS, JSON.stringify(items || []))
  } catch {}
}

// ===== 世界菜单状态（今天飞哪座城市 + 第几桌）=====
const KEY_WORLD = 'soft-life-world-v1'

export const DEFAULT_WORLD = { kitchenId: '', batch: 0 }

export function loadWorld() {
  try {
    const raw = localStorage.getItem(KEY_WORLD)
    return raw ? { ...DEFAULT_WORLD, ...JSON.parse(raw) } : { ...DEFAULT_WORLD }
  } catch {
    return { ...DEFAULT_WORLD }
  }
}

export function saveWorld(world) {
  try {
    localStorage.setItem(KEY_WORLD, JSON.stringify(world || DEFAULT_WORLD))
  } catch {}
}

// ===== 每日心情（首页「今天想被什么治愈」的选择，一天一换）=====
const KEY_MOOD = 'soft-life-mood-v1'

export function loadMood(today) {
  try {
    const raw = localStorage.getItem(KEY_MOOD)
    const parsed = raw ? JSON.parse(raw) : null
    // 跨天自动作废
    return parsed && parsed.date === today ? parsed.mood : null
  } catch {
    return null
  }
}

export function saveMood(today, mood) {
  try {
    localStorage.setItem(KEY_MOOD, JSON.stringify({ date: today, mood }))
  } catch {}
}

// ===== 公益档案：猫粮捐赠记录 =====
// 没有后端，是本地记账 —— 但数字是认真算的（¥1 = 10g）
const KEY_CHARITY = 'soft-life-charity-v1'

export const DEFAULT_CHARITY = {
  grams: 0,        // 累计已捐克数
  amount: 0,       // 累计已捐金额（元）
  orders: 0,       // 参与捐赠的订单数
  records: [],     // [{ id, grams, amount, ratio, shop, at }]
}

export function loadCharity() {
  try {
    const raw = localStorage.getItem(KEY_CHARITY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed) return { ...DEFAULT_CHARITY }
    return { ...DEFAULT_CHARITY, ...parsed, records: Array.isArray(parsed.records) ? parsed.records : [] }
  } catch {
    return { ...DEFAULT_CHARITY }
  }
}

export function saveCharity(charity) {
  try {
    localStorage.setItem(KEY_CHARITY, JSON.stringify(charity || DEFAULT_CHARITY))
  } catch {}
}

// ===== 惜食柜的账：被拦下来的浪费 =====
// 这本账记的不是「省了多少钱」，是「有几份东西没被丢掉」。钱只是附带说明。
// 同样没有后端 —— 是一本账，不是一次真实的食物救援。
const KEY_RESCUE = 'soft-life-rescue-v1'

export const DEFAULT_RESCUE = {
  servings: 0,   // 累计从惜食柜带走几份
  yuan: 0,       // 这些份合计比原价少花了多少（元）
  orders: 0,     // 含惜食柜商品的订单数
  records: [],   // [{ id, at, servings, yuan, items: [{ cn, name, originalPrice, price, offPct }] }]
}

export function loadRescue() {
  try {
    const raw = localStorage.getItem(KEY_RESCUE)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed) return { ...DEFAULT_RESCUE }
    return { ...DEFAULT_RESCUE, ...parsed, records: Array.isArray(parsed.records) ? parsed.records : [] }
  } catch {
    return { ...DEFAULT_RESCUE }
  }
}

export function saveRescue(rescue) {
  try {
    localStorage.setItem(KEY_RESCUE, JSON.stringify(rescue || DEFAULT_RESCUE))
  } catch {}
}

// ===== 慢活额度：每天 30 分钟「可以快进的时间」 =====
// 时间是这个 App 里唯一真实的资源 —— 等，是在攒；快进，是在花。
// 完整等完一单不扣额度，还多掉一份「路上的纪念」；想提前结束就花额度买时间。
const KEY_PATIENCE = 'soft-life-patience-v1'

export const DAILY_PATIENCE = 10 // 每天可快进的分钟数（约 5 单的量）

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function loadPatience() {
  try {
    const raw = localStorage.getItem(KEY_PATIENCE)
    const parsed = raw ? JSON.parse(raw) : null
    // 跨天自动回满
    if (!parsed || parsed.date !== todayKey()) return { date: todayKey(), used: 0, waited: 0 }
    return {
      date: parsed.date,
      used: Math.max(0, Number(parsed.used) || 0),
      waited: Math.max(0, Number(parsed.waited) || 0),
    }
  } catch {
    return { date: todayKey(), used: 0, waited: 0 }
  }
}

export function savePatience(p) {
  try {
    localStorage.setItem(
      KEY_PATIENCE,
      JSON.stringify({
        date: p?.date || todayKey(),
        used: Math.max(0, Number(p?.used) || 0),
        waited: Math.max(0, Number(p?.waited) || 0),
      })
    )
  } catch {}
}

/** 今天还剩多少分钟可以快进 */
export function patienceLeft(p) {
  return Math.max(0, DAILY_PATIENCE - (Number(p?.used) || 0))
}

// ===== 心愿单：先记着，不急着点 =====
// 顶栏那颗心不是装饰 —— 它的意义是**别当场冲动下单**：
// 想吃的先记下来，等真的想吃了再点。所以这里只存 id，不存数量、不跨单结算，
// 也不和「惜食柜 / 今日特调」那样每天作废（记着的东西明天还在）。
const KEY_WISH = 'soft-life-wish-v1'

export function loadWishes() {
  try {
    const raw = localStorage.getItem(KEY_WISH)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string').slice(0, 60) : []
  } catch {
    return []
  }
}

export function saveWishes(ids) {
  try {
    localStorage.setItem(KEY_WISH, JSON.stringify(Array.isArray(ids) ? ids : []))
  } catch {}
}

// ===== 食物手账：每天吃了什么 / 想吃什么 + 便签 =====
// 结构：{ days: { '2026-09-15': { items: [entry], note: '', mood: '' } } }
//
// entry 有两种来源（2026-09-16 起）：
//   · 点完一单自动记下的  → { id: 商品id, name }            ← 图来自商品图
//   · 用户自己拍照贴上的  → { photoId, thumb, name, place } ← 图来自用户自己的照片
// 后者才是用户要的那一种：照片存在 IndexedDB（见 photoStore.js），
// 这里只留 photoId 和一张很小的 thumb（日历格要同步渲染，不能去 await IDB）。
const KEY_JOURNAL = 'soft-life-journal-v1'

export function journalKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function loadJournal() {
  try {
    const raw = localStorage.getItem(KEY_JOURNAL)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed.days === 'object' && parsed.days ? parsed : { days: {} }
  } catch {
    return { days: {} }
  }
}

export function saveJournal(journal) {
  try {
    localStorage.setItem(KEY_JOURNAL, JSON.stringify(journal || { days: {} }))
  } catch {}
}

// 完成一单虚拟外卖 → 记到今天的账上（entries 带 id，日历能贴出真图）
export function logJournalOrder(entries = []) {
  if (!entries.length) return
  const j = loadJournal()
  const k = journalKey()
  const day = j.days[k] || { items: [], note: '', mood: '' }
  const at = Date.now()
  day.items = [
    ...(day.items || []),
    ...entries.filter((e) => e && e.name).map((e) => ({ id: e.id || null, name: e.name, at })),
  ]
  j.days[k] = day
  saveJournal(j)
}

/**
 * 手动加一笔。
 * extra 可带 { photoId, thumb, name(覆盖), place, at } —— 用户拍照贴上来时走这条路。
 * 返回落盘的条目，UI 可以立刻拿去展开详情，不必再读一遍。
 */
export function addJournalItem(dateKey, name, extra = {}) {
  if (!dateKey || !name) return null
  const j = loadJournal()
  const day = j.days[dateKey] || { items: [], note: '', mood: '' }
  const entry = { id: extra.id || null, name }
  if (extra.photoId) {
    entry.photoId = extra.photoId
    if (extra.thumb) entry.thumb = extra.thumb
  }
  if (extra.place) entry.place = extra.place
  entry.at = extra.at || Date.now()
  day.items = [...(day.items || []), entry]
  j.days[dateKey] = day
  saveJournal(j)
  return entry
}

/** 改某一笔的字段（详情页里改名字 / 店名） */
export function updateJournalItem(dateKey, index, patch = {}) {
  if (!dateKey) return
  const j = loadJournal()
  const day = j.days[dateKey]
  if (!day || !day.items || index < 0 || index >= day.items.length) return
  const next = { ...day.items[index] }
  if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim()
  if (typeof patch.place === 'string') next.place = patch.place.trim()
  day.items = day.items.map((it, i) => (i === index ? next : it))
  j.days[dateKey] = day
  saveJournal(j)
}

/** 删掉某天的一笔记录（按索引）。被删的那笔如果带着自拍，照片也一并从相册里清掉。 */
export function removeJournalItem(dateKey, index) {
  const j = loadJournal()
  const day = j.days[dateKey]
  if (!day || !day.items || index < 0 || index >= day.items.length) return null
  const [gone] = day.items.filter((_, i) => i === index)
  day.items = day.items.filter((_, i) => i !== index)
  j.days[dateKey] = day
  saveJournal(j)
  // 照片不属于任何别的地方了 —— 不删就会永远留在相册里
  if (gone?.photoId) deletePhoto(gone.photoId)
  return gone || null
}

// 保存某天的便签 / 心情
export function setJournalNote(dateKey, note, mood) {
  if (!dateKey) return
  const j = loadJournal()
  const day = j.days[dateKey] || { items: [], note: '', mood: '' }
  if (note != null) day.note = note
  if (mood != null) day.mood = mood
  j.days[dateKey] = day
  saveJournal(j)
}
