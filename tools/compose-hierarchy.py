#!/usr/bin/env python3
"""把 tools/shot-hierarchy-ab.mjs 抓的两版整页图，按元素裁成「字阶层前后对照」表。

为什么必须按元素放大：字阶层改的是**字重与斜体**（正体 500 → 斜体 800、中文 Medium → Semibold），
整页缩略图缩到几百像素后，这个差别基本看不见；只有按元素裁出来并排看才作数。

和印刷层那张的区别：这里**不做等宽缩放** —— 两边都是同一台 390px 宽、DPR=2 的截图，
保持 1:1 设备像素才能顺带看出「斜体比正体宽了多少」（那正是 320px 折行的成因）。
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

DPR = 2
OUT = "预览截图/UI_字阶层_前后对照.png"
BACKGROUND = (250, 248, 244)
INK = (46, 42, 37)
SUB = (140, 130, 118)
LINE = (226, 220, 210)
HILITE = (150, 95, 55)

# (视图键, 锚元素, 标题, 说明, 相对锚点的裁切框 dx/dy/w/h（CSS px，两边各自按自己的锚点算）)
ROWS = [
    ("brand", ".brand", "顶栏店招", "正体 500 → 斜体 800（WONK 轴）：全站最高一级的重音", (-10, -12, 220, 60)),
    ("section", ".section-title", "栏目名", "斜衬线 800；后面那个计数退回 upright mono —— 一行之内做出落差",
     (-18, -12, 250, 80)),
    ("hero", ".hero-copy h1", "首页主标题", "宋体 Medium → Semibold（中文这一档只加一级，再多会发闷）",
     (-10, -8, 220, 92)),
    ("shop", ".store-head h1", "店铺名", "宋体 Medium → Semibold", (-8, -10, 210, 56)),
    ("shop", "#store-menu-heading", "菜单栏目名", "同一个重音层：MENU 斜体 800 + 5/5 安静 mono", (-30, -12, 250, 56)),
    ("charity", ".charity-hero-num", "公益页大数字", "500 → 600：数字是这一页的主角，不该跟小标一样重", (-14, -14, 160, 86)),
    ("ending", ".ending-title", "结局页标题 + 英文小语",
     "标题不再把「好」孤零零留在第二行；那句英文独立成行，走重音层", (-14, -10, 360, 208)),
]


def font(size, bold=False):
    for p, idx in [("/System/Library/Fonts/PingFang.ttc", 1 if bold else 0),
                   ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
                   ("/System/Library/Fonts/Supplemental/Songti.ttc", 0)]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=idx)
            except Exception:
                continue
    return ImageFont.load_default()


f_row = font(19, True)
f_note = font(13)
f_col = font(15, True)
f_meta = font(11)

rects = json.load(open("/tmp/hier-rects.json"))


def crop(side, key, anchor, box):
    """按锚元素的位置裁一块 —— 两版各自用**自己的**锚点坐标，纵向才不会因为排版微差而错位。"""
    r = rects[f"{side}-{key}"]["els"].get(anchor)
    img = Image.open(f"/tmp/full-{side}-{key}.png").convert("RGB")
    if r is None:
        return None, None
    dx, dy, w, h = box
    x0 = round((r["x"] + dx) * DPR)
    y0 = round((r["y"] + dy) * DPR)
    x1, y1 = x0 + round(w * DPR), y0 + round(h * DPR)
    x0c, y0c = max(0, x0), max(0, y0)
    x1c, y1c = min(img.width, x1), min(img.height, y1)
    return img.crop((x0c, y0c, x1c, y1c)), r


rows_out = []
for key, anchor, title, note, box in ROWS:
    b, rb = crop("before", key, anchor, box)
    a, ra = crop("after", key, anchor, box)
    if a is None:
        print(f"!! {key} 在改造后没找到 {anchor}，跳过")
        continue
    tag = (f"改造前 {rb['字体']} {rb['重']}{'i' if rb['斜'] == 'italic' else ''} {rb['号']:g}px"
           if rb else "改造前：这一版还没有这个元素")
    tag += f"   →   改造后 {ra['字体']} {ra['重']}{'i' if ra['斜'] == 'italic' else ''} {ra['号']:g}px"
    rows_out.append((title, note, tag, b, a))
    print(f"{key}: {tag}")

MARGIN, GAP, HEAD_H, LABEL_H, TAG_H = 26, 20, 34, 54, 20
cw = max(max(x[3].width if x[3] else 0, x[4].width) for x in rows_out)
row_h = [max(b.height if b else 0, a.height) for _, _, _, b, a in rows_out]
sheet_w = MARGIN * 2 + cw * 2 + GAP
sheet_h = MARGIN + HEAD_H + TAG_H + sum(LABEL_H + h + GAP for h in row_h) - GAP + MARGIN

sheet = Image.new("RGB", (sheet_w, sheet_h), BACKGROUND)
d = ImageDraw.Draw(sheet)
d.text((MARGIN, MARGIN + 4), "字阶层 · 三声部（按元素并排看）", font=font(20, True), fill=INK)
d.text((MARGIN, MARGIN + HEAD_H - 4),
       "左边 = 6957262（印刷层完成版，全站字重 500 / 无斜体）；右边 = 字阶层。同一台 390px、DPR=2，未缩放。",
       font=f_meta, fill=SUB)
y = MARGIN + HEAD_H + TAG_H
for ci, lab in enumerate(["改造前", "改造后"]):
    d.text((MARGIN + ci * (cw + GAP), y), lab, font=f_col, fill=SUB if ci == 0 else HILITE)
y += 24

for (title, note, tag, b, a), h in zip(rows_out, row_h):
    d.text((MARGIN, y), title, font=f_row, fill=INK)
    d.text((MARGIN + 130, y + 5), note, font=f_note, fill=SUB)
    d.line([(MARGIN, y + 27), (sheet_w - MARGIN, y + 27)], fill=LINE, width=1)
    d.text((MARGIN, y + 32), tag, font=f_meta, fill=HILITE)
    cy = y + LABEL_H
    for ci, img in enumerate([b, a]):
        if img is None:
            d.text((MARGIN + ci * (cw + GAP), cy + 8), "（这一版还没有这个元素）", font=f_note, fill=SUB)
            continue
        x = MARGIN + ci * (cw + GAP)
        sheet.paste(img, (x, cy))
        d.rectangle([x - 1, cy - 1, x + img.width, cy + img.height], outline=LINE, width=1)
    y += LABEL_H + h + GAP

os.makedirs("预览截图", exist_ok=True)
sheet.save(OUT, optimize=True)
print(f"{OUT}  {sheet.width}x{sheet.height}  {os.path.getsize(OUT) // 1024}KB")
