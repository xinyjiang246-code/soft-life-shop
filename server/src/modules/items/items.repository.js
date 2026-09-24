/**
 * items 仓储层 —— 只跟数据库打交道，不含任何业务判断。
 *
 * 职责边界：接收「已经过校验的普通参数」，返回「普通 JS 对象」。
 * 不抛 HTTP 语义的错误（那是 service 的事），但会把 SQLite 的约束错误
 * 翻译成带语义的标记，好让 service 决定该报 409 还是别的。
 */
import { query, queryOne, execute } from '../../db/index.js'

/** SELECT 用的列清单 + 店铺联表（列表页要显示店名，不想让前端再发 N 个请求）。 */
const SELECT_CLAUSE = `
  SELECT
    i.id, i.sku, i.name, i.name_cn, i.price_cents, i.store_id, i.category,
    i.tags, i.description, i.in_stock, i.is_active, i.created_at, i.updated_at,
    s.name AS store_name, s.name_en AS store_name_en
  FROM items i
  JOIN stores s ON s.id = i.store_id
`

/** 排序列白名单 —— 绝不把用户输入直接拼进 ORDER BY。 */
const SORT_COLUMNS = {
  name: 'i.name',
  priceCents: 'i.price_cents',
  createdAt: 'i.created_at',
  updatedAt: 'i.updated_at',
  storeId: 'i.store_id',
}

const toBool = (v) => v === 1

/** tags 存的是 JSON 字符串，坏数据不该让整个列表接口崩掉。 */
function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatPrice(cents) {
  return `¥${(cents / 100).toFixed(2)}`
}

/** DB 行 → 对外领域对象（snake_case → camelCase 只在这一处发生）。 */
export function toItem(row) {
  if (!row) return null
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    nameCn: row.name_cn,
    priceCents: row.price_cents,
    priceLabel: formatPrice(row.price_cents),
    storeId: row.store_id,
    storeName: row.store_name,
    storeNameEn: row.store_name_en,
    category: row.category,
    tags: parseTags(row.tags),
    description: row.description,
    inStock: toBool(row.in_stock),
    isActive: toBool(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** LIKE 里的 % 和 _ 是通配符，用户搜「50%」时必须转义，否则会变成模糊匹配。 */
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** 由筛选条件生成 WHERE 片段与绑定参数。 */
function buildWhere(filters = {}) {
  const clauses = []
  const params = {}

  if (filters.storeId) {
    clauses.push('i.store_id = @storeId')
    params.storeId = filters.storeId
  }
  if (filters.category) {
    clauses.push('i.category = @category')
    params.category = filters.category
  }
  if (filters.tag) {
    // tags 是 JSON 数组，用 json_each 展开判断包含关系（比 LIKE '%"tag"%' 准确）
    clauses.push('EXISTS (SELECT 1 FROM json_each(i.tags) WHERE json_each.value = @tag)')
    params.tag = filters.tag
  }
  if (typeof filters.inStock === 'boolean') {
    clauses.push('i.in_stock = @inStock')
    params.inStock = filters.inStock ? 1 : 0
  }
  if (typeof filters.isActive === 'boolean') {
    clauses.push('i.is_active = @isActive')
    params.isActive = filters.isActive ? 1 : 0
  }
  if (filters.q) {
    clauses.push("(i.name LIKE @q ESCAPE '\\' OR i.name_cn LIKE @q ESCAPE '\\' OR i.sku LIKE @q ESCAPE '\\')")
    params.q = `%${escapeLike(filters.q)}%`
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  }
}

/** 分页列表 + 总数。 */
export function findAll({ filters, page, pageSize, sort, order }) {
  const { where, params } = buildWhere(filters)
  const column = SORT_COLUMNS[sort] ?? SORT_COLUMNS.createdAt
  const direction = order === 'asc' ? 'ASC' : 'DESC'

  const total = queryOne(`SELECT COUNT(*) AS n FROM items i ${where}`, params)?.n ?? 0

  const rows = query(
    `${SELECT_CLAUSE}
     ${where}
     ORDER BY ${column} ${direction}, i.id ${direction}
     LIMIT @limit OFFSET @offset`,
    { ...params, limit: pageSize, offset: (page - 1) * pageSize },
  )

  return { rows: rows.map(toItem), total }
}

export function findById(id) {
  return toItem(queryOne(`${SELECT_CLAUSE} WHERE i.id = @id`, { id }))
}

export function findBySku(sku) {
  return toItem(queryOne(`${SELECT_CLAUSE} WHERE i.sku = @sku`, { sku }))
}

export function findByStoreAndName(storeId, name) {
  return toItem(queryOne(`${SELECT_CLAUSE} WHERE i.store_id = @storeId AND i.name = @name`, { storeId, name }))
}

export function storeExists(storeId) {
  return Boolean(queryOne('SELECT 1 AS ok FROM stores WHERE id = @id', { id: storeId }))
}

export function listStores() {
  return query(
    'SELECT id, name, name_en AS nameEn, tagline, sort_order AS sortOrder FROM stores ORDER BY sort_order ASC, id ASC',
  ).map((r) => ({ ...r }))
}

/** 插入，返回新行 id。 */
export function insert(payload) {
  const result = execute(
    `INSERT INTO items (sku, name, name_cn, price_cents, store_id, category, tags, description, in_stock, is_active)
     VALUES (@sku, @name, @nameCn, @priceCents, @storeId, @category, @tags, @description, @inStock, @isActive)`,
    {
      sku: payload.sku,
      name: payload.name,
      nameCn: payload.nameCn,
      priceCents: payload.priceCents,
      storeId: payload.storeId,
      category: payload.category,
      tags: JSON.stringify(payload.tags ?? []),
      description: payload.description ?? '',
      inStock: payload.inStock === false ? 0 : 1,
      isActive: payload.isActive === false ? 0 : 1,
    },
  )
  return Number(result.lastInsertRowid)
}

/** 字段名 → 列名映射，只有出现在这里的键才允许被更新。 */
const UPDATABLE = {
  sku: 'sku',
  name: 'name',
  nameCn: 'name_cn',
  priceCents: 'price_cents',
  storeId: 'store_id',
  category: 'category',
  tags: 'tags',
  description: 'description',
  inStock: 'in_stock',
  isActive: 'is_active',
}

/** 部分更新，返回受影响行数。 */
export function update(id, patch) {
  const assignments = []
  const params = { id }

  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!(key in patch)) continue
    let value = patch[key]
    if (key === 'tags') value = JSON.stringify(value ?? [])
    else if (key === 'inStock' || key === 'isActive') value = value ? 1 : 0

    assignments.push(`${column} = @${key}`)
    params[key] = value
  }

  if (assignments.length === 0) return 0

  // 更新时间戳：让 updatedAt 真的反映最后一次修改
  assignments.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")

  const result = execute(`UPDATE items SET ${assignments.join(', ')} WHERE id = @id`, params)
  return Number(result.changes)
}

/** 硬删除，返回受影响行数。 */
export function remove(id) {
  return Number(execute('DELETE FROM items WHERE id = @id', { id }).changes)
}

/** 筛选项数据源：让前端不用猜有哪些店 / 品类 / 标签。 */
export function facets() {
  const categories = query('SELECT DISTINCT category FROM items ORDER BY category ASC').map((r) => r.category)

  const tagRows = query("SELECT DISTINCT json_each.value AS tag FROM items, json_each(items.tags) ORDER BY tag ASC")
  const tags = tagRows.map((r) => r.tag)

  const counts = queryOne(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN in_stock = 0 THEN 1 ELSE 0 END) AS outOfStock
    FROM items
  `)

  return {
    categories,
    tags,
    counts: {
      total: counts?.total ?? 0,
      active: counts?.active ?? 0,
      outOfStock: counts?.outOfStock ?? 0,
    },
  }
}

/**
 * 把 SQLite 的约束错误翻译成结构化信息。
 *
 * node:sqlite 只给 e.code = 'ERR_SQLITE_ERROR' 和一句 message，没有结构化错误码，
 * 所以只能匹配文本 —— 这也是集中在这一处解析的原因（将来 SQLite 改文案只需改这里）。
 */
export function interpretConstraintError(err) {
  const message = String(err?.message ?? '')

  if (message.includes('UNIQUE constraint failed')) {
    const columns = message.split('UNIQUE constraint failed:')[1]?.trim() ?? ''
    if (columns.includes('items.sku')) {
      return { kind: 'unique_sku', fields: ['sku'] }
    }
    if (columns.includes('store_id') && columns.includes('name')) {
      return { kind: 'unique_store_name', fields: ['storeId', 'name'] }
    }
    return { kind: 'unique_other', fields: [], raw: columns }
  }

  if (message.includes('FOREIGN KEY constraint failed')) {
    return { kind: 'foreign_key', fields: ['storeId'] }
  }

  if (message.includes('CHECK constraint failed')) {
    const constraint = message.split('CHECK constraint failed:')[1]?.trim() ?? ''
    return { kind: 'check', fields: [], raw: constraint }
  }

  return null
}
