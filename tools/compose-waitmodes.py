#!/usr/bin/env python3
"""把 /tmp/wmab-*.png 拼成「三种陪等方式 · 前后对照」。

行 = 三种方式（陪他走 / 帮他看路 / 先下线），列 = 改动前 / 改动后。
「改动前」那列由 tools/shot-waitmodes-ab.mjs 从 git worktree 检出的 6b32f98
**真实构建产物**（端口 8091）截取，不是凭印象把样式改回去。
每张都从三个标签开始往下截 560px —— 这一段正好回答用户那句「选了没变化」。
"""
import os
from PIL import Image, ImageDraw, ImageFont

SRC = "/tmp"
OUT = "预览截图/UI_陪等方式_前后对照.png"

ROWS = [
    ("walk", "陪他走", "抬头行跟着换（图标 + 方式名）；地标不再灰到看不出是什么"),
    ("road", "帮他看路", "抬头行跟着换；障碍从「色块 + 文字标签」改成画出来的水坑"),
    ("offline", "先下线", "抬头行跟着换；纸真的在折（76→38px），盒子重画成开口方盒"),
]
COLS = [("before", "改动前"), ("after", "改动后")]
COL_SUB = ["选了之后，玩法追加在下面 —— 要往下滑才看得见", "选了之后，这一块就是它"]

CELL_W = 286
MARGIN = 28
GAP = 18
ROW_LABEL_H = 32
COL_LABEL_H = 48
NOTE_H = 22
BACKGROUND = (250, 248, 244)
INK = (46, 42, 37)
SUB = (140, 130, 118)
LINE = (224, 218, 208)


def load_font(size, bold=False):
    for p in ["/System/Library/Fonts/PingFang.ttc",
              "/System/Library/Fonts/Hiragino Sans GB.ttc",
              "/System/Library/Fonts/Supplemental/Songti.ttc"]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=1 if bold else 0)
            except Exception:
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    continue
    return ImageFont.load_default()


f_col = load_font(18, bold=True)
f_sub = load_font(12)
f_row = load_font(19, bold=True)
f_note = load_font(13)

sample = Image.open(f"{SRC}/wmab-after-walk.png").convert("RGB")
CELL_H = round(sample.height * CELL_W / sample.width)

sheet_w = MARGIN * 2 + CELL_W * 2 + GAP
sheet_h = MARGIN + COL_LABEL_H + len(ROWS) * (ROW_LABEL_H + CELL_H + NOTE_H + GAP) - GAP + MARGIN

sheet = Image.new("RGB", (sheet_w, sheet_h), BACKGROUND)
d = ImageDraw.Draw(sheet)

for ci, (_, label) in enumerate(COLS):
    x = MARGIN + ci * (CELL_W + GAP)
    d.text((x, MARGIN + 2), label, font=f_col, fill=INK if ci else SUB)
    d.text((x, MARGIN + 28), COL_SUB[ci], font=f_sub, fill=SUB)

y = MARGIN + COL_LABEL_H
for key, row_label, note in ROWS:
    d.text((MARGIN, y + 6), row_label, font=f_row, fill=INK)
    d.line([(MARGIN + 84, y + 20), (sheet_w - MARGIN, y + 20)], fill=LINE, width=1)
    cy = y + ROW_LABEL_H
    for ci, (side, _) in enumerate(COLS):
        img = Image.open(f"{SRC}/wmab-{side}-{key}.png").convert("RGB").resize((CELL_W, CELL_H), Image.LANCZOS)
        x = MARGIN + ci * (CELL_W + GAP)
        sheet.paste(img, (x, cy))
        d.rectangle([x - 1, cy - 1, x + CELL_W, cy + CELL_H], outline=LINE, width=1)
    d.text((MARGIN, cy + CELL_H + 6), note, font=f_note, fill=SUB)
    y = cy + CELL_H + NOTE_H + GAP

os.makedirs("预览截图", exist_ok=True)
sheet.save(OUT, optimize=True)
print(f"{OUT}  {sheet.width}x{sheet.height}  {os.path.getsize(OUT)//1024}KB")
