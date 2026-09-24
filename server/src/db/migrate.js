/**
 * 迁移执行器。
 *
 * 约定：`src/db/migrations/NNN_name.up.sql` 与同名的 `.down.sql` 成对出现。
 *   · 每个迁移在**自己的事务**里执行 —— SQLite 的 DDL 是事务性的，失败即整体回滚，不会留半张表
 *   · schema_migrations 记录版本、名称、checksum、执行时间
 *   · checksum 用来发现「已应用的迁移文件事后被人改了」—— 这会让库结构悄悄偏离代码预期
 *
 * 用法：
 *   node src/db/migrate.js up            应用全部待执行迁移
 *   node src/db/migrate.js up --to 002   应用到指定版本
 *   node src/db/migrate.js down          回滚最近一步
 *   node src/db/migrate.js down --to 001 回滚到指定版本（不含该版本）
 *   node src/db/migrate.js status        查看状态
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

import config from '../config/index.js'
import logger from '../lib/logger.js'
import { openDb, getDb, closeDb, execute, query, transaction } from './index.js'

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

const FILE_PATTERN = /^(\d{3})_([a-z0-9_]+)\.(up|down)\.sql$/i

function ensureMigrationsTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `)
}

/** 扫描迁移目录，返回按版本升序的列表。 */
function discover() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`迁移目录不存在：${MIGRATIONS_DIR}`)
  }

  const found = new Map()

  for (const file of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    const m = FILE_PATTERN.exec(file)
    if (!m) continue

    const [, version, name, direction] = m
    const entry = found.get(version) ?? { version, name, up: null, down: null }
    entry[direction] = {
      file,
      sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'),
    }
    found.set(version, entry)
  }

  const list = [...found.values()].sort((a, b) => a.version.localeCompare(b.version))

  for (const entry of list) {
    if (!entry.up) throw new Error(`迁移 ${entry.version}_${entry.name} 缺少 .up.sql`)
    // down 不是必须的（有些迁移确实不可逆），但应该有 —— 这里只提示
    if (!entry.down) logger.warn('migrate.no_down_file', { version: entry.version, name: entry.name })
  }

  return list
}

const checksumOf = (sql) => crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16)

function applied() {
  return query('SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version')
}

/**
 * 检查已应用迁移是否与文件一致。
 * 生产环境直接抛错（库结构已不可信），其他环境只大声警告。
 */
function assertNoDrift(migrations, records) {
  const byVersion = new Map(migrations.map((m) => [m.version, m]))
  const drifted = []

  for (const rec of records) {
    const mig = byVersion.get(rec.version)
    if (!mig) {
      drifted.push(`${rec.version} 已应用，但对应文件已不存在`)
      continue
    }
    if (checksumOf(mig.up.sql) !== rec.checksum) {
      drifted.push(`${rec.version}_${rec.name} 文件内容与应用时不一致（checksum 变了）`)
    }
  }

  if (drifted.length === 0) return

  const detail = drifted.map((d) => `  - ${d}`).join('\n')
  const message = `检测到迁移文件漂移：\n${detail}`

  if (config.isProduction) throw new Error(message)
  logger.warn('migrate.drift_detected', { detail: drifted })
}

/** 应用待执行迁移。返回实际执行了哪些版本。 */
export function up({ to } = {}) {
  ensureMigrationsTable()
  const migrations = discover()
  const done = new Set(applied().map((r) => r.version))
  assertNoDrift(migrations, applied())

  const pending = migrations.filter((m) => !done.has(m.version) && (!to || m.version <= to))
  if (pending.length === 0) {
    logger.info('migrate.up.nothing_to_do', { applied: done.size })
    return []
  }

  const ran = []
  for (const mig of pending) {
    transaction(() => {
      getDb().exec(mig.up.sql)
      execute(
        'INSERT INTO schema_migrations (version, name, checksum) VALUES (@version, @name, @checksum)',
        { version: mig.version, name: mig.name, checksum: checksumOf(mig.up.sql) },
      )
    })
    ran.push(mig.version)
    logger.info('migrate.applied', { version: mig.version, name: mig.name, file: mig.up.file })
  }

  return ran
}

/** 回滚。默认只回滚最近一步；给 to 则回滚到该版本（不含）。 */
export function down({ to, steps = 1 } = {}) {
  ensureMigrationsTable()
  const migrations = discover()
  const byVersion = new Map(migrations.map((m) => [m.version, m]))
  const records = applied()

  if (records.length === 0) {
    logger.info('migrate.down.nothing_to_do')
    return []
  }

  const targets = to
    ? records.filter((r) => r.version > to).reverse()
    : records.slice(-steps).reverse()

  if (targets.length === 0) {
    logger.info('migrate.down.nothing_to_do', { to })
    return []
  }

  const reverted = []
  for (const rec of targets) {
    const mig = byVersion.get(rec.version)
    if (!mig?.down) {
      throw new Error(`迁移 ${rec.version}_${rec.name} 没有 .down.sql，无法回滚`)
    }

    transaction(() => {
      getDb().exec(mig.down.sql)
      execute('DELETE FROM schema_migrations WHERE version = @version', { version: rec.version })
    })
    reverted.push(rec.version)
    logger.info('migrate.reverted', { version: rec.version, name: rec.name })
  }

  return reverted
}

export function status() {
  ensureMigrationsTable()
  const migrations = discover()
  const done = new Map(applied().map((r) => [r.version, r]))

  const rows = migrations.map((m) => ({
    version: m.version,
    name: m.name,
    state: done.has(m.version) ? 'applied' : 'pending',
    appliedAt: done.get(m.version)?.applied_at ?? '—',
  }))

  return rows
}

/** 供 server 启动时调用。 */
export function runMigrations() {
  return up()
}

// —— CLI ——
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isCli) {
  const command = process.argv[2] ?? 'up'
  const args = process.argv.slice(3)
  const to = args.includes('--to') ? args[args.indexOf('--to') + 1] : undefined

  try {
    openDb()

    if (command === 'up') {
      const ran = up({ to })
      logger.info('migrate.done', { command, ran })
    } else if (command === 'down') {
      const reverted = down({ to })
      logger.info('migrate.done', { command, reverted })
    } else if (command === 'status') {
      const rows = status()
      process.stdout.write(`\n迁移状态（共 ${rows.length} 个）\n`)
      for (const r of rows) {
        const mark = r.state === 'applied' ? '✓' : '·'
        process.stdout.write(`  ${mark} ${r.version}_${r.name.padEnd(24)} ${r.state.padEnd(8)} ${r.appliedAt}\n`)
      }
      process.stdout.write('\n')
    } else {
      throw new Error(`未知命令：${command}（可用：up / down / status）`)
    }

    closeDb()
    process.exit(0)
  } catch (err) {
    logger.error('migrate.failed', { command, error: err.message })
    closeDb()
    process.exit(1)
  }
}
