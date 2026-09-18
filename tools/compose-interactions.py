#!/usr/bin/env python3
"""把 tools/shot-interactions.mjs 抓的帧拼成交付图。

出两张：
  预览截图/交互_转场与加购动线.png  —— 转场 4 帧 + 加购飞点 4 帧
  预览截图/交互_点击手感.png        —— 三种按钮「常态 / 按下」4 倍放大对照

素材说明（见 shot-interactions.mjs）：
  · 转场帧是把 ::view-transition 的动画 pause() 冻在 120/700/1300/2300ms 再截的。
    不冻的话 CDP 截图会等合成器稳定，等于把转场快进到底，四帧会一模一样。
  · 飞点帧是把 WAAPI 的 playbackRate 降到 0.12 抓的，每帧的实际坐标记在
    /tmp/fly-marks.json，用来在图上画指示圈。
"""
import json
import os
from PIL import Image, ImageDraw, ImageFont

SRC = "/tmp"
OUT_DIR = "预览截图"

BACKGROUND = (250, 248, 244)
INK = (46, 42, 37)
SUB = (146, 136, 124)
LINE = (226, 220, 210)
RING = (198, 96, 66)
CARD = (255, 255, 255)


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


F_TITLE = load_font(19, bold=True)
F_NOTE = load_font(12.5)
F_COL = load_font(11.5)
F_SMALL = load_font(10.5)

# ---------------------------------------------------------------- 图一
CELL_W = 176
MARGIN = 26
GAP = 13
TITLE_H = 30
NOTE_H = 20
COL_LABEL_H = 26

TR_COLS = [("0ms", "起点 · 纸还在，内容还没上来"),
           ("80ms", "淡入约七成（同时从右侧推入）"),
           ("170ms", "基本到位"),
           ("260ms", "落定")]
FLY_COLS = [("起飞", "从按下的位置出发"),
            ("中途", "走一条微微上抛的弧"),
            ("接近", "快到顶栏的袋子"),
            ("到位", "袋子晃一下 + 角标弹一下")]

sample = Image.open(f"{SRC}/tr-0.png")
CELL_H = round(sample.height * CELL_W / sample.width)
marks = json.load(open(f"{SRC}/fly-marks.json"))

sheet_w = MARGIN * 2 + CELL_W * 4 + GAP * 3
sheet_h = MARGIN * 2 + (TITLE_H + NOTE_H + CELL_H + COL_LABEL_H + 26) * 2 + 200
sheet = Image.new("RGB", (sheet_w, sheet_h), BACKGROUND)
d = ImageDraw.Draw(sheet)

y = MARGIN
for row, (title, note, prefix) in enumerate([
    ("① 切页转场 · 首页 → 店铺页（前进方向）",
     "原来切页是硬切（条件渲染直接换 DOM）；现在屏幕内容整体淡入 + 从右推入 10px（底栏不动）。",
     "tr"),
    ("② 加购 → 购物袋动线",
     "原来只有底部一行 toast、角标数字悄悄 +1，东西「去哪了」没有交代。",
     "fly"),
]):
    d.text((MARGIN, y), title, font=F_TITLE, fill=INK)
    d.text((MARGIN, y + TITLE_H - 6), note, font=F_NOTE, fill=SUB)
    y += TITLE_H + NOTE_H

    for i, (label, sub) in enumerate(TR_COLS if prefix == "tr" else FLY_COLS):
        x = MARGIN + i * (CELL_W + GAP)
        img = Image.open(f"{SRC}/{prefix}-{i}.png").convert("RGB").resize((CELL_W, CELL_H), Image.LANCZOS)
        sheet.paste(img, (x, y))
        d.rectangle([x, y, x + CELL_W - 1, y + CELL_H - 1], outline=LINE)

        # 加购那行：在飞点实际位置上画圈
        if prefix == "fly":
            m = marks[i] if i < len(marks) else None
            if m:
                cx = x + m["x"] / 390 * CELL_W
                cy = y + m["y"] / 844 * CELL_H
                d.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], outline=RING, width=2)
            else:
                bx, by = 356, 33  # 到位帧：圈住顶栏的购物袋
                cx = x + bx / 390 * CELL_W
                cy = y + by / 844 * CELL_H
                d.ellipse([cx - 15, cy - 15, cx + 15, cy + 15], outline=RING, width=2)

        d.text((x + 1, y + CELL_H + 7), label, font=F_COL, fill=INK)
        d.text((x + 1, y + CELL_H + 7), "", font=F_SMALL, fill=SUB)

    # 每格下方的小注
    for i, (label, sub) in enumerate(TR_COLS if prefix == "tr" else FLY_COLS):
        x = MARGIN + i * (CELL_W + GAP)
        d.text((x + 1, y + CELL_H + COL_LABEL_H - 3), sub, font=F_SMALL, fill=SUB)

    y += CELL_H + COL_LABEL_H + 26

    # 加购那行再补一条 2 倍局部：13px 的圆点缩进 176px 宽的缩略图只剩 6px，
    # 光靠圈标位置不够有说服力，得让人真的看见"那个点"。
    if prefix == "fly":
        ZOOM = 176
        d.text((MARGIN, y - 6), "飞点局部 ×2（圈住的就是它）", font=F_COL, fill=INK)
        y += 18
        s = 2.0  # deviceScaleFactor
        half = 88
        for i in range(4):
            m = marks[i] if i < len(marks) else None
            cx, cy = (m["x"] * s, m["y"] * s) if m else (356 * s, 33 * s)
            src = Image.open(f"{SRC}/fly-{i}.png").convert("RGB")
            box = (int(max(0, cx - half)), int(max(0, cy - half)), int(cx + half), int(cy + half))
            crop = src.crop(box).resize((ZOOM, ZOOM), Image.LANCZOS)
            x = MARGIN + i * (CELL_W + GAP)
            sheet.paste(crop, (x, y))
            d.rectangle([x, y, x + ZOOM - 1, y + ZOOM - 1], outline=LINE)
            # 圆点就在裁切窗口的正中心（裁切是以它为中心开的）
            r = 15 if i < 3 else 19
            cxx, cyy = x + ZOOM / 2, y + ZOOM / 2
            d.ellipse([cxx - r, cyy - r, cxx + r, cyy + r], outline=RING, width=2)
        y += ZOOM + 26

os.makedirs(OUT_DIR, exist_ok=True)
sheet.save(f"{OUT_DIR}/交互_转场与加购动线.png")
print("写出", f"{OUT_DIR}/交互_转场与加购动线.png", sheet.size)

# ---------------------------------------------------------------- 图二
GROUPS = [
    ("add", "加购按钮（+）", "按下：阴影收掉 + 位移 2px —— 真的「陷进去」", "0.97 + 移 2px"),
    ("icon", "顶栏图标按钮", "按下缩到 0.86，松开用回弹曲线弹回来", "scale .86"),
    ("chip", "分类 chip", "按下缩到 0.93", "scale .93"),
]
Z_CELL_W, Z_CELL_H = 210, 210
Z_GAP, Z_MARGIN = 16, 26
Z_TITLE_H, Z_NOTE_H = 30, 40

z_w = Z_MARGIN * 2 + Z_CELL_W * 2 + Z_GAP
z_h = Z_MARGIN + Z_TITLE_H + Z_NOTE_H + len(GROUPS) * (Z_CELL_H + Z_NOTE_H + Z_GAP) - Z_GAP + Z_MARGIN
z = Image.new("RGB", (z_w, z_h), BACKGROUND)
zd = ImageDraw.Draw(z)

zd.text((Z_MARGIN, Z_MARGIN - 4), "点击手感 · 常态 / 按下（4 倍放大）", font=F_TITLE, fill=INK)
zd.text((Z_MARGIN, Z_MARGIN + Z_TITLE_H - 6), "原来全站只有 8 处写了 :active，其余几十个按钮按下去毫无反应。",
        font=F_NOTE, fill=SUB)

y = Z_MARGIN + Z_TITLE_H + Z_NOTE_H
for key, name, note, measured in GROUPS:
    zd.text((Z_MARGIN, y - 17), f"{name}　{note}", font=F_NOTE, fill=INK)
    for col, (state, tag) in enumerate([("off", "常态"), ("on", "按下")]):
        x = Z_MARGIN + col * (Z_CELL_W + Z_GAP)
        img = Image.open(f"{SRC}/press-{key}-{state}.png").convert("RGB")
        scale = min(Z_CELL_W / img.width, (Z_CELL_H - 22) / img.height)
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
        box_y = y + 4
        z.paste(CARD, (x, box_y, x + Z_CELL_W, box_y + Z_CELL_H - 22))
        z.paste(img, (x + (Z_CELL_W - img.width) // 2, box_y + (Z_CELL_H - 22 - img.height) // 2))
        zd.rectangle([x, box_y, x + Z_CELL_W - 1, box_y + Z_CELL_H - 23], outline=LINE)
        caption = tag if state == "off" else f"{tag} · {measured}"
        zd.text((x + 1, box_y + Z_CELL_H - 18), caption, font=F_SMALL, fill=RING if state == "on" else SUB)
    y += Z_CELL_H + Z_NOTE_H + Z_GAP

z.save(f"{OUT_DIR}/交互_点击手感.png")
print("写出", f"{OUT_DIR}/交互_点击手感.png", z.size)
