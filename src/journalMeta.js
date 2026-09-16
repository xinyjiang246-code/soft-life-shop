/**
 * 手账的公共常量与日期小工具。
 *
 * 为什么单独一个文件：这些原来都长在 `JournalView.jsx` 里，但 2026-09-17 之后
 * **备注卡两边共用**（食物手账的详情页 + 「存下这一餐」的照片墙），
 * 常量就得有个中立的地方放 —— 不能让详情组件反过来去 import 一个页面组件。
 *
 * 语气红线（和惜食柜、公益档案一致）：不记卡路里、不算账、不做「连续打卡 N 天」。
 */

export const DEFAULT_PHOTO_NAME = '今天拍的一张'

// 心情只用文字标签，不用 emoji（项目红线：商品与界面都不退回 emoji）。
// 两处都用这一份：手账「今天」页选的是**这一天**的心情，备注卡里选的是**这一张**的心情。
export const MOODS = [
  { id: 'bright', label: '挺好' },
  { id: 'good', label: '还不错' },
  { id: 'quiet', label: '想静静' },
  { id: 'sweet', label: '想吃点甜的' },
  { id: 'tired', label: '有点累' },
  { id: 'empty', label: '空落落' },
]

export const moodLabel = (id) => MOODS.find((m) => m.id === id)?.label || ''

/** `at` 时间戳 → `HH:MM`。时间戳坏了就返回空串，绝不吐 `NaN:NaN` */
export const timeOf = (at) => {
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const pad2 = (n) => String(n).padStart(2, '0')
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
