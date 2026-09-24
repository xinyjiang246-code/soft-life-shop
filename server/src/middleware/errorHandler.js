/**
 * 全局错误处理（Express 的 4 参中间件，必须放在所有路由之后）。
 *
 * 客户端只会看到规范化的错误结构：
 *   { error: { code, message, details?, requestId } }
 *
 * 永远不会看到堆栈、SQL 语句、文件路径或内部模块名 —— 这些只进日志。
 */
import logger from '../lib/logger.js'
import config from '../config/index.js'
import { AppError } from '../errors/index.js'

/** 把 Express / body-parser 抛出的「非本项目的错误」翻译成 AppError。 */
function normalize(err) {
  if (err instanceof AppError) return err

  // express.json() 遇到非法 JSON
  if (err?.type === 'entity.parse.failed') {
    return new AppError('请求体不是合法的 JSON', {
      statusCode: 400,
      code: 'INVALID_JSON',
      details: { hint: '请确认 Content-Type: application/json 且 body 是合法 JSON' },
    })
  }

  // 请求体超过上限
  if (err?.type === 'entity.too.large') {
    return new AppError(`请求体超过上限（${config.api.bodyLimit}）`, {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
    })
  }

  // 路由未匹配到（不应该走到这，notFound 中间件会先处理，兜底用）
  if (err?.status === 404 || err?.statusCode === 404) {
    return new AppError('接口不存在', { statusCode: 404, code: 'ROUTE_NOT_FOUND' })
  }

  return null
}

// eslint-disable-next-line no-unused-vars —— Express 靠 4 个形参识别错误中间件，next 不能省
export default function errorHandler(err, req, res, next) {
  const known = normalize(err)
  const requestId = req.id

  if (!known) {
    // 非预期异常：日志里留全量堆栈，客户端只拿到一句通用提示
    logger.error('http.unhandled_error', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      error: err?.message,
      stack: err?.stack,
    })

    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误，请稍后重试',
        requestId,
      },
    })
  }

  const level = known.statusCode >= 500 ? 'error' : 'warn'
  logger[level]('http.handled_error', {
    requestId,
    method: req.method,
    path: req.originalUrl,
    status: known.statusCode,
    code: known.code,
    message: known.message,
    details: known.details,
  })

  const body = {
    error: {
      code: known.code,
      // 标记了 expose:false 的错误只给通用文案
      message: known.expose || !config.isProduction ? known.message : '服务器内部错误，请稍后重试',
      requestId,
    },
  }

  if (known.details !== undefined) body.error.details = known.details

  return res.status(known.statusCode).json(body)
}
