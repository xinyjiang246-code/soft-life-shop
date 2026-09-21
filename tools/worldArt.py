"""世界菜单 122 张配图：收集生图原始 → 去水印 → 压进 src/assets/world/。

用法：
    P=/Users/s/.workbuddy/binaries/python/envs/default/bin/python
    $P tools/worldArt.py collect     # 把 generated-images/ 里新出的按标签认领到 世界生图原始/<key>.png
    $P tools/worldArt.py process     # 逐个去水印 + 压 WebP，写到 src/assets/world/<key>.webp
    $P tools/worldArt.py             # collect + process + 报告差多少

为什么要有 collect 这一步：
    ImageGen **不能并行**——它的 output_dir 是共享状态，同一条消息里发多个调用，
    最后一次的 output_dir 会覆盖前面全部，5 张图会叠进同一个目录、还互相覆盖只剩 3 个文件
    （2026-09-20 实测，白烧 5 张）。
    而不传 output_dir 时，文件名 = prompt 前 ~22 字符 + 时间戳 —— 所以**让每条 prompt
    都以唯一短语开头**，同一批就永远不会撞名。collect 负责把那个前缀认回 key。

标签规则（必须和生成时用的完全一致）：
    饮品  `<城市英文> <食材英文> drink`
    咸食  `<城市英文> <食材英文> dish`
    甜点  `<城市英文> <食材英文> sweet`
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from specialArt import process  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "世界生图原始"
POOL_DIR = ROOT / "generated-images"
OUT_DIR = ROOT / "src/assets/world"
POOL_SUFFIX = {"drinks": "drink", "eats": "dish", "sweets": "sweet"}


def label_of(it: dict, drop_city: bool = False) -> str:
    """生成时用的那个标签。

    ⚠️ drop_city：`cityEn` 里带 CITY 的城市（只有墨西哥城 MEXICO CITY），
    生图 prompt 实际是以 **Mexico** 开头的 —— 文件名只保留 prompt 前 ~29 字符，
    所以带 CITY 的那一版**永远对不上**（2026-09-21 实测：两张墨西哥城饮品
    被 collect 判成「认不回去」，最佳前缀只对上 8 个字符）。
    所以两种写法都当候选，谁的前缀长用谁。
    """
    city_en = it["cityEn"].replace(" CITY", "") if drop_city else it["cityEn"]
    return f"{city_en} {it['en']} {POOL_SUFFIX[it['pool']]}"


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def manifest() -> list:
    out = subprocess.check_output(
        ["node", "tools/world-art-manifest.mjs", "--json"], cwd=ROOT, text=True
    )
    return json.loads(out)


def lcp(a: str, b: str) -> int:
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def collect() -> int:
    """把 generated-images/ 里新出的图，按标签认领成 世界生图原始/<key>.png。

    ⚠️ 文件名只保留 prompt 的前 ~29 个字符，**会被从中间截断**
    （`Chaoshan preserved citrus drink` → `Chaoshan_preserved_citrus_drin`）。
    所以不能拿完整标签去 startswith，会全都不匹配（2026-09-20 踩过，
    表现为「明明生成了、collect 却说还没生成」）。
    正确做法：取**最长公共前缀**，要求足够长（≥ min(标签长, 26)）且明显领先第二名。
    """
    items = manifest()
    pool = sorted(POOL_DIR.glob("*.png")) if POOL_DIR.exists() else []
    taken, dup, orphan = 0, [], []

    for p in pool:
        stem = norm(p.stem)
        cands = []
        for it in items:
            if (RAW_DIR / f"{it['key']}.png").exists():
                continue
            # ⚠️ 两种写法**只有真的不同时**才当两个候选。
            #    没有 CITY 的城市（9 座）两种写法是同一个字符串 —— 重复登记会让
            #    「第二名」等于自己，于是 `best_n - second < 3` 判定成歧义、
            #    整批图都认不回去（2026-09-21 踩过：22 张里只认领了 10 张，
            #    剩下 12 张全被打成「只对上 18，第二 18」）。
            labels = {norm(label_of(it, drop_city)) for drop_city in (False, True)}
            for lab in labels:
                cands.append((lcp(stem, lab), lab, it))
        cands.sort(key=lambda c: -c[0])
        if not cands:
            break
        best_n, best_lab, best = cands[0]
        second = cands[1][0] if len(cands) > 1 else 0
        need = min(len(best_lab), 26)
        if best_n < need or best_n - second < 3:
            orphan.append(f"{p.name}（最佳 {best_lab} 只对上 {best_n}，第二 {second}）")
            continue
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        shutil.move(str(p), str(RAW_DIR / f"{best['key']}.png"))
        taken += 1

    if dup:
        for k, names in dup:
            print(f"  ❌ 标签有歧义：{k} → {names}")
        sys.exit("❌ collect 中止：标签要重命名（同一个前缀认到多张图）")
    if orphan:
        print(f"  ⚠️ generated-images/ 里有 {len(orphan)} 张认不回去，先人工看一眼：")
        for o in orphan:
            print("     " + o)
    return taken


def main() -> int:
    if "collect" in sys.argv or len(sys.argv) == 1:
        n = collect()
        print(f"collect：认领 {n} 张 → 世界生图原始/")

    if "collect" in sys.argv:
        return 0

    items = manifest()
    ok, miss, bad, skip = 0, [], [], 0
    force = "--force" in sys.argv
    for it in items:
        key = it["key"]
        raw = RAW_DIR / f"{key}.png"
        if not raw.exists():
            miss.append(key)
            continue
        # 已经有成品就跳过 —— 重压一遍会白白重跑去水印，而且会让 dist 里的
        # 图片指纹整批变化（分不清「这次改动影响了什么」）。要重压用 --force。
        if not force and (OUT_DIR / f"{key}.webp").exists():
            skip += 1
            continue
        try:
            process(raw, key, "", OUT_DIR)
            ok += 1
        except SystemExit as e:
            bad.append(f"{key}: {e}")
    print()
    print(f"✅ 本次新压 {ok} 张，跳过已有的 {skip} 张，共 {len(items)} 条")
    if bad:
        print(f"❌ 去水印失败 {len(bad)}：")
        for b in bad:
            print("   " + b)
    if miss:
        print(f"⏳ 还没生成 {len(miss)}：{', '.join(miss[:20])}" + (" …" if len(miss) > 20 else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
