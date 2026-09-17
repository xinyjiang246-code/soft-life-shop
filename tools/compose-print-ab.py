#!/usr/bin/env python3
"""把 /tmp/ab-*.png 拼成一张「印刷层前后对照」表。

行 = 4 屏（首页/菜单/等待页/结局页），列 = 改造前 / 改造后。
改造前那列由 tools/shot-print-ab.mjs 注入样式复原到 1fae84d 的样子后抓取。
"""
import os
from PIL import Image, ImageDraw, ImageFont

SRC = "/tmp"
OUT = "预览截图/UI_印刷层_前后对照.png"

ROWS = [
    ("1-home", "首页"),
    ("2-menu", "店铺菜单"),
    ("3-wait", "配送等待页"),
    ("4-ending", "送达结局页"),
]
COLS = [("before", "改造前（只有字型层）"), ("after", "改造后（+ 印刷层）")]

CELL_W = 300
MARGIN = 26
GAP = 16
ROW_LABEL_H = 30
COL_LABEL_H = 40
BACKGROUND = (250, 248, 244)
INK = (46, 42, 37)
SUB = (140, 130, 118)


def load_font(size, bold=False):
    cands = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
    ]
    for p in cands:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=1 if bold else 0)
            except Exception:
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    continue
    return ImageFont.load_default()


f_col = load_font(17, bold=True)
f_row = load_font(19, bold=True)
f_note = load_font(13)

# 先量一张定 cell 尺寸
sample = Image.open(f"{SRC}/ab-1-home-after.png").convert("RGB")
ratio = CELL_W / sample.width
CELL_H = round(sample.height * ratio)

sheet_w = MARGIN * 2 + CELL_W * 2 + GAP
sheet_h = MARGIN + COL_LABEL_H + len(ROWS) * (ROW_LABEL_H + CELL_H + GAP) + MARGIN - GAP

sheet = Image.new("RGB", (sheet_w, sheet_h), BACKGROUND)
d = ImageDraw.Draw(sheet)

# 列标题
for ci, (_, label) in enumerate(COLS):
    x = MARGIN + ci * (CELL_W + GAP)
    d.text((x, MARGIN + 8), label, font=f_col, fill=INK if ci else SUB)

y = MARGIN + COL_LABEL_H
for key, row_label in ROWS:
    d.text((MARGIN, y + 6), row_label, font=f_row, fill=INK)
    d.line([(MARGIN + 74, y + 18), (sheet_w - MARGIN, y + 18)], fill=(224, 218, 208), width=1)
    for ci, (side, _) in enumerate(COLS):
        p = f"{SRC}/ab-{key}-{side}.png"
        img = Image.open(p).convert("RGB").resize((CELL_W, CELL_H), Image.LANCZOS)
        x = MARGIN + ci * (CELL_W + GAP)
        cy = y + ROW_LABEL_H
        sheet.paste(img, (x, cy))
        d.rectangle([x - 1, cy - 1, x + CELL_W, cy + CELL_H], outline=(224, 218, 208), width=1)
    y += ROW_LABEL_H + CELL_H + GAP

os.makedirs("预览截图", exist_ok=True)
sheet.save(OUT, optimize=True)
print(f"{OUT}  {sheet.width}x{sheet.height}  {os.path.getsize(OUT)//1024}KB")
