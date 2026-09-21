#!/usr/bin/env python3
"""把线上链接做成可分享的二维码 / 分享卡。

用法：
  /Users/s/.workbuddy/binaries/python/envs/default/bin/python tools/makeQR.py

依赖：qrcode（已装在上面那个 venv 里）、Pillow。中文字体走 macOS 自带的 Songti / PingFang。

为什么这么设计（改之前先读）：
  · 二维码的底色/墨色必须跟小铺一致（奶油纸 #F6F1E8 + 印刷墨 #2E2A25），
    但**不能为了好看降低对比度** —— 扫不出来就白做了。这两色的对比度约 12:1，安全。
  · 静区（quiet zone）留 6 个模块，比规范要求的 4 个更宽：这张图会被发进微信聊天，
    周围可能有白边/气泡色，静区不够就会被误判成噪点。
  · 中心放软软的头（复用 tools/makeIcon.py 量好的 HEAD_BOX），但 ECC 必须用 H（30% 容错）。
    头占边长 22%，面积只有 ~4.8%，远在容错范围内。
  · 生成完**必须解码验一次**（见 tools/verify-qr.mjs）：能扫出来才算完成。
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import qrcode
from qrcode.constants import ERROR_CORRECT_H

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "发布"
# ⚠️ 2026-09-21 换了链接：旧链接（soft-life-shop.app.workbuddy.host）的运行环境
#    平台没法复用，重新发布时只能新建应用 → 新域名多了一段数字。
#    改链接时这里、MEMORY.md、skill 三处要一起改，改完**必须重跑本脚本 + 解码验一次**。
URL = "https://soft-life-shop-18918.app.workbuddy.host/"

PAPER = (246, 241, 232)          # --bg-base
INK = (46, 42, 37)               # --ink-print
SUB = (141, 134, 124)            # --text-sub

SRC = ROOT / "src/assets/pets/a-cream-stage2.webp"
HEAD_BOX = (185, 2, 655, 472)    # 与 makeIcon.py 同一份量好的头部坐标

SIZE = 1200                      # 码图成品边长
MARGIN = 6                       # 静区（模块数）

CN_SERIF = "/System/Library/Fonts/Supplemental/Songti.ttc"   # index 1 = Songti SC Bold（店招）
CN_SANS = "/System/Library/Fonts/Hiragino Sans GB.ttc"       # index 0 = W3（正文）
MONO = "/System/Library/Fonts/SFNSMono.ttf"
# ⚠️ 不要写 PingFang.ttc —— 这台机器上 /System/Library/Fonts/PingFang.ttc **不存在**，
#    而 PIL 加载失败会**静默**换成内置的默认字体，那个字体没有中文 → 整行变成豆腐块
#    （第一版分享卡的「扫码打开 · …」就是这么烂掉的，图上看着像一排小方块）。
#    所以下面的 font() 改成「加载失败直接抛错」，不再有静默回退。


def head_image(side: int, paper) -> Image.Image:
    """软软的头，缩到指定边长（给二维码中心用）。"""
    src = Image.open(SRC).convert("RGB")
    head = src.crop(HEAD_BOX)
    s = max(head.size)
    sq = Image.new("RGB", (s, s), paper)
    sq.paste(head, ((s - head.width) // 2, (s - head.height) // 2))
    return sq.resize((side, side), Image.LANCZOS)


def make_qr(with_pet: bool = True, px: int = SIZE) -> Image.Image:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=10, border=MARGIN)
    qr.add_data(URL)
    qr.make(fit=True)

    img = qr.make_image(fill_color=INK, back_color=PAPER).convert("RGB")
    img = img.resize((px, px), Image.NEAREST)

    # 模块边长（含静区）—— 用来算中心挖多大
    modules = qr.modules_count + MARGIN * 2
    module_px = px / modules

    if with_pet:
        inner = round(module_px * modules * 0.22)     # 头占整幅 22%
        pad = round(module_px * 0.6)                  # 头外面垫一圈纸色，别贴着模块
        box = Image.new("RGB", (inner + pad * 2,) * 2, PAPER)
        box.paste(head_image(inner, PAPER), (pad, pad))
        img.paste(box, ((px - box.width) // 2,) * 2)
    return img


def font(path: str, size: int, index: int = 0):
    """加载字体。⚠️ 失败要炸，不能静默回退 —— 静默回退的产物是豆腐块，比报错难查得多。"""
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"❌ 字体不存在：{path}\n   （macOS 上没有 PingFang.ttc，用 Hiragino Sans GB 代替）")
    f = ImageFont.truetype(path, size, index=index)
    # 真要渲染中文，得能画出字形；画不出就是豆腐块
    if f.getname()[0].endswith("Default") or f.getmask("慢").size[0] == 0:
        raise SystemExit(f"❌ {path} index={index} 渲染不出中文（会出豆腐块）")
    return f


def make_card() -> Image.Image:
    """分享卡：二维码 + 一句话 + 链接。发给朋友用这一张（长按可识别）。

    ⚠️ 不要用写死的 dy 排文字：中文字体的实际行高会随字号跳，
    第一版就是这么被坑的 —— 「扫码打开」那行被店招压住、中间还插了一条线穿过去。
    现在每一行的位置都由 textbbox 实测高度推出来，画布高度也跟着算，底部不留空白。
    """
    W = 1200
    PAD_T, PAD_B = 120, 140
    QR = 760
    GAP_QR, GAP_TITLE, GAP_RULE, GAP_SUB = 104, 58, 46, 46
    SUB_TEXT = "扫码打开 · 手机上就能玩，不用注册"

    title_f = font(CN_SERIF, 76, index=1)     # Songti Bold，像店招
    sub_f = font(CN_SANS, 34)
    link_f = font(MONO, 26)

    probe = ImageDraw.Draw(Image.new("RGB", (4, 4)))

    def h_of(text: str, f) -> int:
        bb = probe.textbbox((0, 0), text, font=f)
        return bb[3] - bb[1]

    h_title = h_of("慢活小铺", title_f)
    h_sub = h_of(SUB_TEXT, sub_f)
    h_link = h_of(URL, link_f)

    H = (PAD_T + QR + GAP_QR + h_title + GAP_TITLE + 1 + GAP_RULE + h_sub
         + GAP_SUB + h_link + PAD_B)
    canvas = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(canvas)

    canvas.paste(make_qr(True, QR), ((W - QR) // 2, PAD_T))

    y = PAD_T + QR + GAP_QR
    # anchor="mt"：水平居中、以给定 y 为文字顶部（省得自己加 ascender 偏移）
    d.text((W / 2, y), "慢活小铺", font=title_f, fill=INK, anchor="mt")
    y += h_title + GAP_TITLE

    d.line([((W - 660) / 2, y), ((W + 660) / 2, y)], fill=(74, 69, 64), width=1)
    y += 1 + GAP_RULE

    d.text((W / 2, y), SUB_TEXT, font=sub_f, fill=SUB, anchor="mt")
    y += h_sub + GAP_SUB

    d.text((W / 2, y), URL, font=link_f, fill=SUB, anchor="mt")
    return canvas


def main() -> None:
    if not OUT.exists():
        OUT.mkdir()
    qr = make_qr(True)
    qr.save(OUT / "二维码_线上链接.png", optimize=True)
    print(f"  二维码_线上链接.png  {qr.size[0]}×{qr.size[1]}")

    # 纯码版：给「不能有装饰」的地方用（海报、印刷、别的平台）
    make_qr(False).save(OUT / "二维码_线上链接_纯码.png", optimize=True)
    print("  二维码_线上链接_纯码.png  1200×1200（不带软软，容错最好）")

    card = make_card()
    card.save(OUT / "分享卡_扫码打开.png", optimize=True)
    print(f"  分享卡_扫码打开.png  {card.size[0]}×{card.size[1]}")
    print("→", OUT)


if __name__ == "__main__":
    main()
