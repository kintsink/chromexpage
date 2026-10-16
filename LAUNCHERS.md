# 启动脚本说明 / Launcher Guide

> 这份与 [`启动说明.md`](启动说明.md) 内容相同，两个名字都能打开。
> Same document as [`启动说明.md`](启动说明.md); either name works.

| 系统 / OS | 脚本 / Script | 用法 / How |
|---|---|---|
| macOS | `启动 Chrome XP.command` | 双击 / double-click |
| Linux | `启动 Chrome XP.sh` | `bash "启动 Chrome XP.sh"` |
| Windows | `启动 Chrome XP.bat` | 双击 / double-click |

## 脚本做了什么 / What the scripts do

1. 检查 Node.js 是否安装、版本是否 ≥ 20；不满足时给出安装提示并停在窗口里。
   Check that Node.js is installed and at least version 20; otherwise show install hints and keep the window open.
2. 运行 `node server.js --launch`，由它负责：
   Run `node server.js --launch`, which:
   - 端口上已经是本服务 → 只打开浏览器，不重复启动；
     if this server already runs on the port → just opens the browser, no second instance;
   - 端口被别的程序占用 → 往后换，最多试 20 个；
     if another program holds the port → tries the next one, up to 20;
   - 启动成功 → 打开默认浏览器（macOS `open`，Linux `xdg-open`，Windows `start`）。
     once started → opens the default browser (macOS `open`, Linux `xdg-open`, Windows `start`).

所以脚本不依赖 curl、nc、ss、netstat。
So the scripts do not depend on curl, nc, ss or netstat.

## 停止 / Stopping

关掉终端窗口，或按 Ctrl+C。
Close the terminal window or press Ctrl+C.

## 指定端口和日志 / Port and logging

```bash
PORT=9000 "./启动 Chrome XP.command"     # macOS
PORT=9000 bash "启动 Chrome XP.sh"       # Linux
CX_LOG=1 bash "启动 Chrome XP.sh"        # 打印每个请求 / log every request
```

```bat
:: Windows（cmd）
set PORT=9000
"启动 Chrome XP.bat"
```

## 常见问题 / Troubleshooting

- **提示没有找到 Node.js / "Node.js was not found"**：安装 Node.js 20 或更高 / install Node.js 20+: https://nodejs.org/
- **macOS 双击后提示无法打开 / macOS refuses to open the script**：右键 →「打开」，或在终端运行 `chmod +x "启动 Chrome XP.command"`。
  Right-click → Open, or run `chmod +x "启动 Chrome XP.command"` in Terminal.
- **浏览器没有自动打开 / The browser did not open**：手动访问终端里打印的地址（默认 `http://localhost:8787/`）。
  Open the address printed in the terminal (by default `http://localhost:8787/`).

## 测试情况 / Test status

macOS 启动器和 `--launch` 的三种情况（全新启动、复用已运行实例、端口被占换端口）已实测。
Linux 和 Windows 启动器只做了语法检查，没有在真机上运行过。
The macOS launcher and all three `--launch` paths (fresh start, reuse, busy port) were tested.
The Linux and Windows launchers were only syntax-checked, not run on real machines.
