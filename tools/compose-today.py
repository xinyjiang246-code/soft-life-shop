#!/usr/bin/env python3
"""把 /tmp/today-shot 的两张截图拼成「首页多了一条『今天』」的交付图。

出：预览截图/今天_交付.png

两格讲一件事：**这一条自己会变**。
  · ① 今天还没发生什么 —— 说的是「今天有什么」，不是「你还缺什么」
  · ② 今天做过事       —— 把你今天真正做过的说出来（等满几单 / 存下几餐 / 记下多少克）

关键不在文案好不好看，在于第 ① 格里的东西**每天都会换**（日期 / 今日特调 /
惜食份数 / 今日空运的城市）—— 这正是「第二天回来看到的和昨天一模一样」的解法。

素材（shot-today.mjs 出的整屏截图，780×1688 = 390×844 @2x）。
"""
import os
from PIL import Image, ImageDraw, ImageFont

SRC = "/tmp/today-shot"
OUT_DIR = "预览截图"
OUT = os.path.join(OUT_DIR, "今天_交付.png")

BACKGROUND = (250, 248, 244)
INK = (46, 42, 37)
SUB = (146, 136, 124)
LINE = (226, 220, 210)
CARD = (255, 255, 255)
CARAMEL = (176, 124, 66)


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


# 每格裁到「顶栏 + 提示气泡 + 氛围条」，也就是新增那一条所在的整块上下文。
CROP = (0, 0, 780, 694)
PANEL_W = 636          # 缩放后的宽度
GAP = 34
MARGIN = 56
TITLE_H = 132

panels = [
    ("态 B · 今天还没发生什么", "1-态B-今天还没发生什么.png",
     "说的是「今天有什么」，不是「你还缺什么」—— 没有催单、没有「还没」"),
    ("态 A · 今天已经下过一单", "2-态A-今天已经下过一单.png",
     "把你今天真正做过的说出来：等满几单 / 存下几餐 / 记下多少克"),
]

shots = []
for label, name, note in panels:
    im = Image.open(os.path.join(SRC, name)).convert("RGB").crop(CROP)
    ratio = PANEL_W / im.width
    shots.append((label, im.resize((PANEL_W, int(im.height * ratio)), Image.LANCZOS), note))

panel_h = shots[0][1].height
LABEL_H = 34
NOTE_H = 54
FOOT_H = 92

W = MARGIN * 2 + PANEL_W * 2 + GAP
H = TITLE_H + LABEL_H + panel_h + NOTE_H + FOOT_H

canvas = Image.new("RGB", (W, H), BACKGROUND)
draw = ImageDraw.Draw(canvas)

f_title = load_font(34, bold=True)
f_sub = load_font(17)
f_label = load_font(19, bold=True)
f_note = load_font(16)
f_foot = load_font(16)

# ---- 标题区 ----
draw.text((MARGIN, 44), "首页多了一条「今天」", font=f_title, fill=INK)
draw.text((MARGIN, 88),
          "以前每日心情 / 今日特调 / 惜食柜 / 慢活额度 / 手账全是「每日」的，却没有一处把它们串成一天 ——",
          font=f_sub, fill=SUB)
draw.text((MARGIN, 114),
          "第二天回来看到的和昨天一模一样。现在它们汇成一条，而且自己会变。",
          font=f_sub, fill=SUB)
draw.line((MARGIN, TITLE_H - 14, W - MARGIN, TITLE_H - 14), fill=LINE, width=2)

# ---- 两格 ----
y = TITLE_H
for i, (label, im, note) in enumerate(shots):
    x = MARGIN + i * (PANEL_W + GAP)

    # 标签：态 A 用焦糖色，态 B 用墨色（一眼分出基准态与有内容态）
    draw.text((x, y + 4), label, font=f_label, fill=CARAMEL if i == 1 else INK)

    iy = y + LABEL_H
    draw.rectangle((x - 1, iy - 1, x + PANEL_W + 1, iy + panel_h + 1), outline=LINE, width=2)
    canvas.paste(im, (x, iy))

    draw.text((x, iy + panel_h + 18), note, font=f_note, fill=SUB)

# ---- 底注 ----
fw = W - MARGIN * 2
fy = H - FOOT_H + 16
draw.line((MARGIN, fy - 16, W - MARGIN, fy - 16), fill=LINE, width=2)
draw.text((MARGIN, fy),
          "守住的三件事：① 跨天真的会翻页（注入昨天的账必须回到态 B）"
          "　② 两种态不会同时出现　③ 没有签到 / 没有连续多少天 / 不给奖励",
          font=f_foot, fill=SUB)

os.makedirs(OUT_DIR, exist_ok=True)
canvas.save(OUT)
print("出图:", OUT, canvas.size)
