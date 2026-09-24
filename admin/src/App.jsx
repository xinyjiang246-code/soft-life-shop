/**
 * 管理页主界面。
 *
 * 状态分层：
 *   筛选条件 query → 由 App 持有（唯一事实来源，Filters 只是受控视图）
 *   列表数据       → 交给 useItems（内部处理取消/过期响应）
 *   行内忙碌态     → busyId，同一时刻只允许一行在操作，避免连点产生竞态
 */
import { useCallback, useMemo, useState } from 'react'

import api, { ApiError } from './api/client.js'
import { useBackendStatus, useFacets, useItems, useStores, useToasts } from './hooks/useApi.js'
import Filters from './components/Filters.jsx'
import ItemForm from './components/ItemForm.jsx'
import ItemTable from './components/ItemTable.jsx'
import { ToastStack } from './components/States.jsx'

const INITIAL_QUERY = {
  q: '',
  storeId: '',
  category: '',
  tag: '',
  inStock: '',
  isActive: '',
  sort: 'updatedAt',
  order: 'desc',
  page: 1,
  pageSize: 20,
}

const PAGE_SIZES = [10, 20, 50, 100]

/** 把 ApiError 变成一句能直接给用户看的话 */
const errText = (err) => (err instanceof ApiError ? err.displayMessage : (err?.message ?? '操作失败'))

export default function App() {
  const [query, setQuery] = useState(INITIAL_QUERY)
  const [busyId, setBusyId] = useState(null)
  const [modal, setModal] = useState({ open: false, mode: 'create', initial: null })

  const { items, pagination, loading, error, reload, patchItem, removeItem } = useItems(query)
  const { stores } = useStores()
  const { facets, reload: reloadFacets } = useFacets()
  const toast = useToasts()
  const { online } = useBackendStatus()

  const filtered = useMemo(
    () => Boolean(query.q || query.storeId || query.category || query.tag || query.inStock || query.isActive),
    [query],
  )

  const resetFilters = useCallback(() => setQuery(INITIAL_QUERY), [])

  const openCreate = () => setModal({ open: true, mode: 'create', initial: null })
  const openEdit = (item) => setModal({ open: true, mode: 'edit', initial: item })
  const closeModal = () => setModal((m) => ({ ...m, open: false }))

  /** 保存成功后：列表与统计都要刷新（总数、品类、标签可能都变了） */
  const handleSaved = (saved, mode) => {
    closeModal()
    toast.success(mode === 'create' ? `已创建「${saved.nameCn}」` : `已保存「${saved.nameCn}」`)
    reload()
    reloadFacets()
  }

  async function handleDelete(item) {
    setBusyId(item.id)
    try {
      await api.items.remove(item.id)
      toast.success(`已删除「${item.nameCn}」`)

      // 删掉的是本页最后一条且不在第一页 → 退一页，否则会停在一个空页上
      if (items.length === 1 && query.page > 1) {
        setQuery((prev) => ({ ...prev, page: prev.page - 1 }))
      } else {
        removeItem(item.id)
      }
      reloadFacets()
    } catch (err) {
      toast.error(errText(err))
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggle(item, field, value) {
    setBusyId(item.id)
    try {
      const updated = field === 'isActive' ? await api.setActive(item.id, value) : await api.setStock(item.id, value)
      patchItem(updated)
      if (field === 'isActive') reloadFacets()
    } catch (err) {
      toast.error(errText(err))
      // 失败时不改本地状态 —— 界面依然反映数据库里的真实情况
    } finally {
      setBusyId(null)
    }
  }

  const totalPages = pagination?.totalPages ?? 0
  const currentPage = pagination?.page ?? query.page
  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>商品管理</h1>
          <p className="brand-sub">
            慢活小铺 · 独立后台
            <span className="brand-note">不参与小铺发布链</span>
          </p>
        </div>

        <div className="topbar-right">
          <div className="stats" aria-label="统计">
            <Stat label="商品" value={facets?.counts?.total} />
            <Stat label="上架" value={facets?.counts?.active} />
            <Stat label="缺货" value={facets?.counts?.outOfStock} tone={facets?.counts?.outOfStock > 0 ? 'warn' : undefined} />
          </div>
          <span className={`status-dot status-${online === null ? 'unknown' : online ? 'ok' : 'down'}`} title={online === null ? '检测中' : online ? `后端已连通 · ${api.baseUrl}` : `连不上后端 · ${api.baseUrl}`}>
            {online === null ? '检测中' : online ? '后端已连通' : '后端未连接'}
          </span>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            新建商品
          </button>
        </div>
      </header>

      <Filters query={query} onChange={setQuery} stores={stores} facets={facets} onReset={resetFilters} busy={loading} />

      <main>
        <ItemTable
          items={items}
          loading={loading}
          error={error}
          filtered={filtered}
          busyId={busyId}
          onEdit={openEdit}
          onDelete={handleDelete}
          onToggleActive={(item, value) => handleToggle(item, 'isActive', value)}
          onToggleStock={(item, value) => handleToggle(item, 'inStock', value)}
          onRetry={reload}
          onReset={resetFilters}
          onCreate={openCreate}
        />

        {!loading && !error && (pagination?.total ?? 0) > 0 && (
          <nav className="pager" aria-label="分页">
            <span className="pager-info">
              共 {pagination.total} 件 · 第 {currentPage} / {totalPages || 1} 页
              {pagination.hasNext ? '' : '（末页）'}
            </span>

            <label className="pager-size">
              每页
              <select
                value={query.pageSize}
                onChange={(e) => setQuery((prev) => ({ ...prev, pageSize: Number(e.target.value), page: 1 }))}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <span className="pager-btns">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!canPrev || loading}
                onClick={() => setQuery((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                上一页
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={!canNext || loading}
                onClick={() => setQuery((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                下一页
              </button>
            </span>
          </nav>
        )}
      </main>

      <footer className="foot">
        <span>
          数据源 <code>server/data/soft-life.db</code>（SQLite）
        </span>
        <span>
          接口 <code>{api.baseUrl}/api/v1</code>
        </span>
      </footer>

      <ItemForm
        open={modal.open}
        mode={modal.mode}
        initial={modal.initial}
        stores={stores}
        facets={facets}
        onClose={closeModal}
        onSaved={handleSaved}
      />

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <span className={`stat${tone ? ` stat-${tone}` : ''}`}>
      <span className="stat-value">{value ?? '—'}</span>
      <span className="stat-label">{label}</span>
    </span>
  )
}
