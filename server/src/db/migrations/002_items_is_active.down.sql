-- 002_items_is_active 回滚：先删索引，再删列
-- （SQLite 3.35+ 支持 DROP COLUMN；被索引引用的列不能直接删，所以顺序不能反）
DROP INDEX IF EXISTS items_is_active_idx;
ALTER TABLE items DROP COLUMN is_active;
