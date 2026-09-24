/**
 * 结构化 JSON 日志。
 *
 * 一行一个 JSON —— 便于 grep、也便于以后接采集器。
 * 敏感字段一律脱敏：日志里出现 token / password 这类键，值直接换成 [redacted]。
 */
import config from '../config/index.js'

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const threshold = LEVELS[config.log.level] ?? LEVELS.info

const SENSITIVE = /pass|secret|token|authorization|cookie|apikey|api_key/i

/** 递归脱敏，保护到嵌套两层的对象。 */
function redact(value, depth = 0) {
  if (depth > 3 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))

  const out = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1)
  }
  return out
}

function emit(level, msg, fields = {}) {
  if (LEVELS[level] < threshold) return

  const record = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...redact(fields),
  }

  const line = JSON.stringify(record)
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`)
  else process.stdout.write(`${line}\n`)
}

const logger = {
  debug: (msg, fields) => emit('debug', msg, fields),
  info: (msg, fields) => emit('info', msg, fields),
  warn: (msg, fields) => emit('warn', msg, fields),
  error: (msg, fields) => emit('error', msg, fields),
  /** 子 logger：把 requestId 之类固定字段钉进每条日志 */
  child(bound = {}) {
    return {
      debug: (msg, fields) => emit('debug', msg, { ...bound, ...fields }),
      info: (msg, fields) => emit('info', msg, { ...bound, ...fields }),
      warn: (msg, fields) => emit('warn', msg, { ...bound, ...fields }),
      error: (msg, fields) => emit('error', msg, { ...bound, ...fields }),
      child: (more) => logger.child({ ...bound, ...more }),
    }
  },
}

export default logger
