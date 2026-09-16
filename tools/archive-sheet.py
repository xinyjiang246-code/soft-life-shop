#!/usr/bin/env python3
"""把这一轮「存下这一餐」的验收帧拼成两张交付图。

  · 存档_改进对照.png —— AI 面板被卡片裁掉 vs 修好之后（同一份 DOM，只差一个类名）
  · 存档_点开两步.png —— 照片墙 → 点开大图 → 再点出备注（用户要的那个交互）

输入是脚本自己跑出来的帧，不手摆：
  node tools/shot-archive-ab.mjs http://127.0.0.1:8080/ /tmp/ab/
  node tools/verify-archive.mjs  http://127.0.0.1:8080/ /tmp/ar/

⚠️ 坐标系只有一个：**设备像素**。截图本身是 2 倍图（390 CSS px → 780 px），
   所以帧不要再缩放、画布也不要再乘一个 SCALE ——
   两边各乘一次的结果是画布比内容宽一倍，右边一大片空白（第一版就是这么错的，
   和「按 1× 传坐标、画布按 2× 建」那个坑正好相反）。要放大就统一放大，
   这里的做法是：帧按原尺寸贴，字号直接写像素。

用法：python3 tools/archive-sheet.py <ab目录> <verify目录> <输出目录>
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

AB = sys.argv[1] if len(sys.argv) > 1 else '/tmp/ab/'
AR = sys.argv[2] if len(sys.argv) > 2 else '/tmp/ar/'
OUT = sys.argv[3] if len(sys.argv) > 3 else '预览截图/'

FONT_CJK = '/System/Library/Fonts/Hiragino Sans GB.ttc'
BG = (247, 244, 238)
INK = (46, 42, 37)
MUTED = (139, 128, 116)
CLAY = (196, 112, 63)
RED = (186, 74, 62)
LINE = (227, 224, 213)


def font(px, index=0):
    return ImageFont.truetype(FONT_CJK, px, index=index)


def frame(path, name):
    return Image.open(os.path.join(path, name + '.png')).convert('RGB')


def crop_frac(im, x0, y0, x1, y1):
    w, h = im.size
    return im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))


def fit_h(im, height):
    """按目标高度等比缩放（只在需要对齐高度时用）"""
    return im.resize((int(round(im.width * height / im.height)), height), Image.LANCZOS)


def save(cv, name):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    cv.save(p)
    print('写入', p, cv.size)


# ============================================================
# 一、改进对照
# ============================================================
def sheet_ab():
    a = frame(AB, 'A_改进前')
    b = frame(AB, 'B_改进后')
    # 两张是同一滚动位置截的，裁同一段才可比
    box = (0.0, 0.03, 1.0, 0.72)
    crop_top = a.height * box[1]
    a, b = crop_frac(a, *box), crop_frac(b, *box)

    # 裁切边界由**出图脚本量出来的几何**决定，不在拼图这边目测比例
    # （第一版就是估的：红线画到了标签行，而真正的边界是卡片的下边缘）
    ab = json.load(open(os.path.join(AB, 'ab.json'), encoding='utf-8'))
    cut_dev = ab['geomBefore']['卡片']['bottom'] - crop_top
    cut_dev = max(0, min(cut_dev, a.height))

    PAD, GAP, HEAD, LAB = 26, 24, 122, 118
    W = PAD * 2 + GAP + a.width + b.width
    H = HEAD + a.height + LAB + PAD
    cv = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(cv)

    d.text((PAD, 22), '「把这一餐存下来」· AI 面板被卡片裁掉这件事', font=font(27), fill=INK)
    d.text((PAD, 62),
           '同一份 DOM、同一段文案、同一次上传 —— 唯一的变量是 .archive-card 上的一个类名。左边是旧规则（锁死 3:4 + overflow:hidden）。',
           font=font(15, index=1), fill=MUTED)

    xa, xb = PAD, PAD + a.width + GAP
    cv.paste(a, (xa, HEAD))
    cv.paste(b, (xb, HEAD))

    # 左：在**卡片真正的下边缘**画一条红线，以下是旧版被丢掉的内容
    cut_y = HEAD + int(cut_dev)
    d.line([(xa, cut_y), (xa + a.width, cut_y)], fill=RED, width=3)
    d.text((xa + 10, max(HEAD + 6, cut_y - 30)), '卡片到这里就结束了 ↓', font=font(17, index=1), fill=RED)

    ly = HEAD + a.height + 14
    d.text((xa, ly), '改进前 · 卡片 413px / 内容 807px', font=font(17), fill=RED)
    d.text((xa, ly + 28), '被裁 394px：主色提取、同色系推荐、', font=font(14, index=1), fill=MUTED)
    d.text((xa, ly + 48), '「给它起个名字」和页脚，全看不见', font=font(14, index=1), fill=MUTED)

    d.text((xb, ly), '改进后 · 卡片 807px / 内容 807px', font=font(17), fill=CLAY)
    d.text((xb, ly + 28), '溢出 0：整块都在页面上，', font=font(14, index=1), fill=MUTED)
    d.text((xb, ly + 48), '最后一行能被点到（不是残影）', font=font(14, index=1), fill=MUTED)

    save(cv, '存档_改进对照.png')


# ============================================================
# 二、点开两步
# ============================================================
def sheet_steps():
    # 墙上那一段只看底部（上面是 AI 面板，不是这两步要讲的事）
    wall = crop_frac(frame(AR, '02b_照片墙'), 0.0, 0.70, 1.0, 1.0)
    peek = crop_frac(frame(AR, '03_点开大图'), 0.0, 0.04, 1.0, 1.0)
    card = crop_frac(frame(AR, '04_备注卡'), 0.0, 0.0, 1.0, 1.0)

    H = 1180
    wall, peek, card = fit_h(wall, H), fit_h(peek, H), fit_h(card, H)

    PAD, GAP, HEAD, LAB = 26, 20, 122, 118
    W = PAD * 2 + GAP * 2 + wall.width + peek.width + card.width
    cv = Image.new('RGB', (W, HEAD + H + LAB + PAD), BG)
    d = ImageDraw.Draw(cv)

    d.text((PAD, 22), '点开这一张：先看照片，再点一下才出备注', font=font(27), fill=INK)
    d.text((PAD, 62),
           '照片墙读的就是食物手账里的照片（同一套数据）。备注卡两边共用同一个组件，在哪边改都一样。',
           font=font(15, index=1), fill=MUTED)

    items = [
        (wall, '① 照片墙', '存下的照片都在这里'),
        (peek, '② 点开 = 大图', '底纸不透明，照片跳出来'),
        (card, '③ 再点一下 = 备注', '日期 · 名字 · 店名 · 心情 · 为什么'),
    ]
    x = PAD
    for im, title, sub in items:
        cv.paste(im, (x, HEAD))
        d.rectangle([x, HEAD, x + im.width - 1, HEAD + H], outline=LINE, width=1)
        d.text((x, HEAD + H + 14), title, font=font(18), fill=CLAY)
        d.text((x, HEAD + H + 44), sub, font=font(14, index=1), fill=MUTED)
        x += im.width + GAP

    d.text((PAD, HEAD + H + 78), '还能填：在哪家 · 和谁一起 · 热量（可选，不汇总）· 以及上传时 AI 写下的标签与小记', font=font(14, index=1), fill=MUTED)

    save(cv, '存档_点开两步.png')


if __name__ == '__main__':
    sheet_ab()
    sheet_steps()
