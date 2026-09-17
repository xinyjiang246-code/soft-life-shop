#!/usr/bin/env python3
"""把 tools/shot-print-detail.mjs 抓的整屏图按视口 rect 裁开，拼成「四样手段」局部对照表。

为什么单独做这一张：印刷层是**克制**的改动，整页缩略图（UI_印刷层_前后对照.png）
缩小到几百像素后几乎看不出差别。必须按元素放大才看得见颗粒/硬阴影/实线/印章。
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

DPR = 2            # captureScreenshot 的 deviceScaleFactor
CROP_W = 400       # 每张局部图统一宽度
OUT = "预览截图/UI_印刷层_四样手段.png"
BACKGROUND = (250, 248, 244)
INK = (46, 42, 37)
SUB = (140, 130, 118)
LINE = (226, 220, 210)

ROWS = [
    ("1-grain", "颗粒纸面", "叠在原有纸纹之上的噪点（不是替换纸纹）"),
    ("2-shadow", "硬阴影", "偏移实色 2px 2px 0；按下去会 translate 收掉，真的「陷」进去"),
    ("3-line", "1px 实线", "等待页抬头行：虚线 → 印刷实线"),
    ("4-seal", "印章", "结局页卡片右上角盖「已送达」，砖红双描边、转 -7°"),
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

rects = json.load(open("/tmp/print-rects.json"))


def stdev(img):
    """灰度标准差 —— 用来量纸面上的噪点有多"脏"（σ 越大噪声越明显）。"""
    import numpy as np
    a = np.asarray(img.convert("L"), dtype=float)
    return float(a.std())


def uniform_window(imgs, w, h, stride=16):
    """在 imgs（改造前/后两张整屏）里找一块两者**都**均匀的 w×h 区域，返回 (x0, y0, σ0)。

    为什么会踩到印章：只用「改造前最均匀」去挑，挑中的空位在**改造后可能被新元素占掉** ——
    实测挑到 (528,0)，改造前 σ=1.69（纯纸面），改造后 σ=16.91（那块里正好盖了印章角），
    于是得出「颗粒让纸面变脏了 10 倍」的荒唐结论。
    改成在两张图上同时最小化 σ 之和：真正的纸面区域两边都低，被新元素占掉的区域一高一低 → 自然落选。
    """
    import numpy as np
    arrs = [np.asarray(im.convert("L"), dtype=float) for im in imgs]
    H, W = arrs[0].shape
    best, best_xy, best_s0 = None, (0, 0), 0.0
    for y in range(0, max(1, H - h), stride):
        for x in range(0, max(1, W - w), stride):
            s0 = float(arrs[0][y:y + h, x:x + w].std())
            s1 = float(arrs[1][y:y + h, x:x + w].std())
            if best is None or s0 + s1 < best:
                best, best_xy, best_s0 = s0 + s1, (x, y), s0
    return best_xy, best_s0


def crop(name):
    r = rects[name]
    img = Image.open(f"/tmp/full-{name}.png").convert("RGB")
    x0 = max(0, round(r["x"] * DPR))
    y0 = max(0, round(r["y"] * DPR))
    x1 = min(img.width, round((r["x"] + r["w"]) * DPR))
    y1 = min(img.height, round((r["y"] + r["h"]) * DPR))
    c = img.crop((x0, y0, x1, y1))
    h = round(c.height * CROP_W / c.width)
    return c.resize((CROP_W, h), Image.LANCZOS)


# 颗粒这一对：从两张**整屏**里，按「改造前最均匀的那块」对齐裁切
WIN_W, WIN_H = 240, 150
gb = Image.open("/tmp/full-grain-before.png").convert("RGB")
ga = Image.open("/tmp/full-grain-after.png").convert("RGB")
(x0, y0), sigma0 = uniform_window([gb, ga], WIN_W, WIN_H)
grain_before = gb.crop((x0, y0, x0 + WIN_W, y0 + WIN_H))
grain_after = ga.crop((x0, y0, x0 + WIN_W, y0 + WIN_H))
print(f"颗粒取样窗口: ({x0},{y0}) {WIN_W}x{WIN_H} · 改造前 σ={sigma0:.2f} · "
      f"改造后 σ={float(__import__('numpy').asarray(grain_after.convert('L'), dtype=float).std()):.2f}")

pairs = []
for key, title, note in ROWS:
    if key.endswith("grain"):
        b, a = grain_before, grain_after
        sc = round(CROP_W / b.width, 2)
        b = b.resize((CROP_W, round(b.height * CROP_W / b.width)), Image.LANCZOS)
        a = a.resize((CROP_W, round(a.height * CROP_W / a.width)), Image.LANCZOS)
        note = (f"{note} · 取样 {WIN_W}×{WIN_H} 放大 {sc}× · σ {stdev(b):.2f} → {stdev(a):.2f}")
        pairs.append((title, note, b, a))
        continue
    b = crop(f"{key}-before")
    a = crop(f"{key}-after")
    pairs.append((title, note, b, a))

MARGIN, GAP, HEAD_H, LABEL_H = 26, 18, 34, 62
row_h = [max(b.height, a.height) for _, _, b, a in pairs]
sheet_w = MARGIN * 2 + CROP_W * 2 + GAP
sheet_h = MARGIN + HEAD_H + sum(LABEL_H + h + GAP for h in row_h) - GAP + MARGIN

sheet = Image.new("RGB", (sheet_w, sheet_h), BACKGROUND)
d = ImageDraw.Draw(sheet)

d.text((MARGIN, MARGIN + 6), "印刷层 · 四样手段（放大看）", font=font(20, True), fill=INK)
y = MARGIN + HEAD_H
for ci, lab in enumerate(["改造前", "改造后"]):
    x = MARGIN + ci * (CROP_W + GAP)
    d.text((x, y), lab, font=f_col, fill=SUB if ci == 0 else (150, 95, 55))
y += HEAD_H + 6

for (title, note, b, a), h in zip(pairs, row_h):
    d.text((MARGIN, y), title, font=f_row, fill=INK)
    d.text((MARGIN + 100, y + 5), note, font=f_note, fill=SUB)
    d.line([(MARGIN, y + 28), (sheet_w - MARGIN, y + 28)], fill=LINE, width=1)
    cy = y + LABEL_H
    for ci, img in enumerate([b, a]):
        x = MARGIN + ci * (CROP_W + GAP)
        sheet.paste(img, (x, cy + (h - img.height) // 2))
        d.rectangle([x - 1, cy + (h - img.height) // 2 - 1,
                     x + CROP_W, cy + (h - img.height) // 2 + img.height], outline=LINE, width=1)
    y += LABEL_H + h + GAP

os.makedirs("预览截图", exist_ok=True)
sheet.save(OUT, optimize=True)
print(f"{OUT}  {sheet.width}x{sheet.height}  {os.path.getsize(OUT)//1024}KB")
