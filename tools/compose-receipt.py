#!/usr/bin/env python3
"""把 tools/shot-receipt.mjs 的三张素材拼成交付图。

出：预览截图/等待凭证_交付.png

三格并排，讲一件事：**这张纸是等出来的，不是画出来的。**
  · 结局页全貌      —— 它在页面上的位置（不抢戏，接在「路上的纪念」后面）
  · 纸本身          —— DOM 里那张，印章压在角上、没盖住那句话
  · 存下来的 PNG    —— ⌘S 之后真的落在磁盘上的一张图，能拿给人看

素材说明（见 shot-receipt.mjs）：
  · `1-ending-full.png` 是整页长截图（captureBeyondViewport），另外两张是元素级截图
  · `3-saved.png` **不是**页面截图，是 canvas 画完 export 出来的那张原图
    （所以尺寸 1440×1682 和页面上那张不一样 —— 这是故意的，它就是给外人看的）
"""
import os
from PIL import Image, ImageDraw, ImageFont

SRC = "/tmp/receipt-shot"
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
COL_W = 400


def fit(img, w, max_h):
    """等比缩到宽 w；超过 max_h 就再按高缩，返回新图"""
    r = w / img.width
    h = int(img.height * r)
    if h > max_h:
        r = max_h / img.height
        w, h = int(img.width * r), max_h
    return img.resize((w, h), Image.LANCZOS)


def card(img, w, radius=8):
    """白底卡：把截图贴在白卡上，加一条淡边"""
    h = int(img.height)
    c = Image.new("RGB", (w, h), CARD)
    c.paste(img, ((w - img.width) // 2, 0))
    d = ImageDraw.Draw(c)
    d.rectangle([0, 0, w - 1, h - 1], outline=LINE)
    return c


def main():
    full = Image.open(f"{SRC}/1-ending-full.png").convert("RGB")
    paper = Image.open(f"{SRC}/2-paper.png").convert("RGB")
    saved = Image.open(f"{SRC}/3-saved.png").convert("RGB")

    # 三格统一高度；结局页那张是长图，只取上半（凭证在页面上半段）
    body_h = 620
    full_c = fit(full.crop((0, 0, full.width, int(full.height * 0.62))), COL_W - 24, body_h)
    paper_c = fit(paper, COL_W - 24, body_h)
    saved_c = fit(saved, COL_W - 24, body_h)

    cells = [
        ("① 结局页 · 它所在的位置", full_c, "接在「路上的纪念」后面，不抢戏"),
        ("② 纸 · 印章压在角上", paper_c, "角上留了一条边，没盖住那句话"),
        ("③ 存下来的图 · 能拿给人看", saved_c, "1440×1682，⌘S 之后真的落在磁盘上"),
    ]

    row_h = max(c.height for _, c, _ in cells)
    W = PAD * 2 + COL_W * 3 + GAP * 2
    H = TITLE_H + LABEL_H + row_h + NOTE_H + PAD * 2

    canvas = Image.new("RGB", (W, H), BACKGROUND)
    d = ImageDraw.Draw(canvas)

    d.text((PAD, PAD - 6), "等待凭证 —— 等满才开，买不到", font=F_TITLE, fill=INK)
    d.text((PAD + 4, PAD + 26), "别家都在假装（假针 / 假外卖 / 假里程）；这里「等」是让人真花掉的，所以这张纸只能用等换。",
           font=F_NOTE, fill=SUB)

    y = PAD + TITLE_H
    for i, (label, img, note) in enumerate(cells):
        x = PAD + i * (COL_W + GAP)
        d.text((x + 2, y), label, font=F_LABEL, fill=CARAMEL)
        cy = y + LABEL_H
        canvas.paste(card(img, COL_W), (x, cy))
        d.text((x + 2, cy + row_h + 10), note, font=F_MONO, fill=SUB)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = f"{OUT_DIR}/等待凭证_交付.png"
    canvas.save(out)
    print("OK", out, canvas.size)


if __name__ == "__main__":
    main()
