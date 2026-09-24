/**
 * 把 seeds/*.json 灌进数据库。幂等：重复跑结果一致。
 *
 * 用 SQLite 的 upsert（ON CONFLICT ... DO UPDATE）：
 *   · 首次跑 → 全部插入
 *   · 再跑    → 按 sku 覆盖已有行的字段（前端改了价格，跑一次就同步过来）
 *
 * 用法：
 *   npm run seed             按 sku 覆盖式同步（不动库里多出来的数据）
 *   npm run seed -- --prune  额外删掉「种子里已经没有」的商品（严格对齐源）
 *   npm run seed -- --dry    只报告会改什么，不写库
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import logger from '../src/lib/logger.js'
import { closeDb, getDb, openDb, query, transaction } from '../src/db/index.js'
import { runMigrations } from '../src/db/migrate.js'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SEEDS_DIR = path.join(SERVER_ROOT, 'seeds')

const args = process.argv.slice(2)
const shouldPrune = args.includes('--prune')
const dryRun = args.includes('--dry')

function readSeed(name) {
  const file = path.join(SEEDS_DIR, `${name}.json`)
  if (!fs.existsSync(file)) {
    throw new Error(`缺少种子文件 ${file}，请先跑 npm run extract-seed`)
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(parsed.data)) throw new Error(`${file} 里没有 data 数组`)
  return parsed.data
}

const UPSERT_STORE = `
  INSERT INTO stores (id, name, name_en, tagline, sort_order)
  VALUES (@id, @name, @nameEn, @tagline, @sortOrder)
  ON CONFLICT(id) DO UPDATE SET
    name       = excluded.name,
    name_en    = excluded.name_en,
    tagline    = excluded.tagline,
    sort_order = excluded.sort_order,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`

const UPSERT_ITEM = `
  INSERT INTO items (sku, name, name_cn, price_cents, store_id, category, tags, description, in_stock, is_active)
  VALUES (@sku, @name, @nameCn, @priceCents, @storeId, @category, @tags, @description, @inStock, @isActive)
  ON CONFLICT(sku) DO UPDATE SET
    name        = excluded.name,
    name_cn     = excluded.name_cn,
    price_cents = excluded.price_cents,
    store_id    = excluded.store_id,
    category    = excluded.category,
    tags        = excluded.tags,
    description = excluded.description,
    in_stock    = excluded.in_stock,
    is_active   = excluded.is_active,
    updated_at  = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
`

/** 种子里没有的 sku 一律删掉；用 json_each 把数组当临时表查，避免手工拼占位符。 */
const PRUNE_ITEMS = "DELETE FROM items WHERE sku NOT IN (SELECT value FROM json_each(?))"

function main() {
  openDb()
  runMigrations()

  const stores = readSeed('stores')
  const items = readSeed('items')

  // 先记下库内已有 sku，才能区分「新增」与「更新」—— 事后算不出来
  const existingSkus = new Set(query('SELECT sku FROM items').map((r) => r.sku))
  const itemsBefore = existingSkus.size

  const skipped = []
  let pruned = 0

  if (!dryRun) {
    transaction(() => {
      const db = getDb()
      const upsertStore = db.prepare(UPSERT_STORE)
      const upsertItem = db.prepare(UPSERT_ITEM)
      const pruneItems = db.prepare(PRUNE_ITEMS)

      for (const store of stores) upsertStore.run(store)

      for (const item of items) {
        try {
          upsertItem.run({
            ...item,
            tags: JSON.stringify(item.tags ?? []),
            inStock: item.inStock === false ? 0 : 1,
            isActive: item.isActive === false ? 0 : 1,
          })
        } catch (err) {
          // 单个商品撞上「同店重名」这类约束时不该让整批回滚 —— 记下来继续
          skipped.push({ sku: item.sku, reason: err.message })
        }
      }

      if (shouldPrune) {
        pruned = Number(pruneItems.run(items.map((i) => i.sku)).changes)
      }
    })
  }

  const itemsAfter = dryRun ? itemsBefore : query('SELECT COUNT(*) AS n FROM items')[0].n
  const seedSkus = new Set(items.map((i) => i.sku))
  const updated = items.filter((i) => existingSkus.has(i.sku)).length - skipped.length
  const inserted = items.filter((i) => !existingSkus.has(i.sku)).length

  console.log('')
  console.log(`  店铺  ${stores.length} 家`)
  console.log(`  商品  ${items.length} 件 → 更新 ${updated} / 新增 ${inserted} / 跳过 ${skipped.length}`)
  console.log(`  库内  ${itemsBefore} → ${itemsAfter} 件${pruned ? `（清理 ${pruned} 件）` : ''}`)
  if (dryRun) console.log('  --dry：未写库')
  if (skipped.length > 0) {
    console.log('  跳过的行：')
    for (const s of skipped.slice(0, 5)) console.log(`    ${s.sku} — ${s.reason}`)
  }
  console.log('')

  logger.info('seed.done', {
    stores: stores.length,
    seedItems: items.length,
    itemsBefore,
    itemsAfter,
    updated,
    inserted,
    skipped: skipped.length,
    pruned,
    dryRun,
  })

  if (seedSkus.size !== items.length) {
    logger.warn('seed.duplicate_sku_in_seed', { unique: seedSkus.size, total: items.length })
  }

  closeDb()
}

try {
  main()
  process.exit(0)
} catch (err) {
  logger.error('seed.failed', { error: err.message, stack: err.stack })
  closeDb()
  process.exit(1)
}
