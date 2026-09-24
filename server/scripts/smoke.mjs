/**
 * 集成冒烟测试：打真实的 HTTP 接口，覆盖正常路径 + 各种错误分支。
 *
 * 需要服务已经在跑（npm run dev 或 npm start）。
 * 用法：npm run smoke            # 用默认 http://127.0.0.1:8787
 *      npm run smoke -- http://other:port
 *
 * 设计原则：**不 mock**。这里就是要验证 zod 校验、service 规则、SQLite 约束、
 * 错误中间件这几层真的串起来了 —— mock 掉任何一层都会让这个脚本失去意义。
 */
const BASE = (process.argv[2] ?? process.env.SMOKE_BASE ?? 'http://127.0.0.1:8787').replace(/\/$/, '')
const API = `${BASE}/api/v1`

let passed = 0
let failed = 0
const failures = []

function check(label, condition, detail) {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${label}`)
  } else {
    failed += 1
    failures.push(label)
    console.log(`  ✗ ${label}${detail !== undefined ? ` — ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n【${title}】`)
}

async function call(method, path, { body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, init)
  const text = await res.text()

  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* 非 JSON 响应（204 等）保持 null */
  }

  return { status: res.status, json, text, headers: res.headers }
}

// 每次跑用一个唯一的 sku，避免和上一次的残留打架
const STAMP = Date.now().toString(36).toUpperCase()
const SKU = `SMOKE-${STAMP}`
const SKU2 = `SMOKE-${STAMP}-B`

async function main() {
  console.log(`\n冒烟测试目标：${BASE}\n${'─'.repeat(50)}`)

  // ——— 1. 探针 ———
  section('1. 健康检查')
  {
    const health = await call('GET', `${BASE}/health`)
    check('/health 返回 200', health.status === 200, `实际 ${health.status}`)
    check('/health 带 status=ok', health.json?.status === 'ok')

    const ready = await call('GET', `${BASE}/ready`)
    check('/ready 返回 200', ready.status === 200, `实际 ${ready.status}`)
    check('/ready 数据库检查 ok', ready.json?.checks?.database === 'ok')
    check('/ready 迁移已全部应用', ready.json?.checks?.migrations === 'ok', JSON.stringify(ready.json?.pendingMigrations))
  }

  // ——— 2. 响应头契约 ———
  section('2. 响应头')
  {
    const res = await call('GET', '/items?pageSize=1')
    check('返回 x-request-id', Boolean(res.headers.get('x-request-id')))
    check('回显 CORS 头（同源/无 Origin）', res.status === 200)
    check('不暴露 x-powered-by', !res.headers.get('x-powered-by'), res.headers.get('x-powered-by'))
  }

  // ——— 3. 字典与种子数据 ———
  section('3. 店铺字典与种子数据')
  let total = 0
  {
    const stores = await call('GET', '/stores')
    check('/stores 返回 200', stores.status === 200)
    check('店铺数量为 6', stores.json?.data?.length === 6, `实际 ${stores.json?.data?.length}`)
    check('店铺含 tea', stores.json?.data?.some((s) => s.id === 'tea'))

    const list = await call('GET', '/items?pageSize=100')
    total = list.json?.pagination?.total ?? 0
    check('商品总数 21（种子基线）', total === 21, `实际 ${total}`)
    check('分页字段完整', ['page', 'pageSize', 'total', 'totalPages', 'hasNext', 'hasPrev'].every((k) => k in (list.json?.pagination ?? {})))
    check('商品已带上店名（联表生效）', Boolean(list.json?.data?.[0]?.storeName))
    check('价格以分为单位返回整数', Number.isInteger(list.json?.data?.[0]?.priceCents))
    check('同时给出 priceLabel', typeof list.json?.data?.[0]?.priceLabel === 'string')
    check('tags 已解析成数组', Array.isArray(list.json?.data?.[0]?.tags))
  }

  // ——— 4. 筛选 / 搜索 / 排序 ———
  section('4. 筛选 · 搜索 · 排序')
  {
    const byStore = await call('GET', '/items?storeId=noodle&pageSize=100')
    check('按店铺筛选生效', byStore.json?.data?.length === 4, `实际 ${byStore.json?.data?.length}`)
    check('筛选结果全部属于该店', byStore.json?.data?.every((i) => i.storeId === 'noodle'))

    const byTag = await call('GET', '/items?tag=signature&pageSize=100')
    check('按标签筛选生效（json_each）', (byTag.json?.data?.length ?? 0) > 0, `实际 ${byTag.json?.data?.length}`)
    check('标签筛选结果都含该标签', byTag.json?.data?.every((i) => i.tags.includes('signature')))

    const search = await call('GET', '/items?q=抹茶&pageSize=100')
    check('中文搜索可命中', (search.json?.data?.length ?? 0) > 0, `实际 ${search.json?.data?.length}`)
    check('搜索结果名含关键字', search.json?.data?.every((i) => `${i.name}${i.nameCn}${i.sku}`.includes('抹茶')))

    // LIKE 通配符必须被转义：搜 % 不该把全表捞出来
    const wildcard = await call('GET', '/items?q=%25&pageSize=100')
    check('LIKE 通配符已转义（搜 % 不返回全表）', (wildcard.json?.data?.length ?? 0) === 0, `实际 ${wildcard.json?.data?.length}`)

    const sorted = await call('GET', '/items?sort=priceCents&order=asc&pageSize=100')
    const prices = sorted.json?.data?.map((i) => i.priceCents) ?? []
    check('按价格升序排序生效', prices.every((p, i) => i === 0 || prices[i - 1] <= p), JSON.stringify(prices.slice(0, 5)))

    const desc = await call('GET', '/items?sort=priceCents&order=desc&pageSize=100')
    const dp = desc.json?.data?.map((i) => i.priceCents) ?? []
    check('按价格降序排序生效', dp.every((p, i) => i === 0 || dp[i - 1] >= p))

    const paged = await call('GET', '/items?page=1&pageSize=5')
    check('分页 pageSize 生效', paged.json?.data?.length === 5, `实际 ${paged.json?.data?.length}`)
    check('totalPages 计算正确', paged.json?.pagination?.totalPages === Math.ceil(total / 5))

    const never = await call('GET', '/items?category=不存在的品类&pageSize=100')
    check('无结果时返回空数组而非报错', never.status === 200 && never.json?.data?.length === 0)

    const facets = await call('GET', '/items/facets')
    check('/items/facets 返回 200', facets.status === 200)
    check('facets 含品类列表', (facets.json?.data?.categories?.length ?? 0) > 0)
    check('facets 含标签列表', (facets.json?.data?.tags?.length ?? 0) > 0)
    check('facets 统计总数与列表一致', facets.json?.data?.counts?.total === total)
  }

  // ——— 5. 创建 ———
  section('5. 创建')
  let createdId = null
  {
    const body = {
      sku: SKU,
      name: `SMOKE BOWL ${STAMP}`,
      nameCn: '冒烟测试碗',
      priceCents: 3250,
      storeId: 'bento',
      category: '便当',
      tags: ['new'],
      description: '自动化测试写入，跑完会删掉。',
    }

    const res = await call('POST', '/items', { body })
    check('创建返回 201', res.status === 201, `实际 ${res.status}`)
    check('响应带 Location 头', Boolean(res.headers.get('location')), res.headers.get('location'))
    check('返回完整对象', res.json?.data?.sku === SKU)
    check('默认 inStock=true', res.json?.data?.inStock === true)
    check('默认 isActive=true', res.json?.data?.isActive === true)
    check('tags 原样返回', JSON.stringify(res.json?.data?.tags) === '["new"]')
    check('priceLabel 已格式化', res.json?.data?.priceLabel === '¥32.50', res.json?.data?.priceLabel)
    createdId = res.json?.data?.id

    const after = await call('GET', '/items?pageSize=100')
    check('总数 +1', after.json?.pagination?.total === total + 1)
  }

  // ——— 6. 冲突与校验（错误分支）———
  section('6. 冲突与校验')
  {
    const dupSku = await call('POST', '/items', {
      body: { sku: SKU, name: 'ANOTHER NAME', nameCn: '另一个', priceCents: 100, storeId: 'bento', category: '便当' },
    })
    check('重复 sku 返回 409', dupSku.status === 409, `实际 ${dupSku.status}`)
    check('冲突错误码为 CONFLICT', dupSku.json?.error?.code === 'CONFLICT')

    const dupName = await call('POST', '/items', {
      body: { sku: SKU2, name: `SMOKE BOWL ${STAMP}`, nameCn: '换名', priceCents: 100, storeId: 'bento', category: '便当' },
    })
    check('同店重名返回 409', dupName.status === 409, `实际 ${dupName.status}`)

    // 同一名字换一家店应该允许
    const otherStore = await call('POST', '/items', {
      body: { sku: SKU2, name: `SMOKE BOWL ${STAMP}`, nameCn: '换店', priceCents: 100, storeId: 'tea', category: '奶茶' },
    })
    check('同名商品可存在于不同店（201）', otherStore.status === 201, `实际 ${otherStore.status}`)
    const secondId = otherStore.json?.data?.id
    if (secondId) await call('DELETE', `/items/${secondId}`)

    const badStore = await call('POST', '/items', {
      body: { sku: `SMOKE-${STAMP}-X`, name: 'X', nameCn: 'X', priceCents: 100, storeId: 'no-such-store', category: 'X' },
    })
    check('不存在的店铺返回 400', badStore.status === 400, `实际 ${badStore.status}`)

    const missing = await call('POST', '/items', { body: { sku: `SMOKE-${STAMP}-Y` } })
    check('缺必填字段返回 422', missing.status === 422, `实际 ${missing.status}`)
    check('返回逐字段错误明细', (missing.json?.error?.details?.length ?? 0) >= 4)
    check('错误信息不重复字段名', !/「name」name/.test(missing.json?.error?.message ?? ''), missing.json?.error?.message)

    const unknown = await call('POST', '/items', {
      body: { sku: `SMOKE-${STAMP}-Z`, name: 'Z', nameCn: 'Z', priceCents: 100, storeId: 'tea', category: 'Z', evil: 1 },
    })
    check('未知字段被拒（strict）', unknown.status === 422, `实际 ${unknown.status}`)
    check('未知字段被点名', JSON.stringify(unknown.json?.error?.details).includes('evil'))

    const negPrice = await call('POST', '/items', {
      body: { sku: `SMOKE-${STAMP}-N`, name: 'N', nameCn: 'N', priceCents: -1, storeId: 'tea', category: 'N' },
    })
    check('负价格被拒', negPrice.status === 422, `实际 ${negPrice.status}`)

    const floatPrice = await call('POST', '/items', {
      body: { sku: `SMOKE-${STAMP}-F`, name: 'F', nameCn: 'F', priceCents: 12.5, storeId: 'tea', category: 'F' },
    })
    check('非整数价格被拒', floatPrice.status === 422, `实际 ${floatPrice.status}`)

    const badType = await call('POST', '/items', { body: 'not json at all' })
    check('非法 JSON 返回 400', badType.status === 400, `实际 ${badType.status}`)
    check('非法 JSON 错误码正确', badType.json?.error?.code === 'INVALID_JSON')

    const badId = await call('GET', '/items/abc')
    check('非数字 id 返回 400', badId.status === 400, `实际 ${badId.status}`)

    const overPage = await call('GET', '/items?pageSize=999')
    check('pageSize 超上限被拒', overPage.status === 400, `实际 ${overPage.status}`)

    const badSort = await call('GET', '/items?sort=price_cents;DROP TABLE items')
    check('非法排序字段被拒（白名单）', badSort.status === 400, `实际 ${badSort.status}`)

    const notFound = await call('GET', '/items/99999999')
    check('不存在的 id 返回 404', notFound.status === 404, `实际 ${notFound.status}`)

    const noRoute = await call('GET', '/no-such-endpoint')
    check('未知路由返回 404', noRoute.status === 404, `实际 ${noRoute.status}`)
    check('404 也带 requestId', Boolean(noRoute.json?.error?.requestId))
  }

  // ——— 7. 更新 ———
  section('7. 部分更新')
  {
    const res = await call('PATCH', `/items/${createdId}`, { body: { priceCents: 4000, inStock: false } })
    check('PATCH 返回 200', res.status === 200, `实际 ${res.status}`)
    check('价格已更新', res.json?.data?.priceCents === 4000)
    check('下架已生效', res.json?.data?.inStock === false)
    check('未提交的字段保持原值', res.json?.data?.nameCn === '冒烟测试碗', res.json?.data?.nameCn)
    check('tags 未被清空', JSON.stringify(res.json?.data?.tags) === '["new"]')
    check('updatedAt 已刷新', res.json?.data?.updatedAt > res.json?.data?.createdAt)

    const empty = await call('PATCH', `/items/${createdId}`, { body: {} })
    check('空 PATCH 被拒（422）', empty.status === 422, `实际 ${empty.status}`)

    const conflict = await call('PATCH', `/items/${createdId}`, { body: { sku: 'M1' } })
    check('改成已占用的 sku 返回 409', conflict.status === 409, `实际 ${conflict.status}`)

    // 只改价格时不该撞上「自己的名字」
    const selfName = await call('PATCH', `/items/${createdId}`, { body: { nameCn: '冒烟测试碗v2' } })
    check('改自己的字段不误报冲突', selfName.status === 200, `实际 ${selfName.status}`)

    const missing = await call('PATCH', '/items/99999999', { body: { priceCents: 1 } })
    check('更新不存在的 id 返回 404', missing.status === 404, `实际 ${missing.status}`)
  }

  // ——— 8. 上架下架筛选 ———
  section('8. 上架状态筛选')
  {
    const out = await call('GET', '/items?inStock=false&pageSize=100')
    check('可筛出缺货商品', out.json?.data?.some((i) => i.id === createdId))

    await call('PATCH', `/items/${createdId}`, { body: { inStock: true } })
    const back = await call('GET', '/items?inStock=false&pageSize=100')
    check('恢复库存后不再出现在缺货列表', !back.json?.data?.some((i) => i.id === createdId))

    const inactive = await call('GET', '/items?isActive=false&pageSize=100')
    check('可按下架状态筛选', inactive.status === 200)
  }

  // ——— 9. 删除 ———
  section('9. 删除')
  {
    const before = await call('GET', '/items?pageSize=100')
    const res = await call('DELETE', `/items/${createdId}`)
    check('删除返回 204', res.status === 204, `实际 ${res.status}`)
    check('204 无响应体', res.text === '', JSON.stringify(res.text))

    const gone = await call('GET', `/items/${createdId}`)
    check('删除后查不到（404）', gone.status === 404, `实际 ${gone.status}`)

    const again = await call('DELETE', `/items/${createdId}`)
    check('重复删除返回 404', again.status === 404, `实际 ${again.status}`)

    const after = await call('GET', '/items?pageSize=100')
    check('总数回到原值', after.json?.pagination?.total === before.json?.pagination?.total - 1)
    check('总数等于种子基线', after.json?.pagination?.total === total, `实际 ${after.json?.pagination?.total}`)
  }

  // ——— 10. 种子数据完整性 ———
  section('10. 种子数据未被破坏')
  {
    const list = await call('GET', '/items?pageSize=100')
    const byStore = {}
    for (const item of list.json?.data ?? []) byStore[item.storeId] = (byStore[item.storeId] ?? 0) + 1

    check('tea 4 件', byStore.tea === 4, `实际 ${byStore.tea}`)
    check('bento 3 件', byStore.bento === 3, `实际 ${byStore.bento}`)
    check('dessert 3 件', byStore.dessert === 3, `实际 ${byStore.dessert}`)
    check('life 3 件', byStore.life === 3, `实际 ${byStore.life}`)
    check('noodle 4 件', byStore.noodle === 4, `实际 ${byStore.noodle}`)
    check('dimsum 4 件', byStore.dimsum === 4, `实际 ${byStore.dimsum}`)
    check('金额全部为正整数分', list.json?.data?.every((i) => Number.isInteger(i.priceCents) && i.priceCents > 0))
  }

  // ——— 汇总 ———
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`  通过 ${passed}　失败 ${failed}`)
  if (failed > 0) {
    console.log('\n  失败项：')
    for (const f of failures) console.log(`    · ${f}`)
  }
  console.log('')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(`\n冒烟测试无法完成：${err.message}`)
  console.error('服务起来了吗？先跑 npm run dev\n')
  process.exit(1)
})
