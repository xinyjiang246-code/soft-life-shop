#!/usr/bin/env python3
"""把 shot-pet-face.mjs 拍下的帧拼成一张交付图（2026-09-17）。

为什么要这层：出图脚本负责「取景正确」，但一张张散图没法一眼看出
「哪张是点哪里出来的」。这里读 manifest.json 按它的顺序与标题排版，
标题也来自 manifest —— 不在这里再抄一遍映射，免得图和标注对不上。

⚠️ 踩过的坑：一开始把画布建成 W*SCALE 大、但所有坐标仍按 1× 传，
   结果内容全挤在左上角四分之一、右下大片空白（自己看半天以为排版函数坏了）。
   现在统一走 S() 换算，**所有**坐标与字号都过一遍。
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pf3/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '预览截图/软软_表情_一览.png'

FONT_CJK = '/System/Library/Fonts/Hiragino Sans GB.ttc'
BG = (247, 244, 238)
INK = (46, 42, 37)
MUTED = (139, 128, 116)
CLAY = (196, 112, 63)

SCALE = 2                      # 输出放大倍率：表情差别小，得让人看清
COLS = 4
TW, TH = 320, 320              # 每格缩略图（基准单位）
PAD, GAP = 26, 8
LABEL_H = 62
HEADER_H = 92


def S(v):
    return int(round(v * SCALE))


def font(size, index=0):
    return ImageFont.truetype(FONT_CJK, S(size), index=index)


def center(draw, text, cx, y, f, fill):
    w = draw.textlength(text, font=f)
    draw.text((S(cx) - w / 2, S(y)), text, font=f, fill=fill)


def main():
    manifest = json.load(open(os.path.join(SRC, 'manifest.json'), encoding='utf-8'))
    rows = (len(manifest) + COLS - 1) // COLS

    W = COLS * TW + (COLS - 1) * GAP + PAD * 2
    H = HEADER_H + rows * (TH + LABEL_H) + PAD

    canvas = Image.new('RGB', (S(W), S(H)), BG)
    d = ImageDraw.Draw(canvas)
    f_title = font(19)
    f_sub = font(14, index=1)
    f_head = font(25)
    f_hint = font(14, index=1)

    d.text((S(PAD), S(22)), '软软 · 摸摸它，脸会变', font=f_head, fill=INK)
    d.text((S(PAD), S(60)), '每个表情都对应一个部位；同一个地方连着点，眼睛还会升级成爱心和星星',
           font=f_hint, fill=MUTED)

    for i, item in enumerate(manifest):
        col, row = i % COLS, i // COLS
        x = PAD + col * (TW + GAP)
        y = HEADER_H + row * (TH + LABEL_H)

        src = Image.open(os.path.join(SRC, item['file'] + '.png')).convert('RGB')
        # 680px 原图 → 640px（2× 下的 320 基准），几乎无损
        canvas.paste(src.resize((S(TW), S(TH)), Image.LANCZOS), (S(x), S(y)))

        cx = x + TW / 2
        feel = item.get('feel') or ''
        label = f"{item['title']} → {feel}" if feel else item['title']
        is_idle = item['expr'] == 'idle'
        center(d, label, cx, y + TH + 12, f_title, MUTED if is_idle else CLAY)
        if item.get('line'):
            center(d, item['line'], cx, y + TH + 38, f_sub, MUTED)

    os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
    canvas.save(OUT)
    print('写入', OUT, canvas.size)


if __name__ == '__main__':
    main()
