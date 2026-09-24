/**
 * 通用状态组件：加载 / 出错 / 空结果 / 提示条 / 状态徽标。
 * 抽出来是为了让每个用到的地方都能把三态补齐 —— 「忘了写 error 分支」是最常见的前端事故。
 */

/** 表格加载骨架：行数和列宽都对齐真实表格，避免加载完页面跳一下 */
export function TableSkeleton({ rows = 6, columns = 6 }) {
  return (
    <div className="skeleton" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }).map((_, r) => (
        <div className="skeleton-row" key={r}>
          {Array.from({ length: columns }).map((__, c) => (
            <span key={c} className={`skeleton-cell col-${c}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state-block state-error" role="alert">
      <p className="state-title">没能取到数据</p>
      <p className="state-desc">{error?.displayMessage ?? error?.message ?? '未知错误'}</p>
      {error?.isNetworkError && (
        <p className="state-hint">
          后端还没起来？在 <code>server/</code> 下执行 <code>npm run dev</code>，然后重试。
        </p>
      )}
      {onRetry && (
        <button type="button" className="btn btn-ghost" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  )
}

export function EmptyState({ filtered, onCreate, onReset }) {
  return (
    <div className="state-block state-empty">
      <p className="state-title">{filtered ? '没有符合条件的商品' : '这里还没有商品'}</p>
      <p className="state-desc">
        {filtered ? '换个关键字，或者把筛选条件放宽一点。' : '先建一件试试 —— 它会立刻出现在列表里。'}
      </p>
      {filtered ? (
        <button type="button" className="btn btn-ghost" onClick={onReset}>
          清空筛选
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          新建商品
        </button>
      )}
    </div>
  )
}

/** 上下架 / 库存 的状态徽标 */
export function StatusPill({ tone = 'neutral', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

export function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-msg">{t.message}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(t.id)} aria-label="关闭">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
