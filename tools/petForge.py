#!/usr/bin/env python3
# ============================================================
#  宠物形象锻造炉（Pet Forge）
#  ------------------------------------------------------------
#  把 宠物生图原始/{新形象,A,B,邻居猫}/ 里的 AI 原始生图处理成 SoftPet 的图片素材：
#    ① 裁掉底部水印（默认裁底部 6%，可 --crop-bottom 调）
#    ② **统一底色**到米色 #F6F1E8（软过渡）—— 同一批图底色不一致时不会出现深浅方块
#    ③ **自动找到角色本体**（相对纯色底的差异区域），按 220:248 重新构图
#       —— 生成图里带了货架/绿植/地板之类的道具也不会歪；识别不可信时退回居中裁
#    ④ 缩放到 720×812，转 WebP q82
#    ⑤ 输出到 src/assets/pets/{a|b}-{毛色}-stage{n}.webp
#
#  用法：
#    python3 tools/petForge.py                       # 处理 新形象 / A / B / 邻居猫
#    python3 tools/petForge.py --only 新形象         # 只处理某一个文件夹
#    python3 tools/petForge.py --only 邻居猫 --out-name neighbor   # 单张场景：不切阶段
#    python3 tools/petForge.py --colorway pink       # 指定这批图的毛色（默认 cream）
#    python3 tools/petForge.py --crop-bottom 8       # 水印高时加大裁底百分比
#    python3 tools/petForge.py --no-trim             # 关掉自动构图，按老办法居中裁
#    python3 tools/petForge.py --keep-bg             # 保留原始底色，不做统一底色
#
#  原图命名：文件名里带 stage0~stage4（或直接叫 stage2.png）；
#  实在没编号就按文件名排序依次当作 stage0~stage4。
# ============================================================

import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "宠物生图原始"
OUT_DIR = ROOT / "src" / "assets" / "pets"

# SoftPet 的 SVG 画布比例 220:248 —— 图按这个比例裁，替换 SVG 时布局不跳动
TARGET_W, TARGET_H = 720, 812
ASPECT = 220 / 248  # w/h ≈ 0.887

EXTS = {".png", ".jpg", ".jpeg", ".webp"}
# 目录名 → 输出用的画风前缀。外部工具生成的新形象直接丢「新形象」即可。
STYLE_MAP = {"新形象": "a", "A": "a", "B": "b", "邻居猫": "n"}

# 透明底图会合成到这个米色背景上（和 App 页面底色一致，不会出现白方块/黑块）
FALLBACK_BG = (246, 241, 232)

# ---- 自动构图参数 ----
TRIM_THRESHOLD = 30      # 与背景色的通道差阈值；水彩纸纹/淡影一般 <20，不会被算成主体
TRIM_MARGIN = 0.08       # 角色四周留白（相对角色高度）
MIN_SUBJECT_RATIO = 0.18  # 角色高度不足画面 18% → 判定识别不可信
MAX_SUBJECT_RATIO = 0.94  # 差异区域几乎铺满 → 判定底色不纯，识别不可信


def guess_stage(path: Path, used: set) -> int:
    """从文件名猜阶段号；猜不到就按剩余顺序补位"""
    name = path.stem
    m = re.search(r"stage[_ \-]?([0-4])", name, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r"(?:^|[^0-9])([0-4])(?:[^0-9]|$)", name)
    if m:
        return int(m.group(1))
    for i in range(5):
        if i not in used:
            return i
    return 0


def open_flat(src: Path) -> Image.Image:
    """打开图片并拍平：透明背景合成到米色底，避免转 RGB 后透明变黑"""
    img = Image.open(src)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, FALLBACK_BG + (255,))
        bg.alpha_composite(img)
        return bg.convert("RGB")
    return img.convert("RGB")


def sample_bg(img: Image.Image) -> tuple:
    """取四边中点/角点的中位数当背景色（水彩纸底常带轻微晕染，中位数比单点稳）"""
    w, h = img.size
    px = img.load()
    pts = [(2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3),
           (w // 2, 2), (w // 2, h - 3), (2, h // 2), (w - 3, h // 2)]
    vals = [px[x, y] for x, y in pts]
    return tuple(sorted(v[c] for v in vals)[len(vals) // 2] for c in range(3))


def detect_subject_bbox(img: Image.Image, bg: tuple):
    """找出相对背景色有差异的区域；先缩小再判定，抹掉纸纹单像素噪点"""
    w, h = img.size
    long_side = max(w, h)
    scale = min(1.0, 320 / long_side)
    small = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS) if scale < 1 else img
    diff = ImageChops.difference(small, Image.new("RGB", small.size, bg)).convert("L")
    mask = diff.point(lambda v: 255 if v > TRIM_THRESHOLD else 0)
    bbox = mask.getbbox()
    if not bbox:
        return None
    kx = w / small.size[0]
    ky = h / small.size[1]
    return (int(bbox[0] * kx), int(bbox[1] * ky), int(bbox[2] * kx), int(bbox[3] * ky))


def bbox_reliable(img: Image.Image, bbox: tuple) -> bool:
    w, h = img.size
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if bh < h * MIN_SUBJECT_RATIO:
        return False
    if bw * bh > w * h * MAX_SUBJECT_RATIO:
        return False
    return bw >= w * 0.05


def unify_background(img: Image.Image, bg: tuple, tol: int = 16) -> Image.Image:
    """把接近采样底色的像素软性拉到 FALLBACK_BG。

    为什么必须做：AI 一次出 5 张，每张的「米白底」都不一样（蓝通道能差 14），
    直接放进 App 会出现 5 个深浅不同的方块，而且猫咪长大时底色会「跳」一下。
    做法是软过渡不是硬抠：差值 ≤ tol 的像素按接近程度混合到 FALLBACK_BG，
    猫咪身上那些本来就接近底色的奶白毛也会一并被拉到同色 —— 正好，它就该融进米色底。
    """
    diff = ImageChops.difference(img, Image.new("RGB", img.size, bg)).convert("L")
    mask = diff.point(lambda v: 0 if v > tol else 255 - int(v * 255 / (tol + 1)))
    return Image.composite(Image.new("RGB", img.size, FALLBACK_BG), img, mask)


def crop_to_aspect(img: Image.Image, bbox: tuple, bg: tuple) -> Image.Image:
    """以 bbox 为中心，外扩留白并补到 220:248；不够就垫背景色，绝不切到角色"""
    w, h = img.size
    x0, y0, x1, y1 = bbox
    m = round((y1 - y0) * TRIM_MARGIN)
    x0, y0, x1, y1 = x0 - m, y0 - m, x1 + m, y1 + m
    bw, bh = x1 - x0, y1 - y0

    if bw / bh < ASPECT:                      # 太窄 → 左右补
        pad = (bh * ASPECT - bw) / 2
        x0, x1 = x0 - pad, x1 + pad
    else:                                     # 太扁 → 上下补
        pad = (bw / ASPECT - bh) / 2
        y0, y1 = y0 - pad, y1 + pad

    x0, y0, x1, y1 = round(x0), round(y0), round(x1), round(y1)

    # 超出画面 → 先垫背景色画布再裁（比缩小角色好看，也不会切耳朵/脚）
    # ⚠️ 垫完画布后，裁剪窗口必须跟着平移 (pl, pt)：
    #    否则窗口落在画布外，PIL 会填**纯黑**——曾导致 4/6 张图顶部出现黑边
    pl, pt = max(0, -x0), max(0, -y0)
    pr, pb = max(0, x1 - w), max(0, y1 - h)
    if pl or pt or pr or pb:
        canvas = Image.new(img.mode, (w + pl + pr, h + pt + pb), bg)
        canvas.paste(img, (pl, pt))
        img = canvas
        x0, x1 = x0 + pl, x1 + pl
        y0, y1 = y0 + pt, y1 + pt
    return img.crop((x0, y0, x1, y1))


def center_crop(img: Image.Image) -> Image.Image:
    """兜底：纯居中裁到 220:248"""
    w, h = img.size
    if w / h > ASPECT:  # 太宽 → 裁两侧
        target_w = round(h * ASPECT)
        x0 = (w - target_w) // 2
        return img.crop((x0, 0, x0 + target_w, h))
    target_h = round(w / ASPECT)  # 太高 → 裁下（保留上半）
    return img.crop((0, 0, w, min(h, target_h)))


def forge_one(src: Path, dst: Path, crop_bottom_pct: float, use_trim: bool, unify_bg: bool = True) -> str:
    img = open_flat(src)
    w, h = img.size

    # ① 裁底部水印
    cut = int(h * crop_bottom_pct / 100)
    if cut > 0:
        img = img.crop((0, 0, w, h - cut))

    # ② 统一底色（让同一批图底色完全一致、和 App 底色无缝）
    if unify_bg:
        img = unify_background(img, sample_bg(img))

    # ③ 自动构图（识别不可信则退回居中裁）
    how = "居中裁"
    bg = sample_bg(img)
    if use_trim:
        bbox = detect_subject_bbox(img, bg)
        if bbox and bbox_reliable(img, bbox):
            img = crop_to_aspect(img, bbox, bg)
            how = f"自动构图 {bbox[2] - bbox[0]}×{bbox[3] - bbox[1]}"
        else:
            img = center_crop(img)
    else:
        img = center_crop(img)

    # ④ 缩放 + WebP
    img = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    img.save(dst, "WEBP", quality=82, method=6)
    return how


def forge_style(style_dir: Path, style_key: str, colorway: str, crop_bottom_pct: float,
                use_trim: bool, unify_bg: bool = True, out_name: str = None) -> list:
    if not style_dir.exists():
        return []
    files = sorted(p for p in style_dir.iterdir() if p.suffix.lower() in EXTS and not p.name.startswith("."))
    if not files:
        return []

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    used, report = set(), []
    for f in files:
        if out_name:
            # 单张场景（比如「邻居猫」）：不切阶段，直接输出 <out_name>.webp
            dst = OUT_DIR / f"{out_name}.webp"
            how = forge_one(f, dst, crop_bottom_pct, use_trim, unify_bg)
            report.append(f"  {style_dir.name}/{f.name} → {dst.name}（{how}，{dst.stat().st_size / 1024:.0f}KB）")
            continue
        stage = guess_stage(f, used)
        if stage in used:
            print(f"  ⚠️ {style_dir.name}/{f.name} 的阶段 {stage} 重复，跳过")
            continue
        used.add(stage)
        dst = OUT_DIR / f"{style_key}-{colorway}-stage{stage}.webp"
        how = forge_one(f, dst, crop_bottom_pct, use_trim, unify_bg)
        size_kb = dst.stat().st_size / 1024
        report.append(f"  {style_dir.name}/{f.name} → {dst.name}（stage{stage}，{how}，{size_kb:.0f}KB）")
    return report


def main() -> None:
    ap = argparse.ArgumentParser(description="宠物形象图锻造：原始 AI 生图 → SoftPet 素材")
    ap.add_argument("--colorway", default="cream", choices=["cream", "pink", "blue"], help="这批图的毛色（默认 cream）")
    ap.add_argument("--crop-bottom", type=float, default=6.0, help="裁掉底部水印的百分比（默认 6）")
    ap.add_argument("--no-trim", action="store_true", help="关掉自动构图，退回居中裁")
    ap.add_argument("--only", default=None, help="只处理某个文件夹（新形象 / A / B / 邻居猫）")
    ap.add_argument("--keep-bg", action="store_true", help="保留原始底色，不做统一底色处理")
    ap.add_argument("--out-name", default=None, help="配合 --only：不切阶段，直接输出成 <名字>.webp（单张场景用）")
    args = ap.parse_args()

    if not RAW_DIR.exists():
        print(f"找不到 {RAW_DIR}，请先把原始生图放进 宠物生图原始/新形象")
        sys.exit(1)

    targets = {args.only: STYLE_MAP.get(args.only, "a")} if args.only else STYLE_MAP
    if args.only and args.only not in STYLE_MAP:
        print(f"⚠️ 未知文件夹「{args.only}」，按 a 前缀输出")

    total = 0
    for dir_name, style_key in targets.items():
        report = forge_style(RAW_DIR / dir_name, style_key, args.colorway, args.crop_bottom,
                             not args.no_trim, not args.keep_bg, args.out_name)
        for line in report:
            print(line)
        total += len(report)

    if total == 0:
        print("没有可处理的图片 —— 先按 宠物形象生图prompt.md 生成图片放进 宠物生图原始/新形象/")
    else:
        print(f"\n完成，共 {total} 张 → src/assets/pets/。跑 npm run build 即可在 App 里看到新形象。")


if __name__ == "__main__":
    main()
