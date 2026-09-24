/**
 * Express 应用装配。
 *
 * ⚠️ 中间件顺序就是契约，不要随意调整：
 *   requestId → accessLog → cors → json → 路由 → notFound → errorHandler
 *
 * 说明几个刻意的选择：
 *   · requestId 放最前 —— 后面所有日志（含错误日志）都要带上它
 *   · accessLog 在 cors 之前 —— 连被 CORS 拒掉的请求也要留下记录
 *   · errorHandler 必须最后，且必须 4 个形参（Express 靠形参个数识别错误中间件）
 */
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cors from 'cors'

import config from './config/index.js'
import logger from './lib/logger.js'
import requestId from './middleware/requestId.js'
import accessLog from './middleware/accessLog.js'
import notFound from './middleware/notFound.js'
import errorHandler from './middleware/errorHandler.js'
import apiRouter from './routes/index.js'
import { health, ready } from './routes/health.js'

function buildCorsOptions() {
  const allowed = config.cors.origins

  return {
    origin(origin, callback) {
      // 无 Origin：同源请求、curl、服务端调用 —— 放行
      if (!origin) return callback(null, true)

      if (allowed.includes('*') || allowed.includes(origin)) return callback(null, true)

      // 关键：这里不能 callback(new Error(...))，否则客户端拿到的是 500。
      // 返回 false 表示「不加 CORS 头」，浏览器自己会拦下来 —— 这才是标准行为。
      logger.warn('cors.rejected', { origin, allowed })
      return callback(null, false)
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Location'],
    credentials: false,
    maxAge: 86_400,
  }
}

/** 如果 admin 已经构建过，就顺带把静态页托管了 —— 单进程跑全栈。 */
function mountAdmin(app) {
  if (!config.admin.serve) {
    logger.info('admin.serve_disabled')
    return
  }

  const distDir = config.admin.distDir
  const indexPath = path.join(distDir, 'index.html')

  if (!fs.existsSync(indexPath)) {
    logger.info('admin.not_built', { distDir, hint: 'cd admin && npm run build 之后重启即可托管' })
    return
  }

  app.use(express.static(distDir, { index: false, maxAge: '1h' }))

  // SPA 兜底：非 /api 的 GET 请求都交给 index.html，前端路由自己处理
  app.get(/^\/(?!api\/|health$|ready$).*/, (_req, res) => {
    res.sendFile(indexPath)
  })

  logger.info('admin.serving', { distDir })
}

export function createApp() {
  const app = express()

  // 不暴露技术栈指纹
  app.disable('x-powered-by')
  app.set('etag', 'strong')

  app.use(requestId)
  app.use(accessLog)
  app.use(cors(buildCorsOptions()))
  app.use(express.json({ limit: config.api.bodyLimit }))

  // 探针挂在根路径：这是 k8s / 负载均衡器默认会去探的位置
  app.get('/health', health)
  app.get('/ready', ready)

  app.use(config.api.prefix, apiRouter)

  mountAdmin(app)

  // 顺序不能反：先 notFound（把未匹配的请求变成 404 错误），再 errorHandler（统一渲染）
  app.use(notFound)
  app.use(errorHandler)

  return app
}

export default createApp
