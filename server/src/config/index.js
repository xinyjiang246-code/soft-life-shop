/**
 * 集中配置 + 启动时校验（fail fast）。
 *
 * 原则：除这里的 `readEnv`，全项目任何地方都不许再直接读 process.env。
 * 配置有问题就在进程启动的第一秒炸掉，而不是等某个请求打进来才发现端口是 NaN。
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.resolve(__dirname, '../..')

const problems = []

const isBlank = (v) => v === undefined || v === null || String(v).trim() === ''

function readEnv(key, { fallback, required = false, validator } = {}) {
  const raw = process.env[key]

  if (isBlank(raw)) {
    if (required) {
      problems.push(`缺少必填环境变量 ${key}`)
      return undefined
    }
    // ⚠️ 兜底值也要过一遍校验器：否则像 DB_FILE 这种「相对路径 → 绝对路径」的
    // 归一化会被绕过，导致同一份配置在「显式设置」和「用默认值」时行为不一致。
    if (validator && typeof fallback === 'string') {
      const checked = validator(fallback)
      if (!checked.ok) {
        problems.push(`${key} 的默认值 "${fallback}" 不合法：${checked.reason}`)
        return undefined
      }
      return checked.value
    }
    return fallback
  }

  const value = String(raw).trim()
  const result = validator ? validator(value) : { ok: true, value }

  if (!result.ok) {
    problems.push(`${key} = "${value}" 不合法：${result.reason}`)
    return fallback
  }
  return result.value
}

const asInt = (min, max) => (v) => {
  const n = Number(v)
  if (!Number.isInteger(n)) return { ok: false, reason: '不是整数' }
  if (n < min || n > max) return { ok: false, reason: `需要在 ${min}..${max} 之间` }
  return { ok: true, value: n }
}

const asEnum = (allowed) => (v) => {
  const lower = v.toLowerCase()
  return allowed.includes(lower)
    ? { ok: true, value: lower }
    : { ok: false, reason: `只接受 ${allowed.join(' / ')}` }
}

/** 布尔开关：true/1/yes/on 与 false/0/no/off 都认，其余报错而不是悄悄当 false。 */
const asBool = (v) => {
  const lower = v.toLowerCase()
  if (['true', '1', 'yes', 'on'].includes(lower)) return { ok: true, value: true }
  if (['false', '0', 'no', 'off'].includes(lower)) return { ok: true, value: false }
  return { ok: false, reason: '只接受 true / false' }
}

/** 数据库路径：允许相对路径，相对 server/ 解析，便于本地开箱即用。 */
const asDbPath = (v) => ({ ok: true, value: path.isAbsolute(v) ? v : path.resolve(SERVER_ROOT, v) })

/** CORS 白名单：逗号分隔。`*` 只在非生产环境放行。 */
function asOrigins(v) {
  const list = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.length === 0) return { ok: false, reason: '至少要写一个来源，或写 *' }
  return { ok: true, value: list }
}

const NODE_ENV = readEnv('NODE_ENV', { fallback: 'development', validator: asEnum(['development', 'test', 'production']) })

const config = {
  nodeEnv: NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',

  server: {
    port: readEnv('PORT', { fallback: 8787, validator: asInt(1, 65535) }),
    // 默认只绑本机；要对外提供服务时显式设 HOST=0.0.0.0
    host: readEnv('HOST', { fallback: '127.0.0.1' }),
    // 优雅停机的兜底时长：超时后强制退出，避免连接卡死导致进程不退出
    shutdownTimeoutMs: readEnv('SHUTDOWN_TIMEOUT_MS', { fallback: 10_000, validator: asInt(1000, 60_000) }),
  },

  db: {
    file: readEnv('DB_FILE', { fallback: 'data/soft-life.db', validator: asDbPath }),
    // SQLite 的 busy_timeout：并发写被锁住时的等待上限
    busyTimeoutMs: readEnv('DB_BUSY_TIMEOUT_MS', { fallback: 5000, validator: asInt(0, 30_000) }),
    // 启动时自动应用迁移。开发默认开（改完 schema 直接跑）；
    // 生产默认关 —— 多实例部署时让迁移走单独的发布步骤，避免实例之间抢着改表。
    autoMigrate: readEnv('DB_AUTO_MIGRATE', { fallback: NODE_ENV !== 'production', validator: asBool }),
  },

  admin: {
    // 管理页构建产物目录；存在就由本服务一并托管，实现「单进程跑全栈」
    distDir: readEnv('ADMIN_DIST_DIR', { fallback: '../admin/dist', validator: asDbPath }),
    serve: readEnv('SERVE_ADMIN', { fallback: true, validator: asBool }),
  },

  cors: {
    origins: readEnv('CORS_ORIGINS', {
      fallback: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      validator: asOrigins,
    }),
  },

  api: {
    prefix: '/api/v1',
    // 请求体上限：商品描述这类文本不需要大 body
    bodyLimit: '100kb',
    defaultPageSize: 20,
    maxPageSize: 100,
  },

  log: {
    level: readEnv('LOG_LEVEL', { fallback: 'info', validator: asEnum(['debug', 'info', 'warn', 'error']) }),
  },
}

// 开发期用 * 无害，生产必须写明具体来源
if (config.isProduction && config.cors.origins.includes('*')) {
  problems.push('生产环境 CORS_ORIGINS 不允许使用 *，请写明具体来源')
}

if (problems.length > 0) {
  const lines = problems.map((p) => `  - ${p}`).join('\n')
  throw new Error(`配置校验失败，进程拒绝启动：\n${lines}`)
}

export const serverRoot = SERVER_ROOT
export default Object.freeze(config)
