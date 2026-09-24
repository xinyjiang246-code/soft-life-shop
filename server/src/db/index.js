/**
 * SQLite 连接封装（驱动用的是 Node 22 内置的 node:sqlite —— 不需要编译原生模块）。
 *
 * 只做四件事：
 *   ① 打开连接并设好 PRAGMA（外键、WAL、busy_timeout）
 *   ② 提供 query / queryOne / execute 三个薄封装
 *   ③ 提供 transaction()，多步写入出错自动回滚
 *   ④ 提供 ping()，给 /ready 探针用
 *
 * 不在这里写任何业务 SQL —— 那是 repository 层的事。
 */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import config from '../config/index.js'
import logger from '../lib/logger.js'
import { ServiceUnavailableError } from '../errors/index.js'

let db = null

/** 打开数据库。幂等：重复调用返回同一连接。 */
export function openDb() {
  if (db) return db

  const file = config.db.file
  fs.mkdirSync(path.dirname(file), { recursive: true })

  db = new DatabaseSync(file)

  // 外键约束默认是关的，必须显式开 —— 否则 store_id 写错也不会报错
  db.exec('PRAGMA foreign_keys = ON')
  // WAL：读写不互相阻塞，本地开发 / 单机部署都更稳
  db.exec('PRAGMA journal_mode = WAL')
  // 被别的连接锁住时等待而不是立刻抛 SQLITE_BUSY
  db.exec(`PRAGMA busy_timeout = ${config.db.busyTimeoutMs}`)
  // 崩溃安全与性能的平衡点
  db.exec('PRAGMA synchronous = NORMAL')

  logger.info('sqlite.opened', { file })
  return db
}

export function getDb() {
  if (!db) throw new ServiceUnavailableError('数据库尚未初始化')
  return db
}

export function closeDb() {
  if (!db) return
  try {
    db.close()
    logger.info('sqlite.closed')
  } catch (err) {
    logger.warn('sqlite.close_failed', { error: err.message })
  } finally {
    db = null
  }
}

/**
 * 参数绑定统一走这里。
 *
 * node:sqlite 只接受 null / number / bigint / string / Uint8Array，
 * undefined 和 boolean 会直接抛错 —— 这一层把它们转成能落库的值，
 * 免得每个 repository 都手写一遍转换。
 */
function normalizeParams(params) {
  if (params === undefined || params === null) return []
  if (Array.isArray(params)) return params.map(normalizeValue)

  const out = {}
  for (const [k, v] of Object.entries(params)) {
    // SQLite 具名参数要带前缀（我们用 @name / :name 风格）
    out[k.startsWith('@') || k.startsWith(':') || k.startsWith('$') ? k : `@${k}`] = normalizeValue(v)
  }
  return out
}

function normalizeValue(v) {
  if (v === undefined) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}

/** 取多行。 */
export function query(sql, params) {
  return getDb().prepare(sql).all(normalizeParams(params))
}

/** 取一行，没有则 null。 */
export function queryOne(sql, params) {
  return getDb().prepare(sql).get(normalizeParams(params)) ?? null
}

/** 执行写语句，返回 { changes, lastInsertRowid }。 */
export function execute(sql, params) {
  return getDb().prepare(sql).run(normalizeParams(params))
}

/**
 * 事务包装。支持嵌套调用（内层复用外层事务，只有最外层 commit/rollback）。
 *
 * 用 BEGIN IMMEDIATE 而不是 BEGIN：立刻拿写锁，避免「读到一半发现要升级锁」的死锁。
 */
let txDepth = 0

export function transaction(fn) {
  const database = getDb()
  const isOutermost = txDepth === 0

  if (isOutermost) database.exec('BEGIN IMMEDIATE')
  txDepth += 1

  try {
    const result = fn()
    txDepth -= 1
    if (isOutermost) database.exec('COMMIT')
    return result
  } catch (err) {
    txDepth -= 1
    if (isOutermost) {
      try {
        database.exec('ROLLBACK')
      } catch (rollbackErr) {
        logger.error('sqlite.rollback_failed', { error: rollbackErr.message })
      }
    }
    throw err
  }
}

/** 给 /ready 探针：能跑通一条最轻的查询就算健康。 */
export function ping() {
  try {
    getDb().prepare('SELECT 1 AS ok').get()
    return true
  } catch {
    return false
  }
}
