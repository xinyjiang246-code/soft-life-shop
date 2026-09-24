/**
 * items 控制器 —— 只做三件事：取已校验的输入 → 调 service → 格式化响应。
 * 任何 if / 计算 / 判断业务规则都不该出现在这里。
 */
import * as service from './items.service.js'

export function list(req, res) {
  const result = service.listItems(req.valid.query)
  res.json({ data: result.items, pagination: result.pagination })
}

export function detail(req, res) {
  const { id } = req.valid.params
  res.json({ data: service.getItem(id) })
}

export function create(req, res) {
  const item = service.createItem(req.valid.body)
  // 201 + Location：符合 REST 惯例，前端也能直接拿来跳转
  res.status(201).location(`/api/v1/items/${item.id}`).json({ data: item })
}

export function update(req, res) {
  const { id } = req.valid.params
  res.json({ data: service.updateItem(id, req.valid.body) })
}

export function remove(req, res) {
  const { id } = req.valid.params
  service.deleteItem(id)
  res.status(204).end()
}

export function facets(_req, res) {
  res.json({ data: service.getFacets() })
}

export function stores(_req, res) {
  res.json({ data: service.listStores() })
}
