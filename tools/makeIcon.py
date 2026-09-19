#!/usr/bin/env python3
"""把软软的头像裁成站点图标 / 主屏幕图标。

用法：/Users/s/.workbuddy/binaries/python/envs/default/bin/python tools/makeIcon.py

为什么这么做（别改成整只猫）：
  整只猫缩到 32×32 只剩一团；头（含两只耳朵）是唯一在小尺寸下还认得出的形状。
  底图本身就是奶油纸色，所以直接按边缘取色铺满画布，不描边、不切圆角
  （iOS / Android 各自会自己切外层遮罩，我们再切一层会露白边）。
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src/assets/pets/a-cream-stage2.webp"   # stage2：正脸、耳朵完整
OUT = ROOT / "public"

# 头部方框（在 720×812 原图上的像素坐标，手动量的）
HEAD_BOX = (185, 2, 655, 472)

SIZES = {
    "favicon.png": 64,
    "apple-touch-icon.png": 180,
    "icon-192.png": 192,
    "icon-512.png": 512,
}


def main() -> None:
    # ⚠️ 用 exists() 判断，别写 mkdir(exist_ok=True)：沙箱会把已存在的目录
    # 报成 PermissionError: EEXIST，脚本第二次跑就挂。
    if not OUT.exists():
        OUT.mkdir()
    src = Image.open(SRC).convert("RGB")

    # 用原图左下角的纸色当画布底色，和素材无缝衔接
    paper = src.getpixel((4, src.height - 4))

    head = src.crop(HEAD_BOX)
    side = max(head.size)
    square = Image.new("RGB", (side, side), paper)
    square.paste(head, ((side - head.width) // 2, (side - head.height) // 2))

    for name, size in SIZES.items():
        square.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
        print(f"  {name}  {size}×{size}  bg={paper}")

    # maskable：Android 会把图标裁进圆/圆角遮罩，内容得落在中间约 80% 内，
    # 否则软软的耳朵会被切掉。所以这一张把头像缩到 76% 再居中。
    inner = round(512 * 0.76)
    maskable = Image.new("RGB", (512, 512), paper)
    maskable.paste(square.resize((inner, inner), Image.LANCZOS), ((512 - inner) // 2,) * 2)
    maskable.save(OUT / "icon-maskable-512.png", optimize=True)
    print(f"  icon-maskable-512.png  512×512（内容 76%）")

    print("icon written to", OUT)


if __name__ == "__main__":
    main()
