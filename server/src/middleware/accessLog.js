/**
 * 访问日志中间件：一条请求一行 JSON。
 * 记录 方法 / 路径 / 状态码 / 耗时 / requestId —— 不记录 body（可能含隐私）。
 */
import logger from '../lib/logger.js'

export default function accessLog(req, res, next) {
  const startedAt = process.hrtime.bigint()

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'

    logger[level]('http.request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    })
  })

  next()
}
