# 启动脚本说明

**简体中文** · [English](../LAUNCHERS.md)

三个启动脚本都只做两件事：检查 Node.js 版本是否 ≥ 20，然后运行 `node server.js --launch`。端口选择、已运行检测、
打开浏览器都由服务自己负责。

| 系统 | 双击 | 或在终端里 |
|---|---|---|
| macOS | `start-macos.command` | `./start-macos.command` |
| Windows | `start-windows.bat` | `start-windows.bat` |
| Linux | — | `bash start-linux.sh` |

## 脚本做了什么

1. 检查 Node.js 是否安装、版本是否 ≥ 20；不满足时给出安装提示并停在窗口里。
2. 运行 `node server.js --launch`，由它负责：
   - 端口空闲就启动服务；
   - 端口上已经是本服务 → 只打开浏览器，不重复启动；
   - 端口被别的程序占用 → 往后换，最多试 20 个；
   - 启动成功 → 打开默认浏览器（macOS `open`，Linux `xdg-open`，Windows `start`）。

所以脚本除 Node.js 外不依赖任何东西——不需要 curl、nc、ss、netstat。

## 停止

关掉终端窗口，或按 Ctrl+C。只关掉浏览器标签页不会停止服务。

## 指定端口和日志

```bash
PORT=9000 "./start-macos.command"     # macOS
PORT=9000 bash start-linux.sh         # Linux
CX_LOG=1 bash start-linux.sh          # 打印每个请求
```

```bat
:: Windows（cmd）
set PORT=9000
start-windows.bat
```

## 常见问题

- **提示没有找到 Node.js**：安装 Node.js 20 或更高：https://nodejs.org/
- **macOS 双击后提示无法打开**：右键 →「打开」，或在终端运行 `chmod +x "start-macos.command"`。
  macOS 会给下载来的脚本加隔离标记；本仓库里的可执行位是保留的，所以 `git clone` 下来可以直接双击。
- **浏览器没有自动打开**：手动访问终端里打印的地址（默认 `http://localhost:8787/`）。
- **`chrome.localhost` 解析不了**：改用 `http://localhost:8787/`；详见 README 的「已知限制」。

## 测试情况

macOS 启动器和 `--launch` 的三种情况（全新启动、复用已运行实例、端口被占换端口）已在真机上实测。
Linux 和 Windows 启动器只做了语法检查，没有在真机上运行过。
