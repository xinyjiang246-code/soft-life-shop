/**
 * 在边界处校验输入 —— 绝不信任客户端。
 *
 * 用法：
 *   router.post('/', validate({ body: createItemSchema }), controller)
 *
 * 校验结果统一放在 `req.valid`，不覆盖 req.body / req.query：
 *   · Express 的 req.query 在不同版本里可能是只读的 getter
 *   · 保留原始输入，排障时能看到客户端到底发了什么
 * 控制器只读 req.valid，拿到的就是「已解析、已带默认值」的干净数据。
 */
import { ValidationError, BadRequestError } from '../errors/index.js'

export default function validate(schemas = {}) {
  return function validateMiddleware(req, _res, next) {
    const valid = {}
    const issues = []

    for (const source of ['params', 'query', 'body']) {
      const schema = schemas[source]
      if (!schema) continue

      // Express 4 在部分场景下 req.body 是 undefined（没有 body 的请求）
      const input = req[source] ?? (source === 'body' ? {} : {})

      const result = schema.safeParse(input)
      if (result.success) {
        valid[source] = result.data
        continue
      }

      for (const issue of result.error.issues) {
        // 未知字段：zod 把具体键名放在 issue.keys 里，直接抖出来比「包含不支持的字段」有用得多
        const unknownKeys = issue.code === 'unrecognized_keys' ? issue.keys : null

        issues.push({
          source,
          field: unknownKeys ? unknownKeys.join(', ') : issue.path.join('.') || '(root)',
          message: unknownKeys ? '不是可接受的字段，请删掉' : issue.message,
        })
      }
    }

    if (issues.length > 0) {
      // body 不合规算请求内容有问题（422）；path/query 不合规更像请求发错了（400）
      const onlyBody = issues.every((i) => i.source === 'body')
      const ErrorClass = onlyBody ? ValidationError : BadRequestError
      const prefix = {
        body: '请求体',
        query: '查询参数',
        params: '路径参数',
      }
      const summary = issues
        .slice(0, 3)
        .map((i) => `${prefix[i.source]}「${i.field}」${i.message}`)
        .join('；')

      return next(new ErrorClass(`${summary}${issues.length > 3 ? ` 等 ${issues.length} 处问题` : ''}`, issues))
    }

    req.valid = valid
    return next()
  }
}
