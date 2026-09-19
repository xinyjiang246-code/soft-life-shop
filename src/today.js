// 「今天」—— 把散在各处的每日状态串成一天（2026-09-19）。
//
// 为什么要有它：产品里一堆东西都是「每日」的（心情 / 今日特调 / 惜食柜 / 慢活额度 /
// 手账 / 世界菜单），但**没有任何一处把它们串成「今天」**。后果是第二天打开，
// 看到的和昨天一模一样 —— 用户分不出「新的一天」和「同一天」。
// 这是用户说的「感觉不完善，但说不出在哪」里剩下的那一半。
//
// 🔴 不新增任何存储。所有数字都是已经在记的，只是以前没人读给用户看。
//    最典型的是 `patience.waited`（今天等满了几单）—— 它一直在记账里，
//    却只有等待页那块额度面板读过一次，离开那页就没人再看见。
//
// 🔴 措辞红线：全部陈述句。不许出现「还没 / 快去 / 今天还差」。
//    一旦变成催单、打卡（「连续 N 天」）或奖励，这条就毁了 ——
//    这里没有签到，也不给任何好处，只是把你今天做过的事说出来。
//    「今天什么都没有」的那一态（态 B）更要小心：它说的是**今天有什么**，
//    不是**你还缺什么**。

import { dateSeed, getTodaySpecial } from './data.js'
import { journalKey, loadCharity, loadJournal, loadPatience, loadRescue } from './storage.js'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 「9月19日 周六」 */
export function todayLabel(d = new Date()) {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`
}

/** ISO 时间戳是不是落在「现在这一天」（本地时区） */
function isSameDay(iso, now) {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
}

/**
 * 今天的快照 —— 全部来自已有存储，没有新 key。
 * @param {{ rescueCount?: number, worldCity?: string }} done 首页已经算好的两项
 *        （惜食柜今天几份 / 世界菜单今日城市）—— 它们不在 localStorage 里，由调用方传进来。
 */
export function getTodaySnapshot({ rescueCount = 0, worldCity = '' } = {}) {
  const now = new Date()

  // 等满了几单（今天）—— 等满才 +1，快进不算（快进记在 used 里）
  const patience = loadPatience()
  const waited = Math.max(0, Number(patience?.waited) || 0)

  // 今天存下了几餐 —— 手账是唯一存储，这里只读今天的桶
  const journal = loadJournal()
  const items = journal.days?.[journalKey(now)]?.items || []
  const journalCount = items.filter((it) => it && it.name).length

  // 今天记下的猫粮克数 / 从惜食柜带走几份 —— 两张账本都是 ISO 时间戳，按天过滤
  const grams = (loadCharity().records || [])
    .filter((r) => isSameDay(r?.at, now))
    .reduce((n, r) => n + (Number(r.grams) || 0), 0)
  const rescueTaken = (loadRescue().records || [])
    .filter((r) => isSameDay(r?.at, now))
    .reduce((n, r) => n + (Number(r.servings) || 0), 0)

  return {
    label: todayLabel(now),
    waited,
    journalCount,
    grams,
    rescueTaken,
    // 「今天发生过事」的判据：上面四样任意一样 > 0。
    // 注意**心情不算**——那是此刻的选择，不是记下的一笔；而且 MoodRitual 就在正下方。
    hasToday: waited > 0 || journalCount > 0 || grams > 0 || rescueTaken > 0,
    special: getTodaySpecial(),
    rescueCount,
    worldCity,
  }
}

/** 态 A：今天已经发生过的事。有几条说几条，不凑数。 */
export function todayDoneLines(snap) {
  const lines = []
  if (snap.waited > 0) lines.push(`今天等满 ${snap.waited} 单`)
  const rest = []
  if (snap.journalCount > 0) rest.push(`存下 ${snap.journalCount} 餐`)
  if (snap.grams > 0) rest.push(`记下 ${snap.grams} 克猫粮`)
  if (snap.rescueTaken > 0) rest.push(`带走 ${snap.rescueTaken} 份`)
  if (rest.length) lines.push(rest.join(' · '))
  return lines
}

/**
 * 态 B：今天有什么 —— 这一态的任务是让人一眼看出「这是新的一天」，
 * 所以只放**每天真的会换**的东西（今日特调 / 惜食 / 世界菜单）。
 * 天种子固定时它们一致，跨天就整体换一批。
 */
export function todayOfferLines(snap) {
  const lines = [`今天的特调是「${snap.special.cn}」`]
  const rest = []
  if (snap.rescueCount > 0) rest.push(`惜食柜 ${snap.rescueCount} 份`)
  if (snap.worldCity) rest.push(`今日空运 ${snap.worldCity}`)
  if (rest.length) lines.push(rest.join(' · '))
  return lines
}

/** 给守卫与调试用：今天是哪一天（YYYYMMDD，与 dateSeed 同口径） */
export function todaySeed() {
  return dateSeed()
}
