#!/usr/bin/env python3
# ============================================================
#  宠物图抠底（Knockout）
#  ------------------------------------------------------------
#  把 src/assets/pets/*.webp（RGB、干净浅色背景）抠成透明底，
#  输出同名 *-t.webp（RGBA）—— SoftPet 会优先用透明版，
#  猫咪才能脱离相框在主页上跑。
#
#  原理：从四边种子出发泛洪填充（flood fill）背景色，
#  容差内的一律透明；再对透明区边缘做 1px 侵蚀去白边。
#  猫咪内部由棕色描边封闭，不会被吃掉；胡须间的背景能被清掉。
#
#  用法：python3 tools/petKnockout.py [--tol 26] [--dir src/assets/pets]
# ============================================================

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def knockout(path: Path, out: Path, tol: int) -> None:
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()

    # 背景色 = 四角平均
    cs = [px[0, 0][:3], px[w - 1, 0][:3], px[0, h - 1][:3], px[w - 1, h - 1][:3]]
    bg = tuple(sum(c[i] for c in cs) // 4 for i in range(3))

    def near(c):
        return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) <= tol * 3

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            i = y * w + x
            if not seen[i] and near(px[x, y]):
                seen[i] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            i = y * w + x
            if not seen[i] and near(px[x, y]):
                seen[i] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        px[x, y] = (255, 255, 255, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not seen[i] and near(px[nx, ny]):
                    seen[i] = 1
                    q.append((nx, ny))

    # 1px 侵蚀：紧贴透明区的浅色像素（抗锯齿白边）也变透明
    halo = []
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if seen[i]:
                continue
            c = px[x, y]
            if c[3] == 0:
                continue
            adj_transparent = any(
                0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            )
            if adj_transparent and near(c):
                halo.append((x, y))
    for x, y in halo:
        px[x, y] = (255, 255, 255, 0)

    img.save(out, "WEBP", quality=82, method=6)
    kb = out.stat().st_size / 1024
    print(f"  {path.name} → {out.name}（{kb:.0f}KB）")


def main():
    ap = argparse.ArgumentParser(description="宠物图抠底：*.webp → *-t.webp 透明版")
    ap.add_argument("--tol", type=int, default=26, help="背景容差（默认 26）")
    ap.add_argument("--dir", default="src/assets/pets", help="处理目录")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    target = root / args.dir
    files = sorted(p for p in target.glob("*.webp") if not p.stem.endswith("-t"))
    if not files:
        print(f"{target} 里没有可处理的 webp")
        return
    for f in files:
        knockout(f, f.with_name(f"{f.stem}-t.webp"), args.tol)
    print(f"完成 {len(files)} 张。SoftPet 会自动优先使用透明版。")


if __name__ == "__main__":
    main()
