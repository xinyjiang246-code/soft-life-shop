/**
 * 商品表格。
 *
 * 删除做了行内二次确认（不用 window.confirm）：
 * 原生弹窗会阻塞渲染、样式也不受控，而且在「批量清理」这种场景下体验很差。
 */
import { useState } from 'react'

import { tagLabel, formatDateTime } from '../constants.js'
import { EmptyState, ErrorState, StatusPill, TableSkeleton } from './States.jsx'

export default function ItemTable({
  items,
  loading,
  error,
  filtered,
  busyId,
  onEdit,
  onDelete,
  onToggleStock,
  onToggleActive,
  onRetry,
  onReset,
  onCreate,
}) {
  const [confirmingId, setConfirmingId] = useState(null)

  if (loading) return <TableSkeleton rows={6} />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (items.length === 0) return <EmptyState filtered={filtered} onCreate={onCreate} onReset={onReset} />

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">商品</th>
            <th scope="col">店铺</th>
            <th scope="col">品类</th>
            <th scope="col">标签</th>
            <th scope="col" className="num">
              价格
            </th>
            <th scope="col">状态</th>
            <th scope="col">最近修改</th>
            <th scope="col" className="actions-col">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const busy = busyId === item.id
            const confirming = confirmingId === item.id

            return (
              <tr key={item.id} className={[!item.isActive && 'row-inactive', busy && 'row-busy'].filter(Boolean).join(' ')}>
                <td>
                  <div className="cell-title">
                    <span className="item-cn">{item.nameCn}</span>
                    <span className="item-id">#{item.id}</span>
                  </div>
                  <div className="cell-sub">
                    <span className="item-en">{item.name}</span>
                    <span className="item-sku">{item.sku}</span>
                  </div>
                </td>

                <td>{item.storeName}</td>

                <td>
                  <span className="category">{item.category}</span>
                </td>

                <td>
                  {item.tags.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className="tag-list">
                      {item.tags.map((t) => (
                        <span key={t} className={`tag tag-${t}`}>
                          {tagLabel(t)}
                        </span>
                      ))}
                    </span>
                  )}
                </td>

                <td className="num price">{item.priceLabel}</td>

                <td>
                  <div className="pill-row">
                    <button
                      type="button"
                      className="pill-toggle"
                      disabled={busy}
                      title={item.isActive ? '点击下架' : '点击上架'}
                      onClick={() => onToggleActive(item, !item.isActive)}
                    >
                      <StatusPill tone={item.isActive ? 'ok' : 'muted'}>{item.isActive ? '已上架' : '已下架'}</StatusPill>
                    </button>
                    <button
                      type="button"
                      className="pill-toggle"
                      disabled={busy}
                      title={item.inStock ? '点击标记为缺货' : '点击标记为有货'}
                      onClick={() => onToggleStock(item, !item.inStock)}
                    >
                      <StatusPill tone={item.inStock ? 'neutral' : 'warn'}>{item.inStock ? '有货' : '缺货'}</StatusPill>
                    </button>
                  </div>
                </td>

                <td className="muted nowrap">{formatDateTime(item.updatedAt)}</td>

                <td className="actions-col">
                  {confirming ? (
                    <span className="confirm-group">
                      <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => onDelete(item)}>
                        {busy ? '删除中…' : '确认删除'}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmingId(null)}>
                        取消
                      </button>
                    </span>
                  ) : (
                    <span className="confirm-group">
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onEdit(item)}>
                        编辑
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" disabled={busy} onClick={() => setConfirmingId(item.id)}>
                        删除
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
