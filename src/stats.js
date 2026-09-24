/**
 * stats —— 匿名统计的客户端信标
 *
 * ⚠️ 部署 Worker 后只改这两个常量（见《部署指南-公开版.md》）：
 */
export const STATS_ENDPOINT = 'https://soft-life-stats.你的名字.workers.dev'
export const STATS_ADMIN_KEY = '换成你部署时设置的密钥'

const KEY_OPT = 'soft-life-stats-opt'
const KEY_VID = 'soft-life-stats-vid'

// 没改占位符 = 还没部署，一切静默（本地开发零打扰）
const configured = () => STATS_ENDPOINT.includes('.workers.dev') && !STATS_ENDPOINT.includes('你的名字')

export function statsConfigured() {
  return configured()
}

export function statsEnabled() {
  try { return configured() && localStorage.getItem(KEY_OPT) !== 'off' } catch { return false }
}

export function setStatsEnabled(on) {
  try { localStorage.setItem(KEY_OPT, on ? 'on' : 'off') } catch {}
}

// 随机访客串：只在「同一天去重」时用，不关联任何账号/设备信息
function visitorId() {
  try {
    let id = localStorage.getItem(KEY_VID)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY_VID, id)
    }
    return id
  } catch {
    return ''
  }
}

/** 上报一件事：beat('order') / beat('grams', 30) —— 关闭或未配置时静默跳过 */
export function beat(type, value = 1) {
  if (!statsEnabled()) return
  try {
    const body = JSON.stringify({ v: visitorId(), e: [{ t: type, v: value }] })
    navigator.sendBeacon?.(STATS_ENDPOINT + '/beat', new Blob([body], { type: 'application/json' }))
  } catch { /* 统计失败不影响任何功能 */ }
}
