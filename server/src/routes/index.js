/**
 * API 路由装配。/api/v1 下的所有东西都挂在这里。
 */
import { Router } from 'express'

import config from '../config/index.js'
import asyncHandler from '../lib/asyncHandler.js'
import itemsRouter from '../modules/items/items.routes.js'
import * as itemsController from '../modules/items/items.controller.js'

const router = Router()

// 店铺是只读字典（商品必须有归属店），由 items 模块统一提供，不单独开模块
router.get('/stores', asyncHandler(itemsController.stores))

router.use('/items', itemsRouter)

// 给前端一个「这个 API 长什么样」的入口
router.get('/', (_req, res) => {
  res.json({
    data: {
      name: '慢活小铺 · 商品服务',
      version: 'v1',
      endpoints: [
        { method: 'GET', path: `${config.api.prefix}/stores`, desc: '店铺字典' },
        { method: 'GET', path: `${config.api.prefix}/items`, desc: '商品列表（分页/筛选/搜索/排序）' },
        { method: 'GET', path: `${config.api.prefix}/items/facets`, desc: '筛选项与统计' },
        { method: 'GET', path: `${config.api.prefix}/items/:id`, desc: '商品详情' },
        { method: 'POST', path: `${config.api.prefix}/items`, desc: '新建商品' },
        { method: 'PATCH', path: `${config.api.prefix}/items/:id`, desc: '部分更新商品' },
        { method: 'DELETE', path: `${config.api.prefix}/items/:id`, desc: '删除商品' },
      ],
    },
  })
})

export default router
