/**
 * 展示用的常量与格式化。
 */

/** 后台允许挑选的标签（与 data.js 里的 tags 取值一致） */
export const TAG_OPTIONS = [
  { value: 'signature', label: '招牌' },
  { value: 'new', label: '新品' },
  { value: 'hot', label: '热卖' },
]

const TAG_LABELS = Object.fromEntries(TAG_OPTIONS.map((t) => [t.value, t.label]))

/** 后端存的是英文标签，界面上给人看中文 */
export const tagLabel = (tag) => TAG_LABELS[tag] ?? tag

/** 分 → 元（只用于输入框这种需要人读的地方，接口传输一律用分） */
export const centsToYuan = (cents) => (Number.isInteger(cents) ? (cents / 100).toFixed(2) : '')

/**
 * 元 → 分。
 * ⚠️ 必须四舍五入，不能截断：19.999 → 1999（不是 1999 的截断版 1999 → 用 Math.round）
 * 直接乘 100 遇到 19.99 * 100 = 1998.9999999999998 这种浮点误差，不 round 就会少一分钱。
 */
export const yuanToCents = (yuan) => {
  const n = Number.parseFloat(yuan)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/** ISO 时间 → 本地可读（表格里那一列） */
export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
