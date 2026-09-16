#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
量出软软每张图里「眼睛 / 鼻子」的位置（归一化 0~1），并画一张标记图供肉眼复核。

为什么要量：
  图片模式下五官是**画死在图里的**，要让「表情能变」只能在图之上盖一层
  （盖掉原来的眼睛、换成闭眼 ⌒ / 爱心眼 / 星星眼…）。盖的位置差一点就露馅，
  而五个阶段的头在画面里各不相同（stage0 是趴着的胖崽、stage3 是坐姿 3/4 侧脸），
  所以**不能只写死一套坐标**。

量法（试错记录见下）：
  ⚠️ 别用「腐蚀掉细线、留下实心块」那招 —— 眼睛是**带白高光的环**，
  腐蚀 7px 会把它整个吃掉，五个阶段全部量不到。
  正确做法：直接在暗像素上取连通域，按**形状**筛：
    眼睛 = 面积 > 300、填充率 > .5、宽高比 .5~1.3、最长边 < 70px（轮廓是上千像素的大块，胡须是细长条）
    鼻子 = 两眼连线下方那块小团（面积 > 40），再按「距两眼中点最近」挑

  ⚠️ **2026-09-17 更正：那个点量到的是「鼻子」，不是「鼻子嘴」**。
  软软这张脸**本来就没有嘴**（鼻子下面只有水彩纸纹，放大 7 倍确认过）。
  早先把字段叫 `mouth` 是量错了名字，已正名为 `nose`。
  为什么这事重要：没有嘴的猫，七个表情共用同一张下半脸 —— **嘴才是补全表情的那一块**。
  `components/PetFace.jsx` 现在按 `nose` 推算出嘴的位置（鼻子下方、跟着 tilt 转）。

输出：
  src/petFace.js                  —— 每阶段的 eyeL / eyeR / eyeW / eyeH / nose / gap / tilt
  预览截图/软软_脸部锚点_复核.png —— 把量到的点画回原图（**必须人眼看一次**）

用法：/Users/s/.workbuddy/binaries/python/envs/default/bin/python tools/petFace.py
      （这个脚本要 numpy，只有 envs/default 里那个解释器装了；系统 python3 会 ImportError）
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PETS = os.path.join(ROOT, 'src', 'assets', 'pets')
OUT_JS = os.path.join(ROOT, 'src', 'petFace.js')
OUT_PNG = os.path.join(ROOT, '预览截图', '软软_脸部锚点_复核.png')

DARK = 128      # 暗像素阈值（眼珠 #5E4030 亮度约 70；轮廓 #8A5638 约 105）


def components(mask, min_area=20):
    """4 邻域连通域 —— 返回 [(area, x0, y0, w, h, cx, cy, fill)]"""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys, xs):
        if seen[sy, sx]:
            continue
        q = deque([(int(sy), int(sx))])
        seen[sy, sx] = True
        pix = []
        while q:
            cy, cx = q.popleft()
            pix.append((cy, cx))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if len(pix) < min_area:
            continue
        arr = np.array(pix)
        y0, x0 = arr.min(axis=0)
        y1, x1 = arr.max(axis=0)
        cw, ch = int(x1 - x0 + 1), int(y1 - y0 + 1)
        out.append((len(pix), int(x0), int(y0), cw, ch,
                    float(arr[:, 1].mean()), float(arr[:, 0].mean()),
                    len(pix) / (cw * ch)))
    out.sort(key=lambda b: -b[0])      # ⚠️ 必须排序：下面的「轮廓 = 最大块」靠它
    return out


def analyse(path):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.int16)
    h, w = a.shape[:2]
    lum = 0.299 * a[:, :, 0] + 0.587 * a[:, :, 1] + 0.114 * a[:, :, 2]
    dark = (lum < DARK) & (a[:, :, 3] > 128)
    dark[int(h * 0.62):, :] = False          # 只留头部大致范围，避开身子/尾巴的墨点

    blobs = components(dark, min_area=20)

    # ---- 眼睛：形状筛 ----
    # ⚠️ 宽高比要放到 2.2 —— stage0 是趴着的胖崽，眼睛是**半眯的扁缝**（63x35，比 1.8），
    #    卡在 1.35 会整个阶段漏掉（这就是第一版只有 4/5 阶段的原因）。
    #    轮廓/胡须靠「填充率 < .45」和「最长边 < 70px」挡掉，不靠宽高比。
    eyes = []
    for b in blobs:
        area, x0, y0, cw, ch, cx, cy, fill = b
        if area < 300 or fill < 0.45:
            continue
        if not (0.45 <= cw / ch <= 2.2):
            continue
        if max(cw, ch) > 70:
            continue
        eyes.append(b)
    eyes.sort(key=lambda b: -b[0])
    if len(eyes) < 2:
        return None
    eyes = eyes[:2]

    # ---- 鼻子：两眼连线下方窗口里那块小团（排除两只眼睛本身）----
    eye_ids = {id(b) for b in eyes}
    (_, _, _, lw, lh, lx, ly, _), (_, _, _, rw, rh, rx, ry, _) = eyes
    gap = abs(rx - lx)
    size = max(lw, lh)
    wy0 = int(max(ly, ry) - size * 0.35)
    wy1 = int(max(ly, ry) + gap * 0.95)
    wx0 = int(min(lx, rx) - lw * 1.1)
    wx1 = int(max(lx, rx) + rw * 1.1)
    cand = [b for b in blobs
            if id(b) not in eye_ids
            and b[0] >= 40
            and wx0 <= b[5] <= wx1 and wy0 <= b[6] <= wy1
            and max(b[3], b[4]) < gap * 0.55]
    mx = my = None
    if cand:
        ecx, ecy = (lx + rx) / 2, (ly + ry) / 2
        cand.sort(key=lambda b: (b[5] - ecx) ** 2 + (b[6] - ecy) ** 2)
        mx, my = cand[0][5], cand[0][6]

    eyes.sort(key=lambda b: b[5])            # 按 x 排：左眼在前
    (_, _, _, lw, lh, lx, ly, _), (_, _, _, rw, rh, rx, ry, _) = eyes
    eye_dx, eye_dy = rx - lx, ry - ly
    ang = np.degrees(np.arctan2(eye_dy, eye_dx))

    # ---- 取色：覆盖用的毛色 / 描边用的墨色 / 眼珠色 ----
    # 表情层是盖在画上的，颜色差一点就会「一眼假」——所以直接从原图里取，
    # 不要手写十六进制（水彩扫描图的棕不是标准色）。
    # ⚠️ 别按「连通域外接框取均值」：轮廓块的外接框里绝大部分是毛，一平均就冲成灰。
    # ⚠️ 取毛色的环带要用**椭圆**距离 —— 眼睛是 44x58 的竖椭圆，
    #    按圆的半径去套，环带会切进眼睛本体，采到的是眼珠的黑。
    opaque = a[:, :, 3] > 200
    ink_sel = opaque & (lum <= np.percentile(lum[opaque], 10))   # 笔画最实的芯
    ink = tuple(int(v) for v in a[:, :, :3][ink_sel].mean(axis=0))

    hh, ww = dark.shape
    yy, xx = np.mgrid[0:hh, 0:ww]

    def local_fur(ex, ey, ew, eh):
        dx = (xx - ex) / max(1e-6, ew / 2)
        dy = (yy - ey) / max(1e-6, eh / 2)
        d = np.sqrt(dx * dx + dy * dy)
        band = opaque & (d > 1.02) & (d < 1.75)
        l = lum[band]
        if l.size == 0:
            return [255, 255, 255]
        # 只取环带里**最亮的那一半**：那才是纯毛，另一半混着洗脸线和晕染
        cut = np.percentile(l, 60)
        sel = band & (lum >= cut)
        px = a[:, :, :3][sel]
        return [int(round(v)) for v in np.median(px, axis=0)]

    furL = local_fur(lx, ly, lw, lh)
    furR = local_fur(rx, ry, rw, rh)

    # 眼珠色：眼睛椭圆内部（d<0.8）的暗像素
    def eye_core(ex, ey, ew, eh):
        dx = (xx - ex) / max(1e-6, ew / 2)
        dy = (yy - ey) / max(1e-6, eh / 2)
        sel = opaque & (np.sqrt(dx * dx + dy * dy) < 0.8) & (lum < 120)
        if not sel.any():
            return [int(v) for v in ink]
        return [int(round(v)) for v in a[:, :, :3][sel].mean(axis=0)]

    eye_ink = eye_core(lx, ly, lw, lh)

    return {
        'stage': None,
        'eye': [[lx / w, ly / h], [rx / w, ry / h]],
        'eyeW': (lw + rw) / 2 / w,
        'eyeH': (lh + rh) / 2 / h,
        'nose': [mx / w, my / h] if mx is not None else [(lx + rx) / 2 / w, (ly + ry) / 2 / h + 0.02],
        'gap': gap / w,
        'tilt': float(ang),
        'size': [w, h],
        'ink': list(ink), 'eyeInk': eye_ink, 'furL': furL, 'furR': furR,
        '_px': dict(eyes=[(lx, ly, lw, lh), (rx, ry, rw, rh)],
                    nose=(mx, my) if mx is not None else None),
    }


def make_noeye(path, eyes_px, out_path, grow=1.30):
    """生成「没有眼睛」的底图，供表情层往上画。

    为什么不用纯色盖、也不用扩散填充（两个都试过，都失败）：
      · 纯色盖：眼睛周围是**水彩晕染**，同一张脸左边偏白（255,255,255）、右边偏灰
        （182,173,162），拿任何一个纯色去盖都会有一半对不上。
      · 扩散填充：把边界的灰晕一起推进来，眼睛位置留两块**明显的灰斑**（已实测，见
        `预览截图/软软_无眼底图_复核.png` 的第一版）。
    最终做法：**形态学最大值（膨胀）** —— 取邻域里最亮的像素。
      深色的眼睛与描边天然被排除，填出来就是周围的毛色；再高斯模糊去掉硬边，
      最后按椭圆距离羽化，和原图软过渡，不会留痕。
    """
    base = Image.open(path).convert('RGBA')
    w, h = base.size
    # 先合成到近白底上：否则透明区的 RGB 会污染最小值/最大值
    flat = Image.new('RGBA', base.size, (252, 250, 245, 255))
    flat.alpha_composite(base)
    rgb = flat.convert('RGB')

    (lx, ly, lw, lh), (rx, ry, rw, rh) = eyes_px[:2]
    radius = int(max(lw, lh, rw, rh) * 0.75)
    bg = rgb
    for _ in range(max(1, radius)):                 # 逐次 3x3 最大值膨胀 = 半径 radius 的膨胀
        bg = bg.filter(ImageFilter.MaxFilter(3))
    bg = bg.filter(ImageFilter.GaussianBlur(max(2.0, radius * 0.55)))

    # 羽化：椭圆内 alpha=1，到 grow*1.35 处降到 0
    yy, xx = np.mgrid[0:h, 0:w]
    alpha = np.zeros((h, w), dtype=np.float64)
    for (ex, ey, ew, eh) in eyes_px[:2]:
        dx = (xx - ex) / (ew * grow / 2)
        dy = (yy - ey) / (eh * grow / 2)
        d = np.sqrt(dx * dx + dy * dy)
        a1 = np.clip((1.35 - d) / 0.35, 0, 1)        # d<=1 全实，d>=1.35 全透明
        alpha = np.maximum(alpha, a1)
    alpha = np.clip(alpha, 0, 1)[:, :, None]

    src = np.asarray(flat).astype(np.float64)
    fil = np.asarray(bg.convert('RGBA')).astype(np.float64)
    out = src.copy()
    out[:, :, :3] = src[:, :, :3] * (1 - alpha) + fil[:, :, :3] * alpha

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA').save(
        out_path, 'WEBP', quality=88, method=6)
    return out_path


def main():
    stages = []
    for i in range(5):
        p = os.path.join(PETS, f'a-cream-stage{i}-t.webp')
        if not os.path.exists(p):
            continue
        r = analyse(p)
        if not r:
            print(f'stage{i}: ⚠️ 没量到眼睛，跳过', file=sys.stderr)
            continue
        r['stage'] = i
        stages.append(r)
        # 顺手产出「无眼底图」：表情画在它上面，就不用去盖原来的眼睛了
        noeye = os.path.join(PETS, 'noeye', f'a-cream-stage{i}-t.webp')
        made = make_noeye(p, r['_px']['eyes'], noeye)
        if made:
            print(f"stage{i} 无眼底图 → {os.path.relpath(made, ROOT)} "
                  f"({os.path.getsize(made) // 1024}KB)")
        e = r['_px']['eyes']
        m = r['_px']['nose']
        print(f"stage{i}: 眼 ({e[0][0]:.0f},{e[0][1]:.0f}) ({e[1][0]:.0f},{e[1][1]:.0f}) "
              f"尺寸 {e[0][2]}x{e[0][3]} · 鼻 {m} · 倾斜 {r['tilt']:.1f}°")
        print(f"        归一化 eyeL=[{r['eye'][0][0]:.4f}, {r['eye'][0][1]:.4f}] "
              f"eyeR=[{r['eye'][1][0]:.4f}, {r['eye'][1][1]:.4f}] "
              f"nose=[{r['nose'][0]:.4f}, {r['nose'][1]:.4f}] gap={r['gap']:.4f}")

    if not stages:
        sys.exit('一个阶段都没量到，先查阈值/形状条件')

    # ---- 复核图：**放大脸部**再把量到的点画回去 ----
    # 缩略图上圈偏个几像素根本看不出来（第一版就是因此差点蒙混过关），
    # 所以这里按「两眼外扩一个眼距」裁出脸部，放大到 300px 宽再画标记。
    ZW = 300
    crops = []
    for r in stages:
        im = Image.open(os.path.join(PETS, f"a-cream-stage{r['stage']}-t.webp")).convert('RGBA')
        bg = Image.new('RGBA', im.size, (250, 248, 242, 255))
        bg.alpha_composite(im)
        im = bg.convert('RGB')
        (lx, ly, lw, lh), (rx, ry, rw, rh) = r['_px']['eyes']
        gap = abs(rx - lx)
        cz = max(lw, lh) * 1.6
        x0 = int(min(lx, rx) - cz)
        x1 = int(max(lx, rx) + cz)
        y0 = int(min(ly, ry) - cz)
        y1 = int(max(ly, ry) + cz)
        pad = Image.new('RGB', (x1 - x0, y1 - y0), (250, 248, 242))
        pad.paste(im.crop((x0, y0, x1, y1)), (0, 0))
        k = ZW / pad.size[0]
        z = pad.resize((ZW, int(pad.size[1] * k)))
        d = ImageDraw.Draw(z)
        for (ex, ey, ew, eh), col in (((lx, ly, lw, lh), (214, 62, 62)), ((rx, ry, rw, rh), (58, 108, 214))):
            d.ellipse([(ex - x0 - ew / 2 - 3) * k, (ey - y0 - eh / 2 - 3) * k,
                       (ex - x0 + ew / 2 + 3) * k, (ey - y0 + eh / 2 + 3) * k], outline=col, width=2)
        d.line([(lx - x0) * k, (ly - y0) * k, (rx - x0) * k, (ry - y0) * k], fill=(110, 190, 110), width=2)
        mx, my = r['_px']['nose']
        d.rectangle([(mx - x0 - 14) * k, (my - y0 - 14) * k, (mx - x0 + 14) * k, (my - y0 + 14) * k],
                    outline=(226, 146, 20), width=2)
        d.rectangle([0, 0, ZW - 1, z.size[1] - 1], outline=(200, 196, 186))
        d.text((5, 4), f"stage{r['stage']}", fill=(40, 36, 30))
        crops.append(z)
    H = max(c.size[1] for c in crops) + 16
    sheet = Image.new('RGB', (ZW * len(crops), H), (250, 248, 242))
    for k, c in enumerate(crops):
        sheet.paste(c, (ZW * k, 16))
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    sheet.save(OUT_PNG)
    print('\n复核图 →', OUT_PNG, '（**打开看一眼**: 红/蓝圈要套住两只眼睛，橙框要框住鼻子）')

    # ---- 无眼底图复核：原图 | 抹掉眼睛后 ----
    rows = len(stages)
    CW, CH = 250, 282
    sheet2 = Image.new('RGB', (CW * 2, (CH + 18) * rows), (250, 248, 242))
    for k, r in enumerate(stages):
        for j, (src, tag) in enumerate((
            (os.path.join(PETS, f"a-cream-stage{r['stage']}-t.webp"), '原图'),
            (os.path.join(PETS, 'noeye', f"a-cream-stage{r['stage']}-t.webp"), '抹掉眼睛'),
        )):
            if not os.path.exists(src):
                continue
            im = Image.open(src).convert('RGBA')
            bg = Image.new('RGBA', im.size, (250, 248, 242, 255))
            bg.alpha_composite(im)
            im = bg.convert('RGB').resize((CW, CH))
            d = ImageDraw.Draw(im)
            d.rectangle([0, 0, CW - 1, CH - 1], outline=(210, 206, 196))
            d.text((5, 3), f"stage{r['stage']} · {tag}", fill=(40, 36, 30))
            sheet2.paste(im, (CW * j, (CH + 18) * k + 18))
    p2 = os.path.join(ROOT, '预览截图', '软软_无眼底图_复核.png')
    sheet2.save(p2)
    print('无眼底图复核 →', p2, '（**必须看**: 眼睛那儿不能有灰团/糊块，要像本来就没画眼睛）')

    # ---- 墨色 / 眼珠色：各阶段取平均（同一套素材，差异只是扫描噪声） ----
    def avg(key):
        v = np.array([r[key] for r in stages], dtype=float).mean(axis=0)
        return [int(round(x)) for x in v]

    ink, eye_ink = avg('ink'), avg('eyeInk')
    print(f"\n取色：墨 {tuple(ink)} · 眼珠 {tuple(eye_ink)}")
    for r in stages:
        print(f"  stage{r['stage']} 覆盖底色 左 {tuple(r['furL'])} 右 {tuple(r['furR'])}")

    def hexs(c):
        return '#%02X%02X%02X' % tuple(c)

    # ---- 写 JS 锚点表 ----
    L = [
        "// 软软的脸部锚点与取色（**自动量出来的，别手改**）",
        "//",
        "// 图片模式下五官是画死在图里的，要让「表情能变」只能在其上盖一层。",
        "// 五个阶段的头在画面里各不相同，所以坐标逐阶段单独量。",
        "//",
        "// 生成：/Users/s/.workbuddy/binaries/python/envs/default/bin/python tools/petFace.py",
        "//       （要 numpy，只有这个解释器装了；同时输出 预览截图/软软_脸部锚点_复核.png",
        "//         —— 改了素材务必重跑并人眼复核）",
        "//",
        "// 坐标一律是**相对整张图的 0~1 归一化值**。容器宽高比 220:248 与素材 720:812 几乎一致，",
        "// 且 .pet-photo img 是 object-fit: cover，所以直接乘容器尺寸即可，不需要额外换算。",
        "// tilt = 两眼连线的倾角（度）。侧脸图两只眼睛不在一条水平线上，",
        "// 表情元素要按这个角度跟着转，否则会像贴歪的贴纸。",
        "// nose = 鼻子的中心（**不是嘴** —— 软软这张脸本来就没有嘴，鼻子下面是水彩纸纹）。",
        "// 嘴的位置由 PetFace.jsx 从 nose 推算（鼻子下方、跟着 tilt 转）。",
        "// furL/furR = 各自眼睛周围那一圈的毛色，盖眼睛时用它当底色（左右分开取，别用一个值）。",
        "",
        "export const FACE_ANCHORS = {",
    ]
    for r in stages:
        m = r['nose']
        L.append(f"  {r['stage']}: {{")
        L.append(f"    eyeL: [{r['eye'][0][0]:.4f}, {r['eye'][0][1]:.4f}],")
        L.append(f"    eyeR: [{r['eye'][1][0]:.4f}, {r['eye'][1][1]:.4f}],")
        L.append(f"    eyeW: {r['eyeW']:.4f}, eyeH: {r['eyeH']:.4f},")
        L.append(f"    nose: [{m[0]:.4f}, {m[1]:.4f}],")
        L.append(f"    gap: {r['gap']:.4f}, tilt: {r['tilt']:.1f},")
        L.append(f"    furL: '{hexs(r['furL'])}', furR: '{hexs(r['furR'])}',")
        L.append("  },")
    L += [
        "}",
        "",
        "// 从原图里取的平均色（**别改成手写色值**：水彩扫描图的棕不是标准色，差一点就露馅）",
        f"export const FACE_INK = '{hexs(ink)}'        // 轮廓墨色",
        f"export const FACE_EYE = '{hexs(eye_ink)}'        // 眼珠色",
        "",
        "/** 取某阶段的锚点；没有该阶段就退到最近的已知阶段 */",
        "export function faceAnchor(stage = 0) {",
        "  const keys = Object.keys(FACE_ANCHORS).map(Number)",
        "  if (keys.includes(stage)) return FACE_ANCHORS[stage]",
        "  return FACE_ANCHORS[keys.reduce((a, b) => (Math.abs(b - stage) < Math.abs(a - stage) ? b : a), keys[0])]",
        "}",
        "",
    ]
    with open(OUT_JS, 'w', encoding='utf-8') as f:
        f.write('\n'.join(L))
    print('锚点 →', OUT_JS, f'（{len(stages)} 个阶段）')


if __name__ == '__main__':
    main()
