/**
 * 健康检查。
 *
 * /health  = liveness：进程活着就 200。不查数据库 —— 探针只该回答「要不要重启我」。
 * /ready   = readiness：数据库连得上 **且** 迁移已全部应用，否则 503。
 *            流量不该被路由到一个 schema 还没 migration 完的实例上。
 */
import config from '../config/index.js'
import logger from '../lib/logger.js'
import { ping } from '../db/index.js'
import { status as migrationStatus } from '../db/migrate.js'

const startedAt = Date.now()

export function health(_req, res) {
  res.json({
    status: 'ok',
    service: 'soft-life-server',
    env: config.nodeEnv,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  })
}

export function ready(_req, res) {
  const checks = {}

  checks.database = ping() ? 'ok' : 'fail'
  checks.migrations = 'ok'
  let pending = []

  if (checks.database === 'ok') {
    try {
      pending = migrationStatus()
        .filter((m) => m.state === 'pending')
        .map((m) => `${m.version}_${m.name}`)
      checks.migrations = pending.length === 0 ? 'ok' : 'pending'
    } catch (err) {
      checks.migrations = 'fail'
      logger.warn('health.migration_check_failed', { error: err.message })
    }
  }

  const ready = checks.database === 'ok' && checks.migrations === 'ok'

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks,
    pendingMigrations: pending,
    timestamp: new Date().toISOString(),
  })
}
