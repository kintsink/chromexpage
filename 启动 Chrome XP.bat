@echo off
chcp 65001 >nul
setlocal
:: Chrome XP 复刻版 - Windows 一键启动：双击即可。关掉这个窗口（或按 Ctrl+C）就会停止服务。
:: Chrome XP replica - Windows one-click launcher: double-click it. Close this window
:: (or press Ctrl+C) to stop the server.
::
:: 可选 / Optional:  set PORT=9000  起始端口 / starting port
:: 端口选择、已运行检测、打开浏览器都由 server.js --launch 负责，不依赖 curl 或 netstat。
:: Port selection, "already running" detection and opening the browser are handled by
:: server.js --launch, so curl and netstat are not needed.

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo 没有找到 Node.js，请先安装（需要 20 或更高）：https://nodejs.org/
  echo Node.js was not found. Install version 20 or newer from https://nodejs.org/
  pause
  exit /b 1
)

node -e "process.exit(parseInt(process.versions.node, 10) >= 20 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 版本太旧，需要 20 或更高 / Node.js is too old, version 20 or newer is required:
  node -v
  pause
  exit /b 1
)

node server.js --launch
if errorlevel 1 (
  echo.
  echo 服务异常退出 / The server exited with an error.
  pause
)
