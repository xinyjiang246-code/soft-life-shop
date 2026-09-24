/**
 * 筛选栏。所有控件都是受控的，状态由 App 持有 ——
 * 这样「清空筛选」只需要把状态重置回初始值，不用去操作 DOM。
 */
import { TAG_OPTIONS, tagLabel } from '../constants.js'

const SORT_OPTIONS = [
  { value: 'createdAt', label: '入库时间' },
  { value: 'updatedAt', label: '最近修改' },
  { value: 'name', label: '名称' },
  { value: 'priceCents', label: '价格' },
  { value: 'storeId', label: '店铺' },
]

export default function Filters({ query, onChange, stores, facets, onReset, busy }) {
  const set = (patch) => onChange({ ...query, ...patch, page: 1 })

  const tagOptions = facets?.tags?.length
    ? facets.tags.map((t) => ({ value: t, label: tagLabel(t) }))
    : TAG_OPTIONS

  return (
    <section className="filters" aria-label="筛选条件">
      <div className="field field-search">
        <label htmlFor="f-q">搜索</label>
        <input
          id="f-q"
          type="search"
          placeholder="商品名 / 中文名 / SKU"
          value={query.q}
          disabled={busy}
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="f-store">店铺</label>
        <select id="f-store" value={query.storeId} disabled={busy} onChange={(e) => set({ storeId: e.target.value })}>
          <option value="">全部</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-category">品类</label>
        <select id="f-category" value={query.category} disabled={busy} onChange={(e) => set({ category: e.target.value })}>
          <option value="">全部</option>
          {(facets?.categories ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-tag">标签</label>
        <select id="f-tag" value={query.tag} disabled={busy} onChange={(e) => set({ tag: e.target.value })}>
          <option value="">全部</option>
          {tagOptions.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-stock">库存</label>
        <select id="f-stock" value={query.inStock} disabled={busy} onChange={(e) => set({ inStock: e.target.value })}>
          <option value="">全部</option>
          <option value="false">仅缺货</option>
          <option value="true">仅有货</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-active">上架</label>
        <select id="f-active" value={query.isActive} disabled={busy} onChange={(e) => set({ isActive: e.target.value })}>
          <option value="">全部</option>
          <option value="true">已上架</option>
          <option value="false">已下架</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="f-sort">排序</label>
        <div className="sort-group">
          <select id="f-sort" value={query.sort} disabled={busy} onChange={(e) => set({ sort: e.target.value })}>
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-icon"
            disabled={busy}
            title={query.order === 'asc' ? '升序（点击改降序）' : '降序（点击改升序）'}
            onClick={() => set({ order: query.order === 'asc' ? 'desc' : 'asc' })}
          >
            {query.order === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <button type="button" className="btn btn-ghost btn-reset" disabled={busy} onClick={onReset}>
        清空
      </button>
    </section>
  )
}
