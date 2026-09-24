// 手账里用户自己拍的照片存在 IndexedDB，删条目时要把照片一起带走，否则相册只增不减
import { deletePhoto } from './photoStore.js'

const KEY_CART = 'soft-life-cart-v1'
const KEY_HOUSE = 'soft-life-house-v1'
const KEY_ARCHIVES = 'soft-life-archives-v1'
const KEY_PETS = 'soft-life-pets-v1'
const KEY_PET_LEGACY = 'soft-life-pet-v1'
const KEY_CUSTOM_ITEMS = 'soft-life-custom-items-v1'
// 「来过没有」—— 只用来区分第一次和回头客，别拿它存任何业务数据
const KEY_VISITED = 'soft-life-visited-v1'

// ===== 伙伴档案：两只独立（猫 软软 / 狗 团团，2026-09-24 起各自成长）=====
// 老模型（soft-life-pet-v1）：单只 + species 字段，切物种 = 整只换皮，成长进度共享。
// 新模型（soft-life-pets-v1）：{ cat, dog, active } —— 猫狗各一本账、各自攒小饼干长大，
//   active 只表示「当前陪伴的是哪只」。老 key 只读（迁移用），从此一律写新 key。
// 单只档案里不存 species —— species 由它在 pets 对象里的键决定。

const DEFAULT_PROFILE = {
  meals: 0,        // 累计小饼干 = 完成的虚拟订单数（= 现实里少点的外卖次数）
  totalOrders: 0,  // 累计完成订单
  stickers: [],    // 已收集贴纸 id
  level: 0,        // 成长等级 0-4
  colorway: 'cream', // 毛色：用户敲定的只有一种配色，旧存档里的 pink/blue 一律归一到 cream
}

function sanitizeProfile(p) {
  const s = { ...DEFAULT_PROFILE }
  s.meals = Math.max(0, Number(p?.meals) || 0)
  s.totalOrders = Math.max(0, Number(p?.totalOrders) || 0)
  s.stickers = Array.isArray(p?.stickers) ? p.stickers.filter((x) => typeof x === 'string') : []
  s.level = Math.max(0, Math.min(4, Number(p?.level) || 0))
  s.colorway = 'cream'
  return s
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

// ===== 装饰地址卡（2026-09-22）：像外卖 App 可存多张、切换、编辑 —— 但全部是装饰性的 =====
// 结构：{ list: [{ id, name, phone, address }], activeId }
// 迁移：老版本只有 houseName 一个字符串 → 第一次读时自动拼成第一张地址卡。
// 诚实红线：姓名 / 电话 / 地址都可以是编的，UI 上必须保留「无需真实信息」的提示。
const KEY_ADDR = 'soft-life-addresses-v1'
const DEFAULT_DECOR_ADDRESS = '慢活小区 8 栋 2 单元'

function sanitizeAddress(a) {
  return {
    id: String(a?.id || ''),
    name: String(a?.name || ''),
    phone: String(a?.phone || ''),
    address: String(a?.address || ''),
  }
}

export function loadAddresses() {
  try {
    const raw = localStorage.getItem(KEY_ADDR)
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && Array.isArray(parsed.list) && parsed.list.length) {
      return {
        list: parsed.list.filter(Boolean).map(sanitizeAddress),
        activeId: String(parsed.activeId || ''),
      }
    }
  } catch {}
  return null
}

export function saveAddresses(state) {
  try {
    localStorage.setItem(KEY_ADDR, JSON.stringify(state || { list: [], activeId: '' }))
  } catch {}
}

/** 没存过地址时，用老的小屋名（houseName）拼出第一张卡 —— 老存档无痛迁移 */
export function ensureAddresses(houseName = '') {
  const saved = loadAddresses()
  if (saved) return saved
  const first = {
    id: `a${Date.now()}`,
    name: houseName || '橘子小屋',
    phone: '',
    address: DEFAULT_DECOR_ADDRESS,
  }
  const state = { list: [first], activeId: first.id }
  saveAddresses(state)
  return state
}

// 「这台设备上有没有来过」—— 只服务于那句问候语和新人解释，不参与任何业务逻辑。
// 读失败一律当「来过」：宁可少说一句欢迎，也别对着回头客说「第一次来吧」。
export function hasVisited() {
  try {
    return localStorage.getItem(KEY_VISITED) === '1'
  } catch {
    return true
  }
}

export function markVisited() {
  try {
    localStorage.setItem(KEY_VISITED, '1')
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

export function loadPets() {
  try {
    // ① 新结构优先
    const raw = localStorage.getItem(KEY_PETS)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        cat: sanitizeProfile(parsed?.cat),
        dog: sanitizeProfile(parsed?.dog),
        active: parsed?.active === 'dog' ? 'dog' : 'cat',
      }
    }
    // ② 迁移老结构：旧版进度是两只共享的同一份 → 复制成两只的共同起点，不丢任何一块饼干
    const legacy = localStorage.getItem(KEY_PET_LEGACY)
    if (legacy) {
      const p = JSON.parse(legacy)
      const shared = sanitizeProfile(p)
      const pets = {
        cat: { ...shared },
        dog: { ...shared },
        active: p?.species === 'dog' ? 'dog' : 'cat',
      }
      savePets(pets)
      return pets
    }
  } catch {}
  // ③ 全新
  return { cat: { ...DEFAULT_PROFILE }, dog: { ...DEFAULT_PROFILE }, active: 'cat' }
}

export function savePets(pets) {
  try {
    localStorage.setItem(KEY_PETS, JSON.stringify({
      cat: sanitizeProfile(pets?.cat),
      dog: sanitizeProfile(pets?.dog),
      active: pets?.active === 'dog' ? 'dog' : 'cat',
    }))
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

// ===== 公益档案：猫粮记录 =====
// ⚠️ 措辞红线：这里记的是「打算捐、还没捐」的账 —— 不是已捐。
//    「已捐了多少」要等真捐闭环做出来才有（用户自己转账后自己盖的章）。
// 没有后端，是本地记账 —— 但数字是认真算的（¥1 = 100g）
const KEY_CHARITY = 'soft-life-charity-v1'

export const DEFAULT_CHARITY = {
  grams: 0,        // 累计**记下**的克数（还没捐出去）
  amount: 0,       // 累计**记下**的金额（元，钱一直在用户手上）
  orders: 0,       // 参与的订单数
  records: [],     // [{ id, grams, amount, ratio, shop, at }]  ← 记下的那一笔笔
  settled: [],     // 真捐记录 [{ id, grams, amount, to, at }] —— 用户自己转完账之后自己盖的章
}

export function loadCharity() {
  try {
    const raw = localStorage.getItem(KEY_CHARITY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed) return { ...DEFAULT_CHARITY }
    return {
      ...DEFAULT_CHARITY,
      ...parsed,
      records: Array.isArray(parsed.records) ? parsed.records : [],
      settled: Array.isArray(parsed.settled) ? parsed.settled : [],
    }
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

export const DAILY_PATIENCE = 15 // 每天的慢活额度（分钟）；2026-09-22 起 10→15 —— 付款开始按 ¥10=1 分钟花额度，10 分钟不够一天玩

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ===== 陪等的方式（等待页三选一，记住你上次挑的那个）=====
// 只是 UI 偏好，不涉及任何数值：写失败也无所谓，下次默认回「陪他走」。
const KEY_WAIT_MODE = 'soft-life-wait-mode-v1'
export const DEFAULT_WAIT_MODE = 'walk'

export function loadWaitMode() {
  try {
    return localStorage.getItem(KEY_WAIT_MODE) || DEFAULT_WAIT_MODE
  } catch {
    return DEFAULT_WAIT_MODE
  }
}

export function saveWaitMode(mode) {
  try { localStorage.setItem(KEY_WAIT_MODE, mode) } catch { /* 无所谓 */ }
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
export function logJournalOrder(entries = [], meta = {}) {
  if (!entries.length) return
  const j = loadJournal()
  const k = journalKey()
  const day = j.days[k] || { items: [], note: '', mood: '' }
  const at = Date.now()
  // 2026-09-23 用户「手账就是订单，但信息没呈现」：订单笔补上店名（place）和
  // 这一单的概要（order）。只陈述这一单本身的事实，不做任何跨笔汇总 —— 不算账。
  // 老数据没有这两个字段，详情卡照常渲染（place 空 = 不显示那行）。
  const order = meta.total != null
    ? { count: meta.count || entries.length, total: meta.total, pay: meta.pay || '' }
    : null
  day.items = [
    ...(day.items || []),
    ...entries.filter((e) => e && e.name).map((e) => ({
      id: e.id || null,
      name: e.name,
      at,
      ...(meta.shop ? { place: meta.shop } : {}),
      ...(order ? { order } : {}),
    })),
  ]
  j.days[k] = day
  saveJournal(j)
}

/**
 * 一笔记录上「用户自己填 / AI 写下的」那些字段。
 *
 * ⚠️ 白名单集中在这一处，别再各写各的。原因：备注卡两边共用（食物手账的详情页 +
 *    「存下这一餐」的照片墙），如果一边往 patch 里塞了字段而这里没放行，
 *    表现是「填了、界面也显示、刷新就没了」—— 而且不报错，非常难查。
 */
const ENTRY_TEXT_FIELDS = ['place', 'mood', 'why', 'company', 'kcal', 'aiNote', 'swatch']

/** 新增时用：空字符串不算数，别把 ''写进去占位 */
function applyNewFields(entry, extra) {
  for (const key of ENTRY_TEXT_FIELDS) {
    const value = extra[key]
    if (typeof value === 'string' && value.trim()) entry[key] = value.trim()
  }
  if (Array.isArray(extra.tags) && extra.tags.length) entry.tags = extra.tags.slice(0, 6)
  return entry
}

/** 修改时用：空字符串**要**能写进去 —— 那是「用户把这一格清空了」 */
function applyPatch(entry, patch) {
  for (const key of ENTRY_TEXT_FIELDS) {
    if (typeof patch[key] === 'string') entry[key] = patch[key].trim()
  }
  if (Array.isArray(patch.tags)) entry.tags = patch.tags.slice(0, 6)
  // 名字不能清空 —— 空白名字会让这一笔在手账的列表里变成一行看不见的东西
  if (typeof patch.name === 'string' && patch.name.trim()) entry.name = patch.name.trim()
  return entry
}

/**
 * 手动加一笔。
 * extra 可带 { photoId, thumb, place, mood, why, company, kcal, tags, aiNote, swatch, at }
 * —— 用户拍照贴上来、或「存下这一餐」上传时走这条路。
 * 返回落盘的条目，UI 可以立刻拿去展开详情，不必再读一遍。
 */
export function addJournalItem(dateKey, name, extra = {}) {
  if (!dateKey || !name) return null
  const j = loadJournal()
  const day = j.days[dateKey] || { items: [], note: '', mood: '' }
  const entry = applyNewFields({ id: extra.id || null, name }, extra)
  if (extra.photoId) {
    entry.photoId = extra.photoId
    if (extra.thumb) entry.thumb = extra.thumb
  }
  entry.at = extra.at || Date.now()
  day.items = [...(day.items || []), entry]
  j.days[dateKey] = day
  saveJournal(j)
  return entry
}

/** 改某一笔的字段（备注卡里改的所有东西都走这里） */
export function updateJournalItem(dateKey, index, patch = {}) {
  if (!dateKey) return
  const j = loadJournal()
  const day = j.days[dateKey]
  if (!day || !day.items || index < 0 || index >= day.items.length) return
  const next = applyPatch({ ...day.items[index] }, patch)
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

// ===== 订单历史（「我的」页的订单列表；只存最近 100 单）=====
const KEY_ORDERS = 'soft-life-orders-v1'

export function loadOrders() {
  try {
    const raw = localStorage.getItem(KEY_ORDERS)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// entry: { shop, total, items:[名字], at: ISO 时间 }
export function saveOrder(entry) {
  if (!entry || !entry.shop) return
  try {
    const all = loadOrders()
    all.unshift({ ...entry, at: entry.at || new Date().toISOString() })
    localStorage.setItem(KEY_ORDERS, JSON.stringify(all.slice(0, 100)))
  } catch {}
}
