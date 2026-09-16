#!/usr/bin/env python3
"""出一张「改进前 / 改进后」脸部对照图（2026-09-17）。

为什么要这张：用户问的是「还有什么可以改」。光给改完的成品，看不出改了什么 ——
把同一批表情的两版并排，一眼就能看见「旧版下半张脸是死的」。
脸要放大（4x）：软软在宠物页只有 150px 宽，不放大根本没法讨论五官。

两边的截图目录从命令行传，左边的当「旧」、右边的当「新」。

用法：python3 tools/pet-face-compare.py /tmp/pf3/ /tmp/pf6/ 预览截图/软软_表情_改进对照.png
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

OLD = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pf3/'
NEW = sys.argv[2] if len(sys.argv) > 2 else '/tmp/pf6/'
OUT = sys.argv[3] if len(sys.argv) > 3 else '预览截图/软软_表情_改进对照.png'

FONT_CJK = '/System/Library/Fonts/Hiragino Sans GB.ttc'
BG = (247, 244, 238)
INK = (46, 42, 37)
MUTED = (139, 128, 116)
CLAY = (196, 112, 63)
NEW_TAG = (108, 138, 96)

SCALE = 2
ZOOM = 4
# 只裁脸：整只猫缩到 150px 之后，脸只占其中一个角，不裁看不出五官差别
FACE_BOX = (0.30, 0.150, 0.76, 0.44)
# 横排 8 格（旧一行、新一行）。别做成「一行一个表情的竖条」——
# 那会出来一张 1400x4800 的长条，在卡片里根本没法一眼对比。
TW, TH = 190, 148
PAD, GAP = 26, 10
ROWLAB = 76      # 左边留给「改进前 / 改进后」的宽度；算总宽时必须带上，否则最后一格会被裁掉
HEAD = 92
LAB = 34


def S(v):
    return int(round(v * SCALE))


def font(size, index=0):
    return ImageFont.truetype(FONT_CJK, S(size), index=index)


def face(path, name):
    im = Image.open(os.path.join(path, name + '.png')).convert('RGB')
    w, h = im.size
    c = im.crop((int(w * FACE_BOX[0]), int(h * FACE_BOX[1]), int(w * FACE_BOX[2]), int(h * FACE_BOX[3])))
    return c.resize((S(TW), S(TH)), Image.LANCZOS)


def main():
    manifest = json.load(open(os.path.join(NEW, 'manifest.json'), encoding='utf-8'))
    n = len(manifest)

    W = PAD + ROWLAB + n * TW + (n - 1) * GAP + PAD
    H = HEAD + 2 * (TH + LAB) + PAD
    cv = Image.new('RGB', (S(W), S(H)), BG)
    d = ImageDraw.Draw(cv)

    f_head = font(25)
    f_sub = font(14, index=1)
    f_lab = font(15)
    f_row = font(16)

    d.text((S(PAD), S(20)), '软软的表情 · 改进前后', font=f_head, fill=INK)
    d.text((S(PAD), S(58)), '上排：只有眼睛会变，下半张脸一直是同一张（原图本来就没有嘴）。下排：眼睛 + 嘴 + 腮红一起变。',
           font=f_sub, fill=MUTED)

    for row, (src, tag, col) in enumerate(((OLD, '改进前', MUTED), (NEW, '改进后', NEW_TAG))):
        y = HEAD + row * (TH + LAB)
        d.text((S(PAD), S(y + TH / 2 - 8)), tag, font=f_row, fill=col)
        # 行标压在左边会跟第一格打架 —— 首格右移一个行标宽度
        x0 = PAD + 76
        for i, item in enumerate(manifest):
            x = x0 + i * (TW + GAP)
            cv.paste(face(src, item['file']), (S(x), S(y)))
            if row == 0:
                label = f"{item['title']} → {item.get('feel') or ''}".strip(' →')
                d.text((S(x), S(y + TH + 6)), label, font=f_lab, fill=CLAY)

    os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
    cv.save(OUT)
    print('写入', OUT, cv.size)


if __name__ == '__main__':
    main()
