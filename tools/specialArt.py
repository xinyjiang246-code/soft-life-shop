"""特调 / 城市图：从生图原始 PNG 裁掉工具水印，压成 webp，并断言水印真的没了。

用法：
    P=/Users/s/.workbuddy/binaries/python/envs/default/bin/python
    $P tools/specialArt.py "特调生图原始/xxx-real.png" osmanthus-cold-brew real
    $P tools/specialArt.py --selftest        # 验证检查器本身能不能报红

—— 为什么要裁 ——
生图工具固定在右下角打一个水印（「AI生成 / WORKBUDDY.」），2026-09-20 实测在
1536×1024 的产物上落在 x 1414–1526、y 964–1014，距右/下边各约 10px。
那个角落是一片干净的桌面，所以**只裁掉右边 150px** 就整块去掉，杯子一点不碰。
🔴 裁完必须断言水印真的没了 —— 但**不能用「亮度」判**：水印最亮只有 189，
   比冰块高光（255）暗得多，用亮度会去抓冰块；而**油画棒那张的颜料颗粒本身
   就在右下角产生 4550 个高频像素**，用「局部高频计数」会假绿（两个都实测过）。
   唯一分得开的是**模板匹配**：拿水印字形当模板做归一化互相关，实测
   有水 1.000 / 0.705，无水 0.042 / 0.052 —— 差一个数量级，阈值取 0.35。
   模板文件：tools/watermark-template.png（126×62，水印所在那块的灰度裁片）。

⚠️ 别为了去水印去裁下边：杯子底部和投影就在那儿。
⚠️ 也别改成左右对称裁：会把左边的窗光裁掉一截，还可能把窗框裁断。
"""
import sys
from pathlib import Path

from PIL import Image, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CROP_RIGHT = 150          # 右边裁掉的像素（水印实测占 122px，留 28px 余量）
TARGET_W = 1024           # 与现有 src/assets/products/*.webp 同宽
QUALITY = 82
WM_TEMPLATE = ROOT / "tools/watermark-template.png"
WM_THRESHOLD = 0.35       # 实测：有水 ≥0.70，无水 ≤0.06
WM_MARGIN = 8             # 模板相对右/下边留的边距（与取样时一致）
WM_RADIUS = 10            # 允许 ±10px 的位移

_LUM = np.array([0.299, 0.587, 0.114])
_tmpl_cache = None


def luminance(im: Image.Image) -> np.ndarray:
    return np.asarray(im.convert("RGB")).astype(np.float32) @ _LUM


def _highpass(a: np.ndarray) -> np.ndarray:
    """减掉 3px 方框模糊 —— 只留笔画这种高频结构，去掉桌面的明暗渐变。"""
    blur = np.asarray(
        Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.BoxBlur(3))
    ).astype(np.float32)
    return a - blur


def _template() -> np.ndarray:
    """水印字形模板：高通 + 把背景纹理清零，只留笔画。"""
    global _tmpl_cache
    if _tmpl_cache is None:
        t = _highpass(luminance(Image.open(WM_TEMPLATE)))
        t[np.abs(t) <= 8] = 0.0          # 弱纹理（颜料颗粒/桌面噪点）直接抹掉
        t = t - t.mean()
        _tmpl_cache = t / (t.std() + 1e-6)
    return _tmpl_cache


def watermark_score(a: np.ndarray, rad: int = WM_RADIUS) -> float:
    """右下角（贴右/下边）与水印字形的最大归一化互相关。"""
    t = _template()
    th, tw = t.shape
    h, w = a.shape
    if h < th + 2 * rad or w < tw + 2 * rad:
        return 0.0
    cx, cy = w - tw - WM_MARGIN, h - th - WM_MARGIN
    best = 0.0
    for dy in range(-rad, rad + 1):
        for dx in range(-rad, rad + 1):
            y, x = cy + dy, cx + dx
            if y < 0 or x < 0 or y + th > h or x + tw > w:
                continue
            p = _highpass(a[y:y + th, x:x + tw])
            p = p - p.mean()
            s = p.std()
            if s < 1e-3:
                continue
            best = max(best, float((t * (p / s)).mean()))
    return best


def process(raw: Path, slug: str, kind: str, out_dir: Path) -> Path:
    im = Image.open(raw).convert("RGB")
    W, H = im.size
    if W < 900 or H < 600:
        sys.exit(f"❌ 原始图太小（{W}×{H}），不像生图产物：{raw}")

    before = watermark_score(luminance(im))
    if before < WM_THRESHOLD:
        print(f"  ⚠️ 原始图里没检出预期位置的水印（得分 {before:.3f}）—— 工具可能换了水印位置，"
              f"下面的裁剪是否还够要重新确认。")

    cropped = im.crop((0, 0, W - CROP_RIGHT, H))
    after = watermark_score(luminance(cropped))
    if after >= WM_THRESHOLD:
        sys.exit(
            f"❌ 裁掉右边 {CROP_RIGHT}px 后仍检出 {after:.3f} 的水印（裁之前 {before:.3f}）"
            f"—— 没去干净，别往下走。"
        )

    out = cropped.resize(
        (TARGET_W, round(cropped.height * TARGET_W / cropped.width)), Image.LANCZOS
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    # kind 传空串 = 文件名就是 `<slug>.webp`（世界菜单那 122 张用这个，
    # 因为它们的 slug 本身已经含了城市和食材，再加后缀反而冗余）。
    dst = out_dir / (f"{slug}-{kind}.webp" if kind else f"{slug}.webp")
    out.save(dst, "WEBP", quality=QUALITY, method=6)

    check = watermark_score(luminance(Image.open(dst)))
    if check >= WM_THRESHOLD:
        sys.exit(f"❌ 成品 {dst.name} 里仍检出 {check:.3f} 的水印")

    print(
        f"  {dst.name:44s} {cropped.width}×{cropped.height} → {out.width}×{out.height}"
        f"  {dst.stat().st_size / 1024:6.0f}KB   水印分 {before:.3f} → {check:.3f}"
    )
    return dst


def selftest() -> int:
    """检查器必须能报红：阳性（有水印）要 ≥ 阈值，阴性（裁过）要 < 阈值。"""
    print("=== 水印检查器自检 ===")
    fails = []

    def expect(name, score, should_have):
        ok = (score >= WM_THRESHOLD) if should_have else (score < WM_THRESHOLD)
        print(f"  {'✅' if ok else '❌'} {name:34s} 得分 {score:+.3f}  "
              f"（{'应有' if should_have else '应无'}水印）")
        if not ok:
            fails.append(name)

    raws = sorted((ROOT / "特调生图原始").glob("*.png"))
    if not raws:
        sys.exit("❌ 特调生图原始/ 里没有原始图，没法自检")

    for raw in raws:
        im = Image.open(raw).convert("RGB")
        expect(f"{raw.name}（原图，应有）", watermark_score(luminance(im)), True)
        cropped = im.crop((0, 0, im.width - CROP_RIGHT, im.height))
        expect(f"{raw.name}（裁后，应无）", watermark_score(luminance(cropped)), False)

        # 合成阳性对照：把水印原样贴回裁后图的预期位置，必须重新报红
        src = np.asarray(im)
        th, tw = _template().shape
        bi = np.asarray(cropped).copy()
        bi[bi.shape[0] - th - WM_MARGIN:bi.shape[0] - WM_MARGIN,
           bi.shape[1] - tw - WM_MARGIN:bi.shape[1] - WM_MARGIN] = \
            src[im.height - th - WM_MARGIN:im.height - WM_MARGIN,
                im.width - tw - WM_MARGIN:im.width - WM_MARGIN]
        expect(f"{raw.name}（合成贴回，应报红）",
               watermark_score(luminance(Image.fromarray(bi))), True)

    print()
    if fails:
        print(f"❌ 自检失败 {len(fails)} 项：{fails}")
        return 1
    print("✅ 自检通过：有水印时报红、无水印时不报")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())

    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 3:
        sys.exit(__doc__)
    out_dir = ROOT / "src/assets/specials"
    if "--out-dir" in sys.argv:
        out_dir = Path(sys.argv[sys.argv.index("--out-dir") + 1])
    process(Path(args[0]), args[1], args[2], out_dir)
