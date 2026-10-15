#!/usr/bin/env python3
"""给 GitHub Pages 版（最新版）做二维码 / 分享卡。

和 tools/makeQR.py 同源，只把 URL 换成 GitHub Pages 链接（不改动 workbuddy 那条）。
用法：
  /Users/s/.workbuddy/binaries/python/envs/default/bin/python tools/makeQR_ghpages.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import qrcode
from qrcode.constants import ERROR_CORRECT_H

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "发布"
# 最新版在线 Demo 走 GitHub Pages（不依赖被卡的 workbuddy 账号）
URL = "https://xinyjiang246-code.github.io/soft-life-shop/"

PAPER = (246, 241, 232)
INK = (46, 42, 37)
SUB = (141, 134, 124)

SRC = ROOT / "src/assets/pets/a-cream-stage2.webp"
HEAD_BOX = (185, 2, 655, 472)

SIZE = 1200
MARGIN = 6

CN_SERIF = "/System/Library/Fonts/Supplemental/Songti.ttc"
CN_SANS = "/System/Library/Fonts/Hiragino Sans GB.ttc"
MONO = "/System/Library/Fonts/SFNSMono.ttf"


def head_image(side: int, paper) -> Image.Image:
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
    modules = qr.modules_count + MARGIN * 2
    module_px = px / modules
    if with_pet:
        inner = round(module_px * modules * 0.22)
        pad = round(module_px * 0.6)
        box = Image.new("RGB", (inner + pad * 2,) * 2, PAPER)
        box.paste(head_image(inner, PAPER), (pad, pad))
        img.paste(box, ((px - box.width) // 2,) * 2)
    return img


def font(path: str, size: int, index: int = 0):
    p = Path(path)
    if not p.exists():
        raise SystemExit(f"❌ 字体不存在：{path}")
    f = ImageFont.truetype(path, size, index=index)
    if f.getname()[0].endswith("Default") or f.getmask("慢").size[0] == 0:
        raise SystemExit(f"❌ {path} index={index} 渲染不出中文")
    return f


def make_card() -> Image.Image:
    W = 1200
    PAD_T, PAD_B = 120, 140
    QR = 760
    GAP_QR, GAP_TITLE, GAP_RULE, GAP_SUB = 104, 58, 46, 46
    SUB_TEXT = "扫码打开 · 手机上就能玩，不用注册"

    title_f = font(CN_SERIF, 76, index=1)
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
    make_qr(True).save(OUT / "二维码_GitHubPages.png", optimize=True)
    print("  二维码_GitHubPages.png")
    make_qr(False).save(OUT / "二维码_GitHubPages_纯码.png", optimize=True)
    print("  二维码_GitHubPages_纯码.png")
    make_card().save(OUT / "分享卡_GitHubPages.png", optimize=True)
    print("  分享卡_GitHubPages.png")
    print("→", OUT)


if __name__ == "__main__":
    main()
