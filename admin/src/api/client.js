/**
 * API 客户端 —— 前端唯一允许发请求的地方。
 *
 * 收敛在这一个文件的四件事：
 *   ① Base URL 全部来自环境变量，绝不散落在组件里硬编码
 *   ② 超时（AbortController）—— 别让一个卡住的请求把界面永远吊在 loading
 *   ③ 重试策略：5xx / 网络故障自动重试（最多 3 次，指数退避），4xx 一次都不重试
 *      （4xx 是「你发错了」，重试只会重复发错）
 *   ④ 错误归一化：把后端的结构化错误 + 网络故障，统一成带友好文案的 ApiError
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL

/**
 * 未配置 VITE_API_BASE_URL 时：
 *   开发 → 后端在 8787，跨源访问（走 CORS）
 *   构建 → 留空 = 同源（由 server 一并托管）
 */
const BASE = (
  RAW_BASE !== undefined && String(RAW_BASE).trim() !== ''
    ? String(RAW_BASE)
    : import.meta.env.PROD
      ? ''
      : 'http://127.0.0.1:8787'
)
  .trim()
  .replace(/\/+$/, '')

const API_PREFIX = '/api/v1'
const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 8000)
const MAX_RETRIES = 3

/** 兜底文案。只在服务器没给出可读信息时使用（5xx / 网络层）。 */
const CODE_MESSAGES = {
  VALIDATION_FAILED: '提交的内容有问题，请检查标红的字段',
  BAD_REQUEST: '请求参数不正确',
  INVALID_JSON: '请求格式不正确',
  NOT_FOUND: '这条数据已经不存在了，刷新一下看看',
  CONFLICT: '和现有数据冲突，请调整后重试',
  PAYLOAD_TOO_LARGE: '提交的内容太大',
  SERVICE_UNAVAILABLE: '服务暂时不可用，请稍后重试',
  INTERNAL_ERROR: '服务器出错了，请稍后重试',
  NETWORK_ERROR: '连不上服务器 —— 确认后端已启动（npm run dev）',
  TIMEOUT: '请求超时，服务器响应太慢',
  OFFLINE: '网络似乎断开了，请检查连接',
  BAD_RESPONSE: '服务器返回了无法解析的内容',
}

/** 统一错误类型：组件只需要读 message / fieldErrors / requestId。 */
export class ApiError extends Error {
  constructor(message, { code, status = 0, details, requestId, retryable = false, cause } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
    this.requestId = requestId
    this.retryable = retryable
    this.cause = cause
  }

  /** 网络层故障（连不上 / 断网），不是服务器返回的业务错误 */
  get isNetworkError() {
    return this.status === 0
  }

  /** 字段级错误：把 details 整理成 { 字段名: 提示 }，供表单逐项标红 */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {}
    const map = {}
    for (const d of this.details) {
      if (d?.field && !map[d.field]) map[d.field] = d.message
    }
    return map
  }

  /** 给用户看的一行文案，附带 requestId 方便排查 */
  get displayMessage() {
    return this.requestId ? `${this.message}（追踪号 ${this.requestId.slice(0, 8)}）` : this.message
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 指数退避 + 抖动：避免多个组件同时重试形成尖峰 */
const backoff = (attempt) => 300 * 2 ** (attempt - 1) + Math.random() * 200

function buildUrl(path, query) {
  const url = `${BASE}${API_PREFIX}${path}`
  if (!query) return url

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    // 空字符串 / null / undefined 一律不带上 —— 别用空值污染后端筛选
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

/** 把 fetch 的各种失败翻译成 ApiError。 */
function toApiError(err) {
  if (err instanceof ApiError) return err

  // AbortController 触发
  if (err?.name === 'AbortError') {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return new ApiError(CODE_MESSAGES.OFFLINE, { code: 'OFFLINE', retryable: false })
    }
    return new ApiError(CODE_MESSAGES.TIMEOUT, { code: 'TIMEOUT', retryable: true, cause: err })
  }

  // fetch 抛 TypeError = 根本没连上（DNS / 端口没开 / CORS 被拦）
  if (err instanceof TypeError || err?.name === 'TypeError') {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    return new ApiError(offline ? CODE_MESSAGES.OFFLINE : CODE_MESSAGES.NETWORK_ERROR, {
      code: offline ? 'OFFLINE' : 'NETWORK_ERROR',
      // 断网重试没意义；服务没起来则值得重试（可能正在启动）
      retryable: !offline,
      cause: err,
    })
  }

  return new ApiError(err?.message ?? '未知错误', { code: 'UNKNOWN', retryable: false, cause: err })
}

async function once(method, path, { body, query, signal } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  // 外部传入的 signal（组件卸载时取消）也要能中断本次请求
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  let res
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    throw toApiError(err)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }

  const requestId = res.headers.get('x-request-id') ?? undefined

  // 204 没有响应体
  if (res.status === 204) return null

  const text = await res.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new ApiError(CODE_MESSAGES.BAD_RESPONSE, {
        code: 'BAD_RESPONSE',
        status: res.status,
        requestId,
        retryable: res.status >= 500,
      })
    }
  }

  if (res.ok) return payload

  const serverError = payload?.error ?? {}
  const status = res.status
  const retryable = status >= 500

  // 4xx 用后端原话（「SKU 已被占用」这类信息比通用文案有用得多）；
  // 5xx 一律用兜底文案，不把内部细节透给界面。
  const message =
    status < 500 && serverError.message
      ? serverError.message
      : (CODE_MESSAGES[serverError.code] ?? `请求失败（HTTP ${status}）`)

  throw new ApiError(message, {
    code: serverError.code ?? `HTTP_${status}`,
    status,
    details: serverError.details,
    requestId: serverError.requestId ?? requestId,
    retryable,
  })
}

/** 带重试的请求。重试只发生在 5xx 与网络故障上，4xx 立即抛出。 */
async function request(method, path, options = {}) {
  let lastError
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await once(method, path, options)
    } catch (err) {
      lastError = err
      // 组件主动取消 → 立刻停，别重试
      if (options.signal?.aborted) throw err
      if (!err.retryable || attempt === MAX_RETRIES) throw err
      options.onRetry?.(attempt, err)
      await sleep(backoff(attempt))
    }
  }
  throw lastError
}

/** 后端响应统一是 { data, pagination? }，这里剥掉外层信封。 */
const unwrap = (payload) => payload?.data ?? null

export const api = {
  baseUrl: BASE || '(同源)',

  health: () => request('GET', '/health').catch(() => null),

  /** 主动探测后端是否可达，用于顶部状态灯 */
  async ping() {
    try {
      await request('GET', '/health')
      return true
    } catch {
      return false
    }
  },

  stores: {
    list: () => request('GET', '/stores').then(unwrap),
  },

  items: {
    /** @returns {{ items: Array, pagination: Object }} */
    async list(query, { signal } = {}) {
      const payload = await request('GET', '/items', { query, signal })
      return { items: payload?.data ?? [], pagination: payload?.pagination ?? null }
    },

    get: (id, { signal } = {}) => request('GET', `/items/${id}`, { signal }).then(unwrap),

    create: (body) => request('POST', '/items', { body }).then(unwrap),

    update: (id, body) => request('PATCH', `/items/${id}`, { body }).then(unwrap),

    /**
     * 删除。
     * 404 视为成功：DELETE 是幂等的，如果第一次其实已经删掉、只是响应在网络上丢了，
     * 重试会拿到 404 —— 那不该报给用户一个「失败了」。
     */
    async remove(id) {
      try {
        return await request('DELETE', `/items/${id}`)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      }
    },
  },

  facets: () => request('GET', '/items/facets').then(unwrap),

  /** 单品上架 / 下架：只发一个字段的 PATCH */
  async setActive(id, isActive) {
    const payload = await request('PATCH', `/items/${id}`, { body: { isActive } })
    return unwrap(payload)
  },

  async setStock(id, inStock) {
    const payload = await request('PATCH', `/items/${id}`, { body: { inStock } })
    return unwrap(payload)
  },
}

export default api
