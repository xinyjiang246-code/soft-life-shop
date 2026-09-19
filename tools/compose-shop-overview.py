#!/usr/bin/env python3
"""把 verify-shop-menu.mjs 逐店截的图拼成一张「全部菜单」总览。

用法：
  node tools/verify-shop-menu.mjs                       # 先逐店截图
  /Users/s/.workbuddy/binaries/python/envs/default/bin/python tools/compose-shop-overview.py

为什么做成一张：用户问「食物怎么感觉这么少」——
与其给他六张图，不如一张能一眼数完的：6 家店并排，每格标店名与行数。
⚠️ 字体那两处照 makeQR.py 的规矩：加载失败要炸，别静默回退（回退出来的中文是豆腐块）。
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOT_DIR = ROOT / "预览截图/店铺菜单"
OUT = ROOT / "预览截图/全部商品_交付.png"
REPORT = Path("/tmp/shop-menu-report.json")

PAPER = (246, 241, 232)
INK = (46, 42, 37)
SUB = (141, 134, 124)
CN_SANS = "/System/Library/Fonts/Hiragino Sans GB.ttc"
CN_SERIF = "/System/Library/Fonts/Supplemental/Songti.ttc"
MONO = "/System/Library/Fonts/SFNSMono.ttf"


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"❌ 字体不存在：{path}")
    f = ImageFont.truetype(path, size, index=index)
    if f.getmask("慢").size[0] == 0:
        raise SystemExit(f"❌ {path} index={index} 渲染不出中文（会出豆腐块）")
    return f


def main() -> None:
    shots = sorted(p for p in SHOT_DIR.glob("*.png"))
    if not shots:
        raise SystemExit("没有截图。先跑：node tools/verify-shop-menu.mjs")

    counts = {}
    if REPORT.exists():
        rep = json.loads(REPORT.read_text(encoding="utf-8"))
        for r in rep.get("rows", []):
            # ⚠️ 用 storeName 而不是首页行名：首页那行的 innerText 第一行是满减标签
            #    （「40减12」），而截图文件名用的是店内页头的店名，两边对不上会算成 0。
            counts[r.get("storeName") or r["shop"]] = r["rows"]

    COLS, PAD, GAP, LABEL_H = 3, 24, 20, 46
    cell_w = Image.open(shots[0]).width
    cell_h = Image.open(shots[0]).height
    rows_n = (len(shots) + COLS - 1) // COLS

    title_h = 120
    W = PAD * 2 + cell_w * COLS + GAP * (COLS - 1)
    H = title_h + PAD + rows_n * (LABEL_H + cell_h) + GAP * (rows_n - 1) + PAD

    canvas = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(canvas)

    f_title = font(CN_SERIF, 46, index=1)
    f_sub = font(CN_SANS, 26)
    f_label = font(CN_SANS, 24)
    f_num = font(MONO, 22)

    total = sum(counts.get(p.stem.split("-", 1)[1], 0) for p in shots)
    d.text((PAD, 34), "慢活小铺 · 全部菜单", font=f_title, fill=INK, anchor="lt")
    d.text((PAD, 94), f"{len(shots)} 家店 · 共 {total} 行菜单 · 图上 {len(shots)} 张店内实截（无一张缺图）",
           font=f_sub, fill=SUB, anchor="lt")

    for i, shot in enumerate(shots):
        r, c = divmod(i, COLS)
        name = shot.stem.split("-", 1)[1]
        x = PAD + c * (cell_w + GAP)
        y = title_h + PAD + r * (LABEL_H + cell_h) + r * GAP
        n = counts.get(name, "?")
        d.text((x, y + 6), f"{name}", font=f_label, fill=INK, anchor="lt")
        d.text((x + cell_w, y + 8), f"{n} 样", font=f_num, fill=SUB, anchor="rt")
        img = Image.open(shot).convert("RGB")
        canvas.paste(img, (x, y + LABEL_H))
        # 1px 实线，沿用印刷层那一路（不吃圆角柔和阴影）
        d.rectangle([x, y + LABEL_H, x + cell_w - 1, y + LABEL_H + cell_h - 1],
                    outline=(74, 69, 64), width=1)

    canvas.save(OUT, optimize=True)
    print(f"  {OUT.relative_to(ROOT)}  {canvas.size[0]}×{canvas.size[1]}  共 {total} 行")


if __name__ == "__main__":
    main()
