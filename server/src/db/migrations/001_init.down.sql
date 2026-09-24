-- 001_init 回滚：先删索引再删表（其实 DROP TABLE 会连带删索引，显式写出来是为了可读）
DROP INDEX IF EXISTS items_category_idx;
DROP INDEX IF EXISTS items_store_idx;
DROP INDEX IF EXISTS items_store_name_unique;
DROP INDEX IF EXISTS items_sku_unique;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS stores;
