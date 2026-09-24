/**
 * 进程入口：开库 → （可选）跑迁移 → 起 HTTP → 处理优雅停机。
 *
 * 启动失败必须「响亮地死掉」：端口被占、迁移失败、配置不对，
 * 都应该立刻退出并打清楚原因，而不是起一个半残的服务在那儿收请求。
 */
import config from './config/index.js'
import logger from './lib/logger.js'
import { createApp } from './app.js'
import { openDb, closeDb, ping } from './db/index.js'
import { runMigrations } from './db/migrate.js'

function bootstrapDatabase() {
  openDb()

  if (!ping()) throw new Error('数据库连接失败')

  if (config.db.autoMigrate) {
    const ran = runMigrations()
    logger.info('db.migrated_on_boot', { ran, count: ran.length })
  } else {
    logger.info('db.auto_migrate_disabled', { hint: '请先执行 npm run migrate' })
  }
}

function main() {
  logger.info('boot.start', {
    env: config.nodeEnv,
    node: process.version,
    pid: process.pid,
  })

  bootstrapDatabase()

  const app = createApp()
  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info('http.listening', {
      url: `http://${config.server.host}:${config.server.port}`,
      api: `${config.api.prefix}`,
    })
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error('http.port_in_use', {
        port: config.server.port,
        hint: '换一个 PORT，或先停掉占用该端口的进程',
      })
    } else {
      logger.error('http.server_error', { error: err.message, code: err.code })
    }
    closeDb()
    process.exit(1)
  })

  // —— 优雅停机 ——
  let shuttingDown = false

  function shutdown(signal) {
    if (shuttingDown) return
    shuttingDown = true

    logger.info('shutdown.begin', { signal })

    // 兜底：超时还没关干净就强退，避免进程永远挂着
    const force = setTimeout(() => {
      logger.error('shutdown.forced', { timeoutMs: config.server.shutdownTimeoutMs })
      process.exit(1)
    }, config.server.shutdownTimeoutMs)
    force.unref()

    // 停止接收新连接；空闲的 keep-alive 连接可以直接断掉，不用等它们自然超时
    server.closeIdleConnections?.()
    server.close((err) => {
      if (err) logger.warn('shutdown.close_error', { error: err.message })

      closeDb()
      clearTimeout(force)
      logger.info('shutdown.done', { signal })
      process.exit(0)
    })
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => shutdown(signal))
  }

  // 未捕获异常：进程状态已不可信，记录后退出，交给进程守护重启
  process.on('uncaughtException', (err) => {
    logger.error('process.uncaught_exception', { error: err.message, stack: err.stack })
    shutdown('uncaughtException')
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  })
}

main()
