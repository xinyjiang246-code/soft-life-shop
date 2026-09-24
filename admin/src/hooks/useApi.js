/**
 * 数据获取 hooks。
 *
 * 共同处理三件容易漏掉的事：
 *   ① 组件卸载时 abort 请求 —— 否则会往已卸载的组件 setState
 *   ② 丢弃过期响应 —— 快速改筛选条件时，先发的请求可能后到，
 *      不加序号判断就会出现「筛选条件已变、列表还是旧数据」
 *   ③ loading / error / empty 三态齐全，组件不用各自 if 一遍
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import api from '../api/client.js'

/**
 * 通用异步数据 hook。
 * @param {Function} fetcher (opts: { signal }) => Promise<T>
 * @param {Array} deps 依赖变化即重新取数
 */
export function useAsyncData(fetcher, deps, { enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [reloadToken, setReloadToken] = useState(0)

  const requestSeq = useRef(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    const seq = (requestSeq.current += 1)

    setLoading(true)
    setError(null)

    fetcherRef
      .current({ signal: controller.signal })
      .then((result) => {
        // 过期响应：已经有更新的请求发出去了，这次结果直接丢掉
        if (seq !== requestSeq.current) return
        setData(result)
        setLoading(false)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        if (seq !== requestSeq.current) return
        setError(err)
        setLoading(false)
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken, enabled])

  const reload = useCallback(() => setReloadToken((n) => n + 1), [])

  return { data, error, loading, reload, setData }
}

/** 商品列表（带分页）。query 变化即重新取数。 */
export function useItems(query) {
  // 把 query 序列化成稳定字符串当依赖，避免「每次渲染都是新对象」导致无限循环
  const key = useMemo(() => JSON.stringify(query), [query])

  const state = useAsyncData(() => api.items.list(JSON.parse(key)), [key])

  return {
    items: state.data?.items ?? [],
    pagination: state.data?.pagination ?? null,
    loading: state.loading,
    error: state.error,
    reload: state.reload,
    /** 局部替换一行：切换上下架后避免整表重新拉取 */
    patchItem: (updated) =>
      state.setData((prev) =>
        prev
          ? { ...prev, items: prev.items.map((it) => (it.id === updated.id ? updated : it)) }
          : prev,
      ),
    removeItem: (id) =>
      state.setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((it) => it.id !== id),
              pagination: prev.pagination
                ? { ...prev.pagination, total: Math.max(0, prev.pagination.total - 1) }
                : prev.pagination,
            }
          : prev,
      ),
  }
}

export function useStores() {
  const state = useAsyncData(() => api.stores.list(), [])
  return { stores: state.data ?? [], loading: state.loading, error: state.error }
}

export function useFacets() {
  const state = useAsyncData(() => api.facets(), [])
  return { facets: state.data, loading: state.loading, error: state.error, reload: state.reload }
}

/** 轻量提示条：成功/失败各显示几秒后自动消失。 */
export function useToasts() {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (kind, message, { timeout = 4000 } = {}) => {
      const id = (seq.current += 1)
      setToasts((list) => [...list, { id, kind, message }])
      if (timeout > 0) setTimeout(() => dismiss(id), timeout)
      return id
    },
    [dismiss],
  )

  return {
    toasts,
    dismiss,
    success: useCallback((msg) => push('success', msg), [push]),
    error: useCallback((msg) => push('error', msg, { timeout: 8000 }), [push]),
    info: useCallback((msg) => push('info', msg), [push]),
  }
}

/** 后端可达性心跳：顶部状态灯用。 */
export function useBackendStatus() {
  const [online, setOnline] = useState(null)

  const check = useCallback(() => {
    let cancelled = false
    api.ping().then((ok) => {
      if (!cancelled) setOnline(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const cancel = check()
    // 30 秒一次足够了 —— 这是给人看的状态灯，不是探针
    const timer = setInterval(() => check(), 30_000)
    return () => {
      cancel()
      clearInterval(timer)
    }
  }, [check])

  return { online, recheck: check }
}
