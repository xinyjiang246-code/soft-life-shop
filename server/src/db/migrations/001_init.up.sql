-- 001_init —— 建表：stores（店铺，只读字典）+ items（商品/菜单，CRUD 主体）
--
-- 设计要点：
--   · 金额存「分」（INTEGER），不存浮点 —— 0.1 + 0.2 在钱上是不可接受的
--   · timestamps 统一 ISO8601 UTC 字符串，便于直接 JSON 往返
--   · tags 用 JSON 数组字符串存，配 json_valid 约束防止写入非法 JSON
--   · CHECK 约束是最后一道防线：即使某天有人绕过 zod 直接写库，脏数据也进不来

CREATE TABLE stores (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  tagline     TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CHECK (length(trim(id)) BETWEEN 1 AND 32),
  CHECK (length(trim(name)) BETWEEN 1 AND 60)
);

CREATE TABLE items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sku          TEXT NOT NULL,
  name         TEXT NOT NULL,
  name_cn      TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  store_id     TEXT NOT NULL REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  category     TEXT NOT NULL,
  tags         TEXT NOT NULL DEFAULT '[]',
  description  TEXT NOT NULL DEFAULT '',
  in_stock     INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  CHECK (length(trim(sku)) BETWEEN 1 AND 40),
  CHECK (length(trim(name)) BETWEEN 1 AND 80),
  CHECK (length(trim(name_cn)) BETWEEN 1 AND 80),
  CHECK (length(trim(category)) BETWEEN 1 AND 40),
  CHECK (price_cents BETWEEN 0 AND 10000000),
  CHECK (in_stock IN (0, 1)),
  CHECK (json_valid(tags))
);

-- sku 全局唯一：它是对外的稳定标识，改价改名都不该动它
CREATE UNIQUE INDEX items_sku_unique ON items (sku);
-- 同一家店里不允许重名（不同店可以有同名商品）
CREATE UNIQUE INDEX items_store_name_unique ON items (store_id, name);
CREATE INDEX items_store_idx ON items (store_id);
CREATE INDEX items_category_idx ON items (category);
