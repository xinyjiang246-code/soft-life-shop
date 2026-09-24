/**
 * 请求 ID 中间件。
 *
 * 每个请求一个 id，同时进三处：响应头、req.id、该请求的所有日志。
 * 客户端报问题时带上这个 id，就能在日志里精确捞出那一次调用。
 *
 * 如果上游（网关 / 反向代理）已经给了 x-request-id，就沿用它 —— 保持全链路同一个 id。
 */
import crypto from 'node:crypto'

const HEADER = 'x-request-id'
// 只接受合理长度的可见 ASCII，避免有人塞超长串进日志
const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/

export default function requestId(req, res, next) {
  const incoming = req.get(HEADER)
  const id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID()

  req.id = id
  res.setHeader(HEADER, id)
  next()
}
