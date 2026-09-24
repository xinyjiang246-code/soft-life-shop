/**
 * 类型化错误体系。
 *
 * 规则：凡是「预料之中」的失败都用 AppError 的子类抛出（带 statusCode + 机器可读 code），
 * 全局错误处理中间件据此给客户端规范化的 JSON；
 * 其余未预期的异常一律降级成 500，堆栈只进日志、绝不返回给客户端。
 */

export class AppError extends Error {
  /**
   * @param {string} message 面向开发者的说明（会进日志）
   * @param {object} opts
   * @param {number} opts.statusCode HTTP 状态码
   * @param {string} opts.code 机器可读错误码，前端据此做分支
   * @param {unknown} [opts.details] 附加信息，例如字段级校验错误
   * @param {boolean} [opts.expose=true] 是否把 message 原样返回给客户端
   */
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details, expose = true } = {}) {
    super(message)
    this.name = new.target.name
    this.statusCode = statusCode
    this.code = code
    this.details = details
    this.expose = expose
    this.isOperational = true
    Error.captureStackTrace?.(this, new.target)
  }
}

export class BadRequestError extends AppError {
  constructor(message = '请求格式不正确', details) {
    super(message, { statusCode: 400, code: 'BAD_REQUEST', details })
  }
}

/** 字段级校验失败统一走这个：details 里带每个字段为什么不合格。 */
export class ValidationError extends AppError {
  constructor(message = '请求参数校验未通过', details) {
    super(message, { statusCode: 422, code: 'VALIDATION_FAILED', details })
  }
}

export class NotFoundError extends AppError {
  constructor(message = '资源不存在', details) {
    super(message, { statusCode: 404, code: 'NOT_FOUND', details })
  }
}

export class ConflictError extends AppError {
  constructor(message = '与现有数据冲突', details) {
    super(message, { statusCode: 409, code: 'CONFLICT', details })
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = '服务暂时不可用', details) {
    super(message, { statusCode: 503, code: 'SERVICE_UNAVAILABLE', details })
  }
}
