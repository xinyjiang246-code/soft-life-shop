#!/usr/bin/env bash
# 把 dist/ 同步成一份「线上快照」，发布工具就发这个目录。
#
# 为什么不直接发 dist/：发布工具在压缩上传时会排除「构建产物」，
# 发 dist 有可能被整目录跳过；也不建议直接发项目根目录 —— Vite 的开发服务器
# 会因为反代域名不在白名单里回 "Blocked request. This host is not allowed."。
# 快照目录里只有 index.html + assets/ + 图标，是纯静态站，最不容易出意外。
#
# 用法：bash tools/publish-site.sh   然后把这个目录发给发布能力。
set -euo pipefail
cd "$(dirname "$0")/.."

npx vite build

mkdir -p published-site
# ⚠️ 用 rsync --delete 而不是 rm -rf 再拷：不用递归删目录，也不会漏掉被删掉的旧文件
rsync -a --delete dist/ published-site/

echo
echo "线上快照已更新：published-site/"
du -sh published-site
