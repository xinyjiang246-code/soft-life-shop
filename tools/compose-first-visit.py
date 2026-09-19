#!/usr/bin/env python3
"""把 /tmp/walk-wb3 的截图拼成「陌生人第一次进来」这条线的交付图。

出：预览截图/新人第一眼_交付.png

四格讲一件事：**功能一个没动，改的是这一路「告诉用户什么」。**
  · ① 陌生人的第一眼   —— 原来写着「下午好，欢迎回来」
  · ② 滚到底            —— 站内第一次交代这个铺子是谁开的
  · ③ 唯一一次揭晓      —— 原来写着「你只是完整地经历了『挑选的快乐』」
  · ④ 这笔钱往哪儿去    —— 原来只有一个空输入框和一句 placeholder

素材（walk-wb3.mjs 出的整屏截图，780×1688 = 390×844 @2x）。
"""
import os
from PIL import Image, ImageDraw, ImageFont

SRC = "/tmp/walk-wb3"
OUT_DIR = "预览截图"

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


F_TITLE = load_font(21, bold=True)
F_LABEL = load_font(14.5, bold=True)
F_NOTE = load_font(12.5)
F_MONO = load_font(11.5)

PAD = 34
GAP = 26
TITLE_H = 74
LABEL_H = 30
NOTE_H = 46
COL_W = 440
ROW_H = 352


def cover(img, w, h):
    """等比放大到铺满 w×h，再从中间裁 —— 局部裁出来的比例各不相同，靠它拉齐。"""
    r = max(w / img.width, h / img.height)
    nw, nh = int(img.width * r + .5), int(img.height * r + .5)
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - w) // 2, (nh - h) // 2
    return img.crop((left, top, left + w, top + h))


def card(img, w, h, radius=8):
    c = Image.new("RGB", (w, h), CARD)
    c.paste(img, ((w - img.width) // 2, (h - img.height) // 2))
    d = ImageDraw.Draw(c)
    d.rectangle([0, 0, w - 1, h - 1], outline=LINE)
    return c


def grab(name, top, bottom):
    img = Image.open(f"{SRC}/{name}").convert("RGB")
    return img.crop((0, int(img.height * top), img.width, int(img.height * bottom)))


def main():
    cells = [
        ("① 陌生人的第一眼", grab("A1-陌生人首屏.png", 0.01, 0.40),
         "原来这里写「下午好，欢迎回来」—— 对着一个从没来过的人"),
        ("② 滚到底：谁开的铺子", grab("A2-陌生人底部.png", 0.52, 0.95),
         "站内第一次交代「我」是谁 —— 原先一个字都没有"),
        ("③ 唯一一次揭晓", grab("C1-结账页.png", 0.58, 0.89),
         "原来后半句是「你只是经历了『挑选的快乐』」"),
        ("④ 这笔钱往哪儿去", grab("D1-猫粮账本.png", 0.24, 0.62),
         "原先只说「钱在你手上」，没说这笔钱能往哪儿去"),
    ]

    W = PAD * 2 + COL_W * 2 + GAP
    H = TITLE_H + (LABEL_H + ROW_H + NOTE_H) * 2 + 18 + PAD * 2
    canvas = Image.new("RGB", (W, H), BACKGROUND)
    d = ImageDraw.Draw(canvas)

    d.text((PAD, PAD - 6), "陌生人第一次走进慢活小铺", font=F_TITLE, fill=INK)
    d.text((PAD + 4, PAD + 26),
           "功能、玩法、布局一个没动 —— 改的是这一路上，产品「告诉用户什么」。",
           font=F_NOTE, fill=SUB)

    for i, (label, src, note) in enumerate(cells):
        col, row = i % 2, i // 2
        x = PAD + col * (COL_W + GAP)
        y = PAD + TITLE_H + row * (LABEL_H + ROW_H + NOTE_H)
        d.text((x + 2, y), label, font=F_LABEL, fill=CARAMEL)
        canvas.paste(card(cover(src, COL_W, ROW_H), COL_W, ROW_H), (x, y + LABEL_H))
        d.text((x + 2, y + LABEL_H + ROW_H + 12), note, font=F_MONO, fill=SUB)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = f"{OUT_DIR}/新人第一眼_交付.png"
    canvas.save(out)
    print("OK", out, canvas.size)


if __name__ == "__main__":
    main()
