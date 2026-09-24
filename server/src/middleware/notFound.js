/**
 * 404 兜底：任何没被路由接住的请求走到这里。
 * 注意要挂在所有路由之后、errorHandler 之前。
 */
import { NotFoundError } from '../errors/index.js'

export default function notFound(req, _res, next) {
  next(new NotFoundError(`接口不存在：${req.method} ${req.path}`, { method: req.method, path: req.path }))
}
