/**
 * items 子路由。
 *
 * ⚠️ 路由顺序有讲究：/facets 必须写在 /:id 之前。
 * 否则 Express 会先匹配到 /:id，把字符串 "facets" 当成 id 去校验 → 报 400。
 */
import { Router } from 'express'

import validate from '../../middleware/validate.js'
import asyncHandler from '../../lib/asyncHandler.js'
import * as controller from './items.controller.js'
import { createItemSchema, itemIdParamSchema, listItemsQuerySchema, updateItemSchema } from './items.schema.js'

const router = Router()

router.get(
  '/facets',
  asyncHandler(controller.facets),
)

router.get(
  '/',
  validate({ query: listItemsQuerySchema }),
  asyncHandler(controller.list),
)

router.post(
  '/',
  validate({ body: createItemSchema }),
  asyncHandler(controller.create),
)

router.get(
  '/:id',
  validate({ params: itemIdParamSchema }),
  asyncHandler(controller.detail),
)

router.patch(
  '/:id',
  validate({ params: itemIdParamSchema, body: updateItemSchema }),
  asyncHandler(controller.update),
)

router.delete(
  '/:id',
  validate({ params: itemIdParamSchema }),
  asyncHandler(controller.remove),
)

export default router
