# Chrome XP 复刻版 / Chrome XP Replica

在浏览器里复刻 Windows XP 上的 Chrome 1.0 界面，而且**能真的上网**：XP 桌面、任务栏、多窗口、标签页、地址栏，点进去就是真网页。
A replica of Chrome 1.0 on Windows XP that runs in your browser and **actually browses**: XP desktop, taskbar,
multiple windows, tabs and an address bar, pointing at the real web.

需要 Node.js 20 或更高，没有其他依赖。
Requires Node.js 20 or newer. Nothing else.

## 怎么跑起来 / Run it

**第一步：装 Node.js**（已装可跳过）——  https://nodejs.org/ 或 `brew install node`

**第二步：下载本项目** ——  `git clone https://github.com/kintsink/chromexpage.git`（或右上角 Code → Download ZIP 解压）

**第三步：双击启动脚本**

| 系统 / OS | 双击这个文件 / Double-click this file |
|---|---|
| macOS | `启动 Chrome XP.command` |
| Windows | `启动 Chrome XP.bat` |
| Linux | 终端里 / in a terminal: `bash "启动 Chrome XP.sh"` |

浏览器会自动打开 **http://chrome.localhost:8787/** ，看到 XP 桌面就成了。关掉终端窗口（或按 Ctrl+C）即停止服务。

The browser opens **http://chrome.localhost:8787/** by itself; close the terminal window (or press Ctrl+C) to stop.

<details>
<summary>不想用脚本，或者想改端口 / Manual start, or a different port</summary>

```bash
node server.js                  # http://localhost:8787/
PORT=9000 node server.js        # 换端口 / another port
```

`--launch`（三个启动脚本用的就是它）：服务已在运行时只打开浏览器；端口被占用时自动往后换（最多 20 个）；启动成功后打开默认浏览器。
The launchers run `node server.js --launch`: it opens the browser if the server already runs, moves to the next port when
another program holds it (up to 20 tries), and opens the default browser once started.

如果 `chrome.localhost` 打不开，换 http://localhost:8787/ ；Safari 可能解析不了 `*.localhost` 子域名，会退回无代理模式，建议用 Chrome / Edge / Firefox。
If `chrome.localhost` does not open, try http://localhost:8787/ . Safari may not resolve `*.localhost` subdomains and falls
back to no-proxy mode; Chrome / Edge / Firefox are recommended.
</details>

> 仅供学习和怀旧，与 Google 没有任何关联。
> For learning and nostalgia only; not affiliated with Google.

## 功能 / Features

| 中文 | English |
|---|---|
| XP 桌面、任务栏、开始菜单，Chrome 1.0 标签页 / 工具栏 / 书签栏 | XP desktop, taskbar and Start menu; Chrome 1.0 tabs, toolbar, bookmarks bar |
| 多窗口：拖动、8 向拉伸、最小化 / 最大化 / 关闭，带动画 | Multiple windows: drag, 8-way resize, minimize / maximize / close, animated |
| 地址栏建议、后退 / 前进、书签、历史记录、新标签页、缩放 | Address-bar suggestions, back / forward, bookmarks, history, New Tab page, zoom |
| 锁图标可查看网站的真实 TLS 证书 | The lock icon shows the site's real TLS certificate |
| 中英文界面，在「选项」里切换；网站也按界面语言打开 | Chinese / English UI, switchable in Options; websites open in the UI language |
| 「选项」里可清除本地历史记录 | Clear local history from Options |
| 零依赖：只需要 Node.js 20 或更高 | Zero dependencies: Node.js 20+ only |

## 启动参数 / Options

| 参数 / Flag | 说明 / Meaning |
|---|---|
| `--launch` | 启动器模式（见上）/ launcher mode (see above) |
| `--log` | 每个代理请求打一行日志 / log one line per proxied request |
| `--allow-private` | 允许代理本机和内网地址。被代理网页里的脚本因此也能访问你**本机上跑着的服务**（不只是内网主机），慎用 / allow loopback and private-network targets; scripts on proxied pages can then reach services **running on this machine**, not just your LAN, so use with care |
| `PORT=…` | 端口（`--launch` 时为起始端口）/ port (starting port with `--launch`) |

启动脚本也支持 `CX_LOG=1` 打开日志（Windows 脚本除外）。
The macOS / Linux launchers also accept `CX_LOG=1` to enable logging.

## 工作原理 / How it works

```
浏览器 Browser
  └─ http://chrome.localhost:8787/                       界面 UI (index.html)
       └─ <iframe> http://example.com.https.chrome.localhost:8787/
            └─ server.js ──fetch──> https://example.com/
```

- 每个网站映射到自己的 `*.chrome.localhost` 子域名，相对路径、Cookie、localStorage 都按网站隔离。
  Each site gets its own `*.chrome.localhost` subdomain, so relative paths, cookies and localStorage stay per site.
  例 / e.g. `https://example.com/` → `http://example.com.https.chrome.localhost:8787/`，
  `http://localhost:3000/` → `http://localhost.p3000.http.chrome.localhost:8787/`
- 代理去掉 `X-Frame-Options` / CSP 等禁止嵌入的响应头，改写重定向和 Cookie 域名。
  The proxy strips headers that forbid embedding (`X-Frame-Options`, CSP, …) and rewrites redirects and cookie domains.
- 往每个 HTML 页面注入一小段桥接脚本，通过 `postMessage` 把地址、标题、图标、悬停链接、新窗口请求告诉界面；界面只接受来自 `*.chrome.localhost` 的消息。
  A small bridge script injected into every HTML page reports URL, title, favicon, hovered links and new-window
  requests to the UI via `postMessage`; the UI only accepts messages from `*.chrome.localhost`.
- 内联脚本里的 `top.location` / `parent.location` 会改写成 `window.location`，让"跳出框架"式的跳转页留在标签页里。
  `top.location` / `parent.location` in inline scripts become `window.location`, so frame-busting redirect pages stay in the tab.

## 安全 / Safety

- 服务只监听 `127.0.0.1`，界面只响应 `localhost` / `127.0.0.1` / `chrome.localhost`（防 DNS 重绑定）。
  The server listens on `127.0.0.1` only and serves the UI only for `localhost` / `127.0.0.1` / `chrome.localhost` (DNS-rebinding guard).
- 默认拒绝代理本机和内网地址。目标域名只解析一次，紧接着的连接复用这次解析结果，域名来不及在"检查"和"连接"之间改答内网地址（防 DNS 重绑定）。
  Loopback and private-network targets are refused by default. Each name is resolved once and the connection that follows
  reuses that answer, so a name cannot answer "public" to the check and "private" to the connection itself (DNS-rebinding guard).
- 证书查询接口（`/?cert=`）要带上界面页里现发的令牌，不带就 403；跨域读取也只开放给界面自己的域名。它能读到的是真证书字段，所以不能让别的程序或网页借它当端口探针。
  The certificate endpoint (`/?cert=`) requires the per-page token; without it, it answers 403. Cross-origin reads are opened to the
  UI's own hostnames only. It reads real certificate fields, so it must not be usable as a port prober by other programs or pages.
- `/__ping` 同样要令牌，只有本服务发出的界面能探测到代理在不在。别的程序就算打开同一个地址，拿到的页面没有令牌，会退回"无代理"模式，不会借用你的代理。
  `/__ping` needs the token too, so only a UI this server handed out can detect the proxy. Another program opening the same address
  gets a page without a token, falls back to no-proxy mode, and does not borrow your proxy.
- 被代理的网页运行在 iframe 沙箱里，不能把整个界面导航走。
  Proxied pages run in a sandboxed iframe and cannot navigate the UI away.

## 界面令牌 / The UI token

界面页每次打开时，服务都会现取一个随机令牌写进页面（`<html data-cx-token="…">`），并只认这份令牌。上一个页面的令牌在你重开界面后失效，最多保留最近 8 个（同时开多个界面标签页时不会互相挤掉）。
The server mints a random token for every UI page load, bakes it into the page (`<html data-cx-token="…">`) and accepts only tokens it
handed out. Older ones stop working once you reopen the UI; the last 8 stay valid, so several UI tabs can be open at once.

这就是"只有本服务发出的界面能用代理"的实现方式：任何别的程序、以及任何网页，都拿不到这个令牌。
That is how "only a UI this server handed out may use the proxy" is implemented: no other program and no web page can obtain it.

## 已知限制 / Known limitations

- **谷歌 / Google**：谷歌会把代理的请求判成异常流量并弹验证码，而验证码不支持 `*.chrome.localhost`，所以谷歌首页和搜索页改为不经代理、直接嵌入（谷歌允许带 `igu=1` 时被嵌入）。搜索本身完全正常；但从结果点进去的网站也不经代理：允许被嵌入的（如维基百科）能正常显示，禁止被嵌入的（如 Reddit）会显示打不开，地址栏也不会跟着变。按住 Cmd/Ctrl 点击结果可在浏览器新标签页打开。
  Google flags proxied requests as unusual traffic and shows a CAPTCHA that does not support `*.chrome.localhost`, so Google's
  homepage and search pages are embedded directly instead (Google allows embedding with `igu=1`). Searching works fully; sites opened
  from the results are not proxied either: those that allow embedding (e.g. Wikipedia) display, those that forbid it (e.g. Reddit)
  fail to load, and the address bar does not follow. Cmd/Ctrl-click a result to open it in a new browser tab.
- **其他搜索引擎 / Other engines**：DuckDuckGo（默认）、百度、必应走代理；频繁搜索时 DuckDuckGo 可能弹验证。
  DuckDuckGo (default), Baidu and Bing go through the proxy; DuckDuckGo may ask for a check after many searches.
- **同一进程 / Shared process**：网页和界面在同一个浏览器进程里，网页脚本跑飞时界面也会卡住。
  Pages and the UI share one browser process; a runaway page script freezes the UI too.
- **单页应用和登录 / SPAs and logins**：依赖跨站 Cookie、Service Worker 或 WebSocket 的网站可能不完整。
  Sites relying on cross-site cookies, service workers or WebSockets may be incomplete.
- **Safari**：可能无法解析 `*.localhost` 子域名，会退回"无代理"模式，只能打开允许被嵌入的网站。建议用 Chrome / Edge / Firefox。
  Safari may not resolve `*.localhost` subdomains and falls back to no-proxy mode. Prefer Chrome / Edge / Firefox.
- **新标签页缩略图 / New Tab thumbnails**：按域名生成的示意图，不是真实截图。
  Generated from the domain name, not real screenshots.
- **切换语言 / Switching language** 会刷新界面，已打开的标签页会关闭。
  reloads the UI and closes open tabs.

## 文件 / Files

```
server.js                本地服务：界面 + 代理 + 证书查询 / local server: UI + proxy + certificate lookup
index.html               整个界面（HTML + CSS + JS，单文件）/ the whole UI in one file
启动 Chrome XP.command    macOS 启动器 / launcher
启动 Chrome XP.sh         Linux 启动器 / launcher
启动 Chrome XP.bat        Windows 启动器 / launcher
启动说明.md               启动脚本说明 / launcher guide
多语言功能说明.md          多语言说明 / language guide
（以上两份同样可以从 LAUNCHERS.md / LANGUAGES.md 打开）
CHANGELOG.md             更新日志 / changelog
LICENSE                  MIT 许可证 / MIT license
_backup/                 历史副本，只留本地，已忽略 / local-only history, git-ignored
```

## 许可 / License

MIT，见 [LICENSE](LICENSE)。

## 测试情况 / Test status

- `node --check` 覆盖两个源文件；界面脚本也单独做过语法检查。
  `node --check` covers both sources; the UI script is syntax-checked on its own as well.
- 服务端的地址映射、Cookie 改写、桥接注入、错误码、令牌校验等纯函数有 94 条断言（`node --test` 风格，随改随跑）。
  The server's pure helpers (address mapping, cookie rewriting, bridge injection, error codes, token checks) have 94 assertions.
- 代理链路用真实请求跑过：二进制文件（PNG）经代理与直连结果一致、`Range` 请求返回 206、重定向与 `Set-Cookie` 改写、内网目标被拒。
  The proxy path is exercised with real requests: a PNG fetched through the proxy matches the direct download byte for byte,
  `Range` returns 206, redirects and `Set-Cookie` are rewritten, and private targets are refused.
- 界面用无头 Chrome 驱动跑过：新标签页、浏览、锁图标、证书对话框、错误页、多窗口、最小化、中英文切换，无控制台报错。
  The UI is driven in headless Chrome: New Tab, browsing, the lock icon, the certificate dialog, the error page, multiple windows,
  minimize and the language switch, with no console errors.
- **未测 / Not tested**：Windows 与 Linux 启动器只做了语法检查，没在真机上跑过；Safari 的 `*.localhost` 回退路径没测过。
  The Windows and Linux launchers are syntax-checked only and have not run on real machines; Safari's `*.localhost` fallback is untested.
