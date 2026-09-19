"""把 12 杯特调的「实拍 + 油画棒」拼成一张总览，用于一眼验收。

用法：python tools/compose-special-sheet.py
产出：预览截图/特调_12杯_交付.png

⚠️ 字体：这台机器**没有** PingFang.ttc，用 Songti.ttc(6) / Hiragino Sans GB.ttc(0)。
   PIL 找不到字体时会静默回退成不含中文的默认字体 → 整行豆腐块，
   所以这里加载失败**直接抛错**，不用 load_default 兜底。
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src/assets/specials"
OUT = ROOT / "预览截图/特调_12杯_交付.png"

SERIF = "/System/Library/Fonts/Supplemental/Songti.ttc"
SANS = "/System/Library/Fonts/Hiragino Sans GB.ttc"

PAPER = (244, 241, 234)
INK = (61, 56, 50)
SUB = (138, 122, 102)
LINE = (206, 196, 182)

# dailySpecials 的顺序，别乱动 —— 和图一一对应
DRINKS = [
    ("桂花乌龙冷萃", "osmanthus-cold-brew"),
    ("烤奶盖厚乳", "torched-milk-cap"),
    ("青提气泡美式", "grape-soda-americano"),
    ("茉莉奶绿", "jasmine-milk-green"),
    ("黑糖麻薯奶茶", "mochi-brown-sugar"),
    ("白桃乌龙气泡", "peach-oolong-fizz"),
    ("陈皮红豆沙", "tangerine-red-bean"),
    ("椰子灰拿铁", "coconut-ash-latte"),
    ("咸蛋黄奶盖", "salted-yolk-cap"),
    ("梅子绿茶", "plum-green-tea"),
    ("厚可可鲜奶", "thick-cocoa-milk"),
    ("樱花盐渍气泡", "sakura-salt-soda"),
]


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(path, size, index=index)
    # 真能渲染中文吗？渲染不出来就是豆腐块，别让它悄悄上线
    if f.getmask("杯").size[0] == 0:
        raise SystemExit(f"❌ {path} (index={index}) 渲染不出中文")
    return f


TH_W, TH_H = 300, 222          # 单张缩略图
COLS = 3
GAP = 18
PAD = 26
LABEL_H = 30


def main() -> None:
    title_f = font(SERIF, 34, index=1)
    name_f = font(SANS, 21)
    tag_f = font(SANS, 15)

    cell_w = TH_W * 2 + 8
    cell_h = LABEL_H + TH_H
    rows = (len(DRINKS) + COLS - 1) // COLS
    W = PAD * 2 + COLS * cell_w + (COLS - 1) * GAP
    H = PAD * 2 + 70 + rows * cell_h + (rows - 1) * GAP
    canvas = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(canvas)

    d.text((PAD, PAD), "今日特调 · 12 杯", font=title_f, fill=INK)
    d.text((PAD, PAD + 46), "左：实拍（店铺 / 菜单先露这张）    右：油画棒（小店 / 手账）",
           font=tag_f, fill=SUB)
    d.line([(PAD, PAD + 66), (W - PAD, PAD + 66)], fill=LINE, width=1)

    missing = []
    for i, (cn, slug) in enumerate(DRINKS):
        col, row = i % COLS, i // COLS
        x = PAD + col * (cell_w + GAP)
        y = PAD + 82 + row * (cell_h + GAP)

        d.text((x, y + 4), f"{i + 1:02d}  {cn}", font=name_f, fill=INK)

        for j, kind in enumerate(("real", "draw")):
            p = SRC / f"{slug}-{kind}.webp"
            if not p.exists():
                missing.append(p.name)
                continue
            im = Image.open(p).convert("RGB")
            # 居中裁成 4:3 再缩，和卡片里的 object-fit: cover 一致
            tw, th = TH_W, TH_H
            ratio = max(tw / im.width, th / im.height)
            im = im.resize((round(im.width * ratio), round(im.height * ratio)), Image.LANCZOS)
            left = (im.width - tw) // 2
            top = (im.height - th) // 2
            canvas.paste(im.crop((left, top, left + tw, top + th)), (x + j * (TH_W + 8), y + LABEL_H))

    if missing:
        sys.exit("❌ 缺图：" + ", ".join(missing))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT)
    print(f"→ {OUT.relative_to(ROOT)}  {canvas.width}×{canvas.height}")


if __name__ == "__main__":
    main()
