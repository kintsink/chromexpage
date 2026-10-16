#!/bin/bash
# Chrome XP 复刻版 - macOS 一键启动：双击即可。关掉这个终端窗口（或按 Ctrl+C）就会停止服务。
# Chrome XP replica - macOS one-click launcher: double-click it. Close this Terminal window
# (or press Ctrl+C) to stop the server.
#
# 可选 / Optional:  PORT=9000 起始端口 / starting port      CX_LOG=1 打印请求日志 / log every request
# 端口选择、已运行检测、打开浏览器都由 server.js --launch 负责。
# Port selection, "already running" detection and opening the browser are handled by server.js --launch.

cd "$(dirname "$0")" || exit 1
# 双击运行时拿不到终端里配好的 PATH，补上常见的 Node 安装位置
# A double-clicked script does not get your shell's PATH, so add the usual Node locations
export PATH="/opt/homebrew/bin:/usr/local/bin:/opt/local/bin:$PATH"

pause_exit() {
  echo
  read -n 1 -s -r -p "按任意键关闭… / Press any key to close…"
  echo
  exit "$1"
}

if ! command -v node >/dev/null 2>&1; then
  echo "没有找到 Node.js。请先安装：https://nodejs.org/ （或 brew install node）"
  echo "Node.js was not found. Install it from https://nodejs.org/ (or: brew install node)"
  pause_exit 1
fi
if ! node -e 'process.exit(parseInt(process.versions.node, 10) >= 20 ? 0 : 1)'; then
  # 变量后紧跟中文标点时加花括号，否则非 UTF-8 环境会把标点字节吞进变量名
  # Braces matter before CJK punctuation: in a non-UTF-8 locale bash would eat its bytes into the name
  echo "Node.js 版本太旧（当前 $(node -v)），需要 20 或更高。"
  echo "Node.js $(node -v) is too old; version 20 or newer is required."
  pause_exit 1
fi

if [ -n "$CX_LOG" ]; then
  node server.js --launch --log
else
  node server.js --launch
fi
code=$?

# Ctrl+C（130）是正常退出；其他错误把信息留在屏幕上
# Ctrl+C (130) is a normal exit; for other errors keep the message on screen
if [ "$code" -ne 0 ] && [ "$code" -ne 130 ]; then
  echo "服务异常退出（代码 ${code}）。 / The server exited with an error (code ${code})."
  pause_exit "$code"
fi
