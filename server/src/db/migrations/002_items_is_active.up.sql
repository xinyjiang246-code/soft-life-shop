-- 002_items_is_active —— 给 items 加「上架 / 下架」开关
--
-- 为什么不直接 DELETE：下架是日常操作（比如某款茶冬天不做），
-- 删掉会连历史订单的引用一起断掉。所以「下架」= is_active = 0，真删才走 DELETE。

ALTER TABLE items ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE INDEX items_is_active_idx ON items (is_active);
