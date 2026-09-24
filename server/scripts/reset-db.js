/**
 * 重建数据库：删掉库文件 → 重新迁移 → 重新灌种子。
 *
 * ⚠️ 这是破坏性操作，会丢掉所有手工改过的数据。
 *    所以必须显式加 --yes 才会执行 —— 防止在 shell 历史里误触。
 *
 * 用法：npm run db:reset -- --yes
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import config from '../src/config/index.js'
import logger from '../src/lib/logger.js'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

if (!process.argv.includes('--yes')) {
  console.error('')
  console.error('  ⚠️  db:reset 会删除数据库文件并重建，所有手工数据都会丢失。')
  console.error(`      目标文件：${config.db.file}`)
  console.error('      确认要执行请加 --yes：')
  console.error('        npm run db:reset -- --yes')
  console.error('')
  process.exit(1)
}

const removed = []
for (const suffix of ['', '-wal', '-shm']) {
  const file = `${config.db.file}${suffix}`
  if (fs.existsSync(file)) {
    fs.rmSync(file)
    removed.push(path.relative(SERVER_ROOT, file))
  }
}

logger.info('db.reset.removed', { files: removed })

const run = (script, scriptArgs = []) => {
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', script, ...scriptArgs], {
    cwd: SERVER_ROOT,
    stdio: 'inherit',
  })
}

run(path.join('src', 'db', 'migrate.js'), ['up'])
run(path.join('scripts', 'seed.js'))

const { openDb, query, closeDb } = await import('../src/db/index.js')
openDb()
const counts = query('SELECT (SELECT COUNT(*) FROM stores) AS stores, (SELECT COUNT(*) FROM items) AS items')[0]
closeDb()

console.log('')
console.log(`  ✓ 数据库已重建：${counts.stores} 家店 / ${counts.items} 件商品`)
console.log(`    ${config.db.file}`)
console.log('')
