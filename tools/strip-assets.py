"""把 src/data.js 的 webp 静态导入换成空串，产出可在 node 里直接跑的单测副本。

data.js 依赖 34 个 .webp 静态导入，node 无法解析 —— 每次想单测数据层
（确定性生成、id 稳定性、getItem 查询…）都要先过这道闸。
用法：python3 tools/strip-assets.py [src/data.js] [out=/tmp/data-test.mjs]
"""
import re
import sys
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else "src/data.js")
out = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/data-test.mjs")

code = src.read_text(encoding="utf-8")
stripped, n = re.subn(
    r"^import (\w+) from '\./assets/[^']+\.(?:webp|png|jpg)'\s*$",
    r"const \1 = ''",
    code,
    flags=re.M,
)
leftover = re.findall(r"^import .*\.(?:webp|png|jpg)'", stripped, flags=re.M)
if leftover:
    sys.exit(f"还有没替换掉的静态资源导入，node 跑不起来：\n" + "\n".join(leftover))

out.write_text(stripped, encoding="utf-8")
print(f"→ {out}（替换 {n} 个资源导入）")
