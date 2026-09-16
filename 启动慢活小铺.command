#!/bin/zsh
# 从 Finder 双击运行；路径包含空格或中文也可启动。
set -eu
PROJECT_DIR="${0:A:h}"
URL="http://127.0.0.1:5173/"
NODE_BIN="$HOME/.workbuddy-ai/binaries/node/versions/22.22.2-2/bin/node"

fail() {
  print -r -- "$1"
  read -r "?按回车关闭窗口。"
  exit 1
}

cd "$PROJECT_DIR"
if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi
[[ -n "$NODE_BIN" && -x "$NODE_BIN" ]] || fail "没有找到 Node.js，请回到 WorkBuddy 帮我重新启动项目。"
[[ -f "$PROJECT_DIR/node_modules/vite/bin/vite.js" ]] || fail "项目依赖尚未安装，请回到 WorkBuddy 帮我安装项目依赖。"

# 已启动当前小铺时复用，不关闭或接管其他应用的服务。
PAGE="$(/usr/bin/curl -fsS --max-time 2 "$URL" 2>/dev/null || true)"
if [[ "$PAGE" == *"慢活小铺 · Soft Life"* && "$PAGE" == *"/@vite/client"* ]]; then
  print -r -- "小铺已经启动，正在打开 $URL"
  /usr/bin/open "$URL"
  exit 0
fi
if [[ -n "$(/usr/sbin/lsof -nP -iTCP:5173 -sTCP:LISTEN 2>/dev/null || true)" ]]; then
  fail "5173 端口已被其他服务占用。没有关闭该服务，请回到 WorkBuddy 帮我处理。"
fi

print -r -- "正在启动慢活小铺：$URL"
print -r -- "请保留这个窗口。按 Control+C 可停止；下次双击本文件即可重新启动。"
export PATH="${NODE_BIN:h}:$PATH"
exec "$NODE_BIN" "$PROJECT_DIR/node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 5173 --strictPort --open
