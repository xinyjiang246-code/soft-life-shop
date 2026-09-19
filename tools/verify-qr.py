#!/usr/bin/env python3
"""验证分享二维码真的能被扫出来。

用法：/Users/s/.workbuddy/binaries/python/envs/default/bin/python tools/verify-qr.py

为什么要有这个（别删）：
  二维码是「肉眼看着都对、扫不出来就是全废」的东西 —— 中心挖了软软的头、底色不是纯白、
  还要被微信压一遍再存成 JPEG。所以生成完必须**真解码**验证，不能靠看图。
  用 zxing-cpp 解码（和手机扫描器同源的算法），python venv 里装了。

  另外最后有一段**负向测试**：故意破坏两张图，断言解码必须失败。
  「只能返回成功的检查器等于没有」—— 这一条是本项目的硬规矩。
"""
from pathlib import Path
import io
import sys
import zxingcpp
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "发布"
URL = "https://soft-life-shop.app.workbuddy.host/"

ok_n = 0
bad_n = 0


def check(label: str, cond: bool, detail: str = "") -> None:
    global ok_n, bad_n
    mark = "✅" if cond else "❌"
    if cond:
        ok_n += 1
    else:
        bad_n += 1
    print(f"  {mark} {label}" + (f"  —— {detail}" if detail else ""))


def decode(img: Image.Image):
    res = zxingcpp.read_barcodes(img)
    return [r.text for r in res], [str(r.format) for r in res]


def qr_text(img: Image.Image):
    texts, fmts = decode(img)
    qr_only = [t for t, f in zip(texts, fmts) if "QR" in f.upper()]
    return qr_only


print("【1】三张图都能解码，且解出来的正是那个链接")
files = {
    "二维码_线上链接.png": True,
    "二维码_线上链接_纯码.png": True,
    "分享卡_扫码打开.png": True,
}
imgs = {}
for name in files:
    p = OUT / name
    if not p.exists():
        check(f"{name} 存在", False, "文件不在")
        continue
    im = Image.open(p).convert("RGB")
    imgs[name] = im
    got = qr_text(im)
    check(f"{name} 解出链接", got == [URL],
          f"得到 {got[0][:60] if got else '（解不出）'}")

print("\n【2】模拟朋友的手机：缩小 + JPEG 压缩后仍要能扫")
for name, im in imgs.items():
    arg = (320, 320) if im.width == im.height else (320, round(320 * im.height / im.width))
    small = im.resize(arg, Image.LANCZOS)
    check(f"{name} 缩到 320px", qr_text(small) == [URL])

    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=55)
    jp = Image.open(buf).convert("RGB")
    check(f"{name} 走 JPEG q55", qr_text(jp) == [URL])

print("\n【3】裁掉静区边角 / 加浅灰底，仍要能扫（朋友截图常带背景）")
src = imgs["二维码_线上链接.png"]
for frac, label in [(0.04, "裁掉四周 4%"), (0.08, "裁掉四周 8%")]:
    w, h = src.size
    dx, dy = int(w * frac), int(h * frac)
    cropped = src.crop((dx, dy, w - dx, h - dy))
    check(f"{label}", qr_text(cropped) == [URL])

print("\n【4】负向测试：故意弄坏，断言必须解码失败（证明上面不是永远报绿）")
# ① 中心挖掉一大块（超过 ECC=H 的 30% 容错）
w, h = src.size
punched = src.copy()
punched.paste((246, 241, 232), (w // 2 - w // 4, h // 2 - h // 4, w // 2 + w // 4, h // 2 + h // 4))
check("中心挖掉 25% 面积 → 应该解不出", qr_text(punched) != [URL],
      f"仍解出 {len(qr_text(punched))} 个（说明这一段测不出来）")

# ② 换成一张完全无关的图（软软的猫照）—— 防「解码函数被写错成返回常量」
pet = Image.open(ROOT / "src/assets/pets/a-cream-stage2.webp").convert("RGB")
check("拿软软的猫照当输入 → 应该解不出", qr_text(pet) == [])

# ③ 全白图（最容易让写错的解码函数凭空返回点东西）
check("全白图 → 应该解不出", qr_text(Image.new("RGB", (600, 600), (255, 255, 255))) == [])

print("\n【5】加分项（不是断言，失败不算错）：它到底有多耐折腾")
flat = Image.new("RGB", src.size, (246, 241, 232))
for k in (0.5, 0.7, 0.86):
    low = Image.blend(src, flat, k)
    got = qr_text(low)
    print(f"  · 对比度压到 {round((1 - k) * 100)}%：{'仍可解' if got == [URL] else '解不出'}")
print("     ⚠️ 实测 zxing 在 14% 对比度下仍能解 —— 所以**不能**拿「低对比度」当负向测试用例，"
      "\n     它测不出「验证器会不会报错」，只会给假绿。上面【4】才是能真失败的用例。")

print(f"\n=== 通过 {ok_n} 项，失败 {bad_n} 项 ===")
sys.exit(1 if bad_n else 0)
