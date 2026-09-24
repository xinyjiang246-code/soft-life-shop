/**
 * items 服务层 —— 业务规则都在这里。
 *
 * 规矩：这一层不 import express / 不碰 req / res。
 * 它只接收普通对象、返回普通对象，失败时抛 AppError 子类。
 * 这样单测可以直接调 service，不需要起 HTTP 服务。
 */
import { BadRequestError, ConflictError, NotFoundError } from '../../errors/index.js'
import logger from '../../lib/logger.js'
import * as repo from './items.repository.js'

/** 把仓储层的「约束冲突标记」翻译成面向用户的 409 文案。 */
function throwConstraintConflict(interpreted, payload) {
  if (!interpreted) return

  if (interpreted.kind === 'unique_sku') {
    throw new ConflictError(`SKU「${payload?.sku ?? ''}」已被占用，请换一个`, {
      field: 'sku',
      value: payload?.sku,
    })
  }

  if (interpreted.kind === 'unique_store_name') {
    throw new ConflictError('这家店里已经有同名商品了', {
      field: 'name',
      value: payload?.name,
      hint: '同一家店内商品名不能重复；不同店可以重名',
    })
  }

  if (interpreted.kind === 'foreign_key') {
    throw new BadRequestError(`店铺「${payload?.storeId ?? ''}」不存在`, { field: 'storeId' })
  }

  if (interpreted.kind === 'check') {
    throw new BadRequestError('数据不符合字段约束', { constraint: interpreted.raw })
  }

  throw new ConflictError('与现有数据冲突', { raw: interpreted.raw })
}

/** 捕获写库时的约束错误，统一转化。 */
function writeWithConstraintGuard(fn, payload) {
  try {
    return fn()
  } catch (err) {
    const interpreted = repo.interpretConstraintError(err)
    if (interpreted) {
      logger.warn('items.constraint_violation', {
        kind: interpreted.kind,
        fields: interpreted.fields,
        payload: { sku: payload?.sku, name: payload?.name, storeId: payload?.storeId },
      })
      throwConstraintConflict(interpreted, payload)
    }
    throw err // 不是约束问题 → 交给全局错误处理，按 500 报
  }
}

export function listItems(query) {
  const { rows, total } = repo.findAll({
    filters: {
      storeId: query.storeId,
      category: query.category,
      tag: query.tag,
      q: query.q,
      inStock: query.inStock,
      isActive: query.isActive,
    },
    page: query.page,
    pageSize: query.pageSize,
    sort: query.sort,
    order: query.order,
  })

  const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize)

  return {
    items: rows,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrev: query.page > 1,
    },
  }
}

export function getItem(id) {
  const item = repo.findById(id)
  if (!item) throw new NotFoundError(`商品 #${id} 不存在`, { id })
  return item
}

export function createItem(payload) {
  // 先做一次友好检查（好文案），真正的唯一性仍由数据库索引兜底（防并发）
  if (!repo.storeExists(payload.storeId)) {
    throw new BadRequestError(`店铺「${payload.storeId}」不存在`, {
      field: 'storeId',
      hint: '可以先调 GET /api/v1/stores 看看有哪些店',
    })
  }

  const sameSku = repo.findBySku(payload.sku)
  if (sameSku) {
    throw new ConflictError(`SKU「${payload.sku}」已被占用，请换一个`, { field: 'sku', value: payload.sku })
  }

  const sameName = repo.findByStoreAndName(payload.storeId, payload.name)
  if (sameName) {
    throw new ConflictError('这家店里已经有同名商品了', {
      field: 'name',
      value: payload.name,
      existingId: sameName.id,
    })
  }

  const id = writeWithConstraintGuard(() => repo.insert(payload), payload)
  logger.info('items.created', { id, sku: payload.sku, storeId: payload.storeId })

  return getItem(id)
}

export function updateItem(id, patch) {
  const existing = getItem(id) // 不存在直接 404

  if (patch.storeId !== undefined && patch.storeId !== existing.storeId && !repo.storeExists(patch.storeId)) {
    throw new BadRequestError(`店铺「${patch.storeId}」不存在`, { field: 'storeId' })
  }

  // 唯一性检查要排除自己，否则「只改价格」也会因为撞上自己的名字而报 409
  if (patch.sku !== undefined && patch.sku !== existing.sku) {
    const sameSku = repo.findBySku(patch.sku)
    if (sameSku && sameSku.id !== id) {
      throw new ConflictError(`SKU「${patch.sku}」已被占用，请换一个`, { field: 'sku', value: patch.sku })
    }
  }

  const nextStoreId = patch.storeId ?? existing.storeId
  const nextName = patch.name ?? existing.name
  if (nextName !== existing.name || nextStoreId !== existing.storeId) {
    const clash = repo.findByStoreAndName(nextStoreId, nextName)
    if (clash && clash.id !== id) {
      throw new ConflictError('这家店里已经有同名商品了', {
        field: 'name',
        value: nextName,
        existingId: clash.id,
      })
    }
  }

  const changed = writeWithConstraintGuard(() => repo.update(id, patch), patch)
  if (changed === 0) {
    // patch 里全是 undefined 的情况已被 zod 挡掉；能走到这基本都是并发删除
    throw new NotFoundError(`商品 #${id} 不存在`, { id })
  }

  logger.info('items.updated', { id, fields: Object.keys(patch) })
  return getItem(id)
}

export function deleteItem(id) {
  const existing = getItem(id) // 不存在报 404，而不是「删除成功但什么都没删」
  const changed = repo.remove(id)
  if (changed === 0) throw new NotFoundError(`商品 #${id} 不存在`, { id })

  logger.info('items.deleted', { id, sku: existing.sku })
  return existing
}

export function getFacets() {
  return repo.facets()
}

/** 店铺是只读字典：给 items 的筛选器与新建表单提供选项。 */
export function listStores() {
  return repo.listStores()
}
