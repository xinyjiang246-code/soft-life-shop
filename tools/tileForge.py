#!/usr/bin/env python3
# ============================================================
#  角落磁贴小画锻造炉（Tile Forge）
#  ------------------------------------------------------------
#  把 图标生图原始/{charity,archive,myshop}.png 处理成
#  首页「MORE 小角落」三块磁贴的圆形小图素材：
#    ① 抠底：AI 说好的「透明底」经常是**画出来的假棋盘格**（浅灰/米白交替），
#       或干脆是纯白。从四边泛洪填充「浅且灰」的像素一并清掉 → 真透明
#    ② 顺手做 1px 边缘侵蚀，去掉抗锯齿留下的浅色描边
#    ③ 按主体裁成 1:1，并保证主体**外接圆**能塞进画面内切圆
#       （磁贴是 border-radius:50% + overflow:hidden，超出去就被切）
#    ④ 输出 320×320 透明底 WebP → src/assets/tiles/{名字}.webp
#
#  用法：
#    python3 tools/tileForge.py                   # 处理全部
#    python3 tools/tileForge.py --only charity    # 只处理一张
#    python3 tools/tileForge.py --size 384        # 改输出边长（默认 320）
#    python3 tools/tileForge.py --fill 0.9        # 主体占圆的比例（默认 .88，越大越满）
#
#  换图流程：新图丢进 图标生图原始/ 改名为 <tileId>.png，跑一遍，零代码改动。
# ============================================================

import argparse
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "图标生图原始"
OUT_DIR = ROOT / "src" / "assets" / "tiles"
EXTS = {".png", ".jpg", ".jpeg", ".webp"}

TILES = ["charity", "archive", "myshop"]

# 背景判定：浅 + 灰。「灰」用通道极差，「浅」用最小通道。
# 棋盘格两档（实测最暗 ≈215）、纯白、米白纸底都落在这个范围里；
# 而画面里的淡蓝 #C3CBD1(min195)、灰绿、桃色、玫瑰色都在范围外，不会被误吃。
# ⚠️ 阈值必须低于最暗的那一档棋盘格（215）——曾设 214 导致暗格没被清掉，
#    泛洪填充过不去，主体 bbox 撑成整张 1024×1024。
BG_MIN_CHANNEL = 205
BG_MAX_SPREAD = 20


def is_bg(c) -> bool:
    return min(c[:3]) >= BG_MIN_CHANNEL and (max(c[:3]) - min(c[:3])) <= BG_MAX_SPREAD


def knockout(img: Image.Image) -> Image.Image:
    """从四边泛洪填充背景 → 透明；再做 1px 边缘侵蚀去浅色描边"""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()

    seen = bytearray(w * h)
    q = deque()

    def push(x, y):
        i = y * w + x
        if not seen[i] and is_bg(px[x, y]):
            seen[i] = 1
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (255, 255, 255, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                push(nx, ny)

    # 侵蚀：紧贴透明区、且本身也「浅且灰」的像素（抗锯齿残边）一并清掉
    halo = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            if not is_bg(px[x, y]):
                continue
            if any(
                0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            ):
                halo.append((x, y))
    for x, y in halo:
        px[x, y] = (255, 255, 255, 0)
    return img


def subject_bbox(img: Image.Image):
    a = img.getchannel("A").point(lambda v: 255 if v > 8 else 0)
    return a.getbbox()


def max_radius(img: Image.Image) -> float:
    """主体（不透明像素）相对自身中心的最大半径 —— 圆形裁切的真实约束。

    为什么不用 bbox 对角线：bbox 的四个角通常是空的（相机是圆角矩形、小铺子
    上窄下宽、猫碗是个椭圆），按对角线算会白缩一大圈 —— 实测相机只占到圆的
    60%，而旁边那只猫占满 85%，一眼看出没对齐。
    先缩到 256 再扫，精度足够（±0.5%）且快。
    """
    w, h = img.size
    a = img.getchannel("A")
    scale = min(1.0, 256 / max(w, h))
    small = a.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS) if scale < 1 else a
    sw, sh = small.size
    px = small.load()
    cx, cy = sw / 2, sh / 2
    best = 0.0
    for y in range(sh):
        for x in range(sw):
            if px[x, y] > 40:
                d = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
                if d > best:
                    best = d
    return best / scale


def forge_one(src: Path, dst: Path, size: int, fill: float, margin: float) -> str:
    img = knockout(Image.open(src))
    bbox = subject_bbox(img)
    if not bbox:
        raise RuntimeError(f"{src.name} 抠完没有主体了（背景判定可能吃掉了画面）")
    img = img.crop(bbox)
    bw, bh = img.size
    maxr = max_radius(img)

    # 留白 + 内切圆约束：主体的**外接圆直径** ≤ fill × 方形边长
    pad = round(max(bw, bh) * margin)
    bw_c, bh_c = bw + pad * 2, bh + pad * 2
    side = max(bw_c, bh_c, round(2 * maxr / fill))

    canvas = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    canvas.alpha_composite(img, ((side - bw) // 2, (side - bh) // 2))
    canvas = canvas.resize((size, size), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst, "WEBP", quality=88, method=6)
    return (f"  {src.name} → {dst.name}（主体 {bw}×{bh}，外接圆占方形 {2 * maxr / side * 100:.0f}%，"
            f"{dst.stat().st_size / 1024:.0f}KB）")


def main():
    ap = argparse.ArgumentParser(description="角落磁贴小画：原始生图 → 透明底方形素材")
    ap.add_argument("--only", default=None, help="只处理某一张（charity / archive / myshop）")
    ap.add_argument("--size", type=int, default=320, help="输出边长（默认 320）")
    ap.add_argument("--fill", type=float, default=0.92, help="主体外接圆直径占方形边长的比例（默认 0.92，越大越满）")
    ap.add_argument("--margin", type=float, default=0.06, help="主体四周留白比例（默认 0.06）")
    args = ap.parse_args()

    if not RAW_DIR.exists():
        print(f"找不到 {RAW_DIR}/，请先把生图放进去并命名为 <tileId>.png")
        sys.exit(1)

    names = [args.only] if args.only else TILES
    done = 0
    for name in names:
        src = next((RAW_DIR / f"{name}{e}" for e in sorted(EXTS) if (RAW_DIR / f"{name}{e}").exists()), None)
        if not src:
            print(f"  ⚠️ 跳过 {name}：{RAW_DIR.name}/ 里没有 {name}.png")
            continue
        try:
            print(forge_one(src, OUT_DIR / f"{name}.webp", args.size, args.fill, args.margin))
            done += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  ❌ {name} 处理失败：{exc}")
    print(f"\n完成 {done}/{len(names)} 张 → src/assets/tiles/")


if __name__ == "__main__":
    main()
