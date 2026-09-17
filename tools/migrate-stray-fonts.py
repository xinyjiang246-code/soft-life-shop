#!/usr/bin/env python3
# 一次性迁移脚本：styles.css 里遗留的旧字体名（Quicksand / Nunito / Cormorant Garamond）
# 按选择器逐个归到字型角色变量上。
#
# 为什么不能无脑 replace-all：
#   ① 这些不是同一种东西 —— 8~10px 的大写标签该进 mono，16px 的中文段落该进 cn-serif，
#      ¥ 价格该进 serif。全都塞进一个变量等于没分层。
#   ② 其中 8 处是**带反斜杠的**（`\"Quicksand\"`），是之前批量替换脚本把转义写进了文件。
#      在 CSS 里 `\"` 是一个「标识符里的引号字符」，跟字体名 "Quicksand" 并不相等 →
#      整条 font 声明的 family 匹配失败，回退到 `system-ui` / `serif`。
#      所以这几处不是「没统一」，是**根本没生效**，渲染成了另一支字。
import re
import sys

PATH = 'src/styles.css'

# 按选择器路由：mono=微标签声部 / body=正文 / cn-serif=宋体长句 / serif=衬线数字
ROUTE = {
    'pet-says-eyebrow': 'mono', 'pet-says-foot': 'mono', 'pet-says-refresh': 'mono',
    'ai-section-tag': 'mono', 'ai-section-sub': 'mono',
    'ai-palette-chip span': 'mono', 'ai-palette-caption': 'mono',
    'special-day': 'mono', 'special-en': 'mono', 'special-badge': 'mono',
    'myshop-code': 'mono', 'myshop-en': 'mono', 'myshop-foot span': 'mono',
    'flip-tag': 'mono', 'shop-cover-badge': 'mono',
    'pet-says-line': 'cn-serif', 'ai-note': 'cn-serif',
    'special-price': 'serif',
    'analyzing-head': 'body', 'draft-badge': 'body', 'draft-palette-caption': 'body',
    'draft-field > span': 'body', 'ai-recommendation-info em': 'body',
    'pet-color-name': 'body', 'chip': 'body',
}
LEGACY = r'(?:\\?"(?:Quicksand|Nunito|Cormorant Garamond)[^;]*)'

lines = open(PATH, encoding='utf-8').read().split('\n')
selector = '?'
done, missed = [], []

for i, raw in enumerate(lines):
    if '{' in raw and ':' not in raw.split('{')[0].strip() and not raw.strip().startswith('@'):
        selector = raw.split('{')[0].strip()
    if not re.search(LEGACY, raw):
        continue
    role = ROUTE.get(selector.lstrip('.'))
    if not role:
        missed.append((i + 1, selector, raw.strip()))
        continue
    m = re.match(r'(\s*font:\s*)(.*?)' + LEGACY + r'(\s*;)', raw)
    if not m:
        missed.append((i + 1, selector, raw.strip()))
        continue
    lines[i] = f'{m.group(1)}{m.group(2)}var(--f-{role}){m.group(3)}'
    done.append((i + 1, selector, role))

if missed:
    print('!! 没有路由到的行（脚本拒绝瞎猜，请人工处理）：')
    for ln, sel, txt in missed:
        print(f'   {ln}  {sel}  ::  {txt}')
    sys.exit(1)

open(PATH, 'w', encoding='utf-8').write('\n'.join(lines))
print(f'已归位 {len(done)} 处：')
for ln, sel, role in done:
    print(f'   {ln:>5}  --f-{role:<9} {sel}')
left = [f'{n}:{l}' for n, l in enumerate(lines, 1) if re.search(LEGACY, l)]
print('残留旧字体名:', left or '无 ✓')
