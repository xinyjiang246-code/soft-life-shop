/**
 * 把 async 控制器包起来，让 reject 也能进全局错误处理。
 *
 * 当前所有控制器都是同步的（node:sqlite 是同步 API），Express 4 能自己接住同步 throw。
 * 但这个包装留着 —— 以后一旦有控制器改成 async（比如调用外部 API），
 * 忘了包 asyncHandler 就会变成「请求挂住不返回」这种最难查的 bug。
 */
export default function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    try {
      const result = fn(req, res, next)
      if (result && typeof result.then === 'function') result.catch(next)
    } catch (err) {
      next(err)
    }
  }
}
