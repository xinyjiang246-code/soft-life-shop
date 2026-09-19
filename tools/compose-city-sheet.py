"""把 10 座城市的「空运来信」图拼成一张总览，用于一眼验收。

用法：python tools/compose-city-sheet.py
产出：预览截图/世界菜单_10城_交付.png

⚠️ 字体：这台机器没有 PingFang.ttc，用 Songti.ttc / Hiragino Sans GB.ttc；
   加载失败直接抛错 —— PIL 静默回退成不含中文的字体时，整行是豆腐块。
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src/assets/cities"
OUT = ROOT / "预览截图/世界菜单_10城_交付.png"

SERIF = "/System/Library/Fonts/Supplemental/Songti.ttc"
SANS = "/System/Library/Fonts/Hiragino Sans GB.ttc"

PAPER = (244, 241, 234)
INK = (61, 56, 50)
SUB = (138, 122, 102)
LINE = (206, 196, 182)

# 与 dishForge.js 的 WORLD_KITCHENS 顺序一致
CITIES = [
    ("京都", "KYOTO", "kyoto"),
    ("首尔", "SEOUL", "seoul"),
    ("曼谷", "BANGKOK", "bangkok"),
    ("河内", "HANOI", "hanoi"),
    ("台北", "TAIPEI", "taipei"),
    ("潮汕", "CHAOSHAN", "chaoshan"),
    ("伊斯坦布尔", "ISTANBUL", "istanbul"),
    ("里斯本", "LISBON", "lisbon"),
    ("墨西哥城", "MEXICO CITY", "mexico"),
    ("那不勒斯", "NAPLES", "naples"),
]


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(path, size, index=index)
    if f.getmask("城").size[0] == 0:
        raise SystemExit(f"❌ {path} (index={index}) 渲染不出中文")
    return f


TH_W, TH_H = 372, 250
COLS, GAP, PAD, LABEL_H = 3, 16, 26, 34


def main() -> None:
    title_f = font(SERIF, 34, index=1)
    sub_f = font(SANS, 16)
    name_f = font(SANS, 21)
    en_f = font(SANS, 14)

    rows = (len(CITIES) + COLS - 1) // COLS
    W = PAD * 2 + COLS * TH_W + (COLS - 1) * GAP
    H = PAD * 2 + 76 + rows * (LABEL_H + TH_H) + (rows - 1) * GAP
    canvas = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(canvas)

    d.text((PAD, PAD), "世界菜单 · 10 座城市的“空运来信”", font=title_f, fill=INK)
    d.text((PAD, PAD + 48), "菜品仍由 AI 每天现编（所以是手绘卡）—— 这张图只交代「这桌菜从哪来」", font=sub_f, fill=SUB)
    d.line([(PAD, PAD + 70), (W - PAD, PAD + 70)], fill=LINE, width=1)

    missing = []
    for i, (cn, en, slug) in enumerate(CITIES):
        col, row = i % COLS, i // COLS
        x = PAD + col * (TH_W + GAP)
        y = PAD + 86 + row * (LABEL_H + TH_H + GAP)
        p = SRC / f"{slug}-city.webp"
        if not p.exists():
            missing.append(p.name)
            continue
        d.text((x, y), cn, font=name_f, fill=INK)
        d.text((x + 24 + d.textlength(cn, font=name_f), y + 6), en, font=en_f, fill=SUB)
        im = Image.open(p).convert("RGB")
        ratio = max(TH_W / im.width, TH_H / im.height)
        im = im.resize((round(im.width * ratio), round(im.height * ratio)), Image.LANCZOS)
        left, top = (im.width - TH_W) // 2, (im.height - TH_H) // 2
        canvas.paste(im.crop((left, top, left + TH_W, top + TH_H)), (x, y + LABEL_H))

    if missing:
        sys.exit("❌ 缺图：" + ", ".join(missing))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT)
    print(f"→ {OUT.relative_to(ROOT)}  {canvas.width}×{canvas.height}")


if __name__ == "__main__":
    main()
