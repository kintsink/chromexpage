#!/usr/bin/env bash
# Chrome XP 复刻版 - Linux 一键启动。在终端运行：bash "启动 Chrome XP.sh"；按 Ctrl+C 停止服务。
# Chrome XP replica - Linux one-click launcher. Run in a terminal: bash "启动 Chrome XP.sh";
# press Ctrl+C to stop the server.
#
# 可选 / Optional:  PORT=9000 起始端口 / starting port      CX_LOG=1 打印请求日志 / log every request
# 端口选择、已运行检测、打开浏览器（xdg-open）都由 server.js --launch 负责，不依赖 curl / ss / netstat。
# Port selection, "already running" detection and opening the browser (xdg-open) are handled by
# server.js --launch, so curl / ss / netstat are not needed.

cd "$(dirname "$0")" || exit 1

pause_exit() {
  # 只有在交互终端里才停下来等按键 / Only wait for a key in an interactive terminal
  if [ -t 0 ]; then
    echo
    read -r -p "按回车键退出… / Press Enter to exit…" _
  fi
  exit "$1"
}

if ! command -v node >/dev/null 2>&1; then
  echo "没有找到 Node.js（需要 20 或更高）。 / Node.js was not found (version 20 or newer is required)."
  echo "  Ubuntu/Debian:  sudo apt install nodejs"
  echo "  Fedora/RHEL:    sudo dnf install nodejs"
  echo "  Arch:           sudo pacman -S nodejs"
  echo "  https://nodejs.org/"
  pause_exit 1
fi
if ! node -e 'process.exit(parseInt(process.versions.node, 10) >= 20 ? 0 : 1)'; then
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

# Ctrl+C（130）是正常退出 / Ctrl+C (130) is a normal exit
if [ "$code" -ne 0 ] && [ "$code" -ne 130 ]; then
  echo "服务异常退出（代码 ${code}）。 / The server exited with an error (code ${code})."
  pause_exit "$code"
fi
