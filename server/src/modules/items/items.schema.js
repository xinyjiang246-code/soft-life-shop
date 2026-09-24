/**
 * items 模块的输入契约（zod）。
 *
 * 三处都校验：这里是第一道（HTTP 边界），数据库的 CHECK 约束是最后一道。
 * 中间层（service）只处理业务规则，不再重复做格式校验。
 *
 * ⚠️ 文案约定：报错里**不要**再写一遍字段名。
 * 中间件会统一渲染成「请求体「name」必填」，消息里再写 name 就重复了：
 * 反例 → 请求体「name」name 必填   正例 → 请求体「name」必填
 */
import { z } from 'zod'

import config from '../../config/index.js'

const sku = z
  .string({ required_error: '必填' })
  .trim()
  .min(1, '不能为空')
  .max(40, '不能超过 40 个字符')
  .regex(/^[A-Za-z0-9._-]+$/, '只能包含字母、数字、点、下划线、连字符')

const name = z.string({ required_error: '必填' }).trim().min(1, '不能为空').max(80, '不能超过 80 个字符')
const nameCn = z.string({ required_error: '必填' }).trim().min(1, '不能为空').max(80, '不能超过 80 个字符')

// 金额用「分」传输，整数 —— 浮点在钱上会累积误差
const priceCents = z
  .number({ required_error: '必填', invalid_type_error: '必须是数字（单位：分）' })
  .int('必须是整数（单位：分）')
  .min(0, '不能为负数')
  .max(10_000_000, '不能超过 100000.00 元')

const storeId = z.string({ required_error: '必填' }).trim().min(1, '不能为空').max(32)
const category = z.string({ required_error: '必填' }).trim().min(1, '不能为空').max(40)
const tags = z.array(z.string().trim().min(1, '标签不能为空').max(24, '单个标签不超过 24 字符')).max(10, '最多 10 个标签')
const description = z.string().trim().max(500, '不超过 500 字')
const booleanish = z.boolean({ invalid_type_error: '必须是 true 或 false' })

/** 创建：所有必填项都必填，且拒绝未知字段（防止客户端悄悄塞 id / created_at）。 */
export const createItemSchema = z
  .object({
    sku,
    name,
    nameCn,
    priceCents,
    storeId,
    category,
    tags: tags.optional().default([]),
    description: description.optional().default(''),
    inStock: booleanish.optional().default(true),
    isActive: booleanish.optional().default(true),
  })
  .strict()

/** 更新：全字段可选，但至少要给一个 —— 空 PATCH 是无意义的。 */
export const updateItemSchema = z
  .object({
    sku: sku.optional(),
    name: name.optional(),
    nameCn: nameCn.optional(),
    priceCents: priceCents.optional(),
    storeId: storeId.optional(),
    category: category.optional(),
    tags: tags.optional(),
    description: description.optional(),
    inStock: booleanish.optional(),
    isActive: booleanish.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: '至少需要提供一个要修改的字段' })

const boolQuery = (label) =>
  z
    .enum(['true', 'false', '1', '0'], { errorMap: () => ({ message: `${label}只接受 true / false` }) })
    .transform((v) => v === 'true' || v === '1')

/**
 * 列表查询。
 * ⚠️ 这里用默认的 strip 模式（不是 strict）：URL 上多带个 _t 之类的缓存参数不该 422。
 */
export const listItemsQuerySchema = z.object({
  storeId: z.string().trim().max(32).optional(),
  category: z.string().trim().max(40).optional(),
  tag: z.string().trim().max(24).optional(),
  q: z.string().trim().max(80).optional(),
  inStock: boolQuery('').optional(),
  isActive: boolQuery('').optional(),
  page: z.coerce.number().int('必须是整数').min(1, '从 1 开始').default(1),
  pageSize: z.coerce
    .number()
    .int('必须是整数')
    .min(1, '至少为 1')
    .max(config.api.maxPageSize, `最大 ${config.api.maxPageSize}`)
    .default(config.api.defaultPageSize),
  sort: z
    .enum(['name', 'priceCents', 'createdAt', 'updatedAt', 'storeId'], {
      errorMap: () => ({ message: '只接受 name / priceCents / createdAt / updatedAt / storeId' }),
    })
    .default('createdAt'),
  order: z
    .enum(['asc', 'desc'], { errorMap: () => ({ message: '只接受 asc / desc' }) })
    .default('desc'),
})

/** 路径参数 :id —— 必须是正整数，`/items/abc` 应该在进 service 之前就被拦掉。 */
export const itemIdParamSchema = z.object({
  id: z.coerce.number({ invalid_type_error: '必须是数字' }).int('必须是整数').positive('必须是正整数'),
})

export const storeIdParamSchema = z.object({
  id: z.string().trim().min(1).max(32),
})
