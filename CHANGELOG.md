# 更新日志 / Changelog

## v2.4.0 — 2026-10-17

### 安全 / Security

- **证书接口对谁都开放**：`/?cert=` 以前不校验请求方——CORS 只拦得住"读响应"，拦不住"发请求"，所以本机任何程序都能拿它做 TLS 探针（探测开放端口、读取任意站点的证书字段），普通网页也能盲探。现在必须带上界面页里的令牌，否则 403；跨域读取仍只给界面自己的域名。
  **The certificate endpoint was open to everyone**: `/?cert=` never checked the caller. CORS stops a response from being
  *read*, never a request from being *sent*, so any local program could use it as a TLS prober (open ports, any site's certificate
  fields) and any web page could probe it blindly. It now requires the token from the UI page and answers 403 without it;
  cross-origin reads stay limited to the UI's own hostnames.
- **DNS 重绑定窗口**：以前先解析域名判私网、再把域名交给连接去解析一次，两次之间域名可以改答内网地址。现在每个名字只解析一次，紧接着的连接复用这份结果（3 秒内有效）。
  **DNS-rebinding window**: the check resolved the name and the connection resolved it again, so a name could answer public
  first and private second. Each name is now resolved once and the connection that follows reuses that answer (valid for 3s).
- **`/__ping` 变成了通用探测点**：它以前对所有主机名都回 `cx-ok`，于是被代理的网页能借它判断代理在不在，而且任何真实网站的 `/__ping` 路径都被它抢掉。现在它只在界面主机名上生效、且要令牌。
  **`/__ping` was a public probe**: it answered `cx-ok` on every hostname, so proxied pages could use it to detect the proxy,
  and it shadowed the `/__ping` path of every real site. It now lives on the UI hostnames only and needs the token.

### 新增 / Added

- **界面令牌**：界面页每次打开都会拿到一个新令牌，服务只认自己发出的令牌。别的程序即使打开同一个地址，拿到的页面没有令牌，会退回"无代理"模式，不会借用你的代理；同时开多个界面标签页不会互相挤掉（保留最近 8 个）。
  **UI token**: every UI page load gets a fresh token and the server only accepts tokens it handed out. Another program
  opening the same address gets a tokenless page, falls back to no-proxy mode, and does not borrow your proxy. Several UI
  tabs can be open at once (the last 8 tokens stay valid).
- 锁图标在指向本机代理时显示"本机代理（明文 http），没有证书"，不再给一个点了也没内容的"证书信息"入口。
  The lock icon now says "local proxy (plain http): no certificate" when it points at the proxy itself, and no longer offers a
  certificate window that would have nothing to show.
- 仓库补上 `LICENSE`（README 一直写着 MIT，文件夹里却没有这份文件）。
  Added the missing `LICENSE` file (the README had said MIT all along).

### 修复 / Fixed

- **英文界面残留中文**：桌面图标提示（悬停显示"双击打开"）和信息栏关闭按钮（读屏会读"关闭"）没有跟着界面语言走；`<html lang>` 也一直写死 `zh-CN`。
  **Chinese left in the English UI**: the desktop icon tooltip ("双击打开") and the info bar's close button (screen readers
  announced "关闭") did not follow the UI language, and `<html lang>` was hard-coded to `zh-CN`.

### 变更 / Changed

- `--allow-private` 的说明写具体了：它同时放开**本机上跑着的服务**，不只是内网主机。
  The `--allow-private` description now says what it really opens: services running on this machine, not just the LAN.
- 服务端参数校验、Cookie 改写、桥接注入这些纯函数补了 94 条断言，代理链路补了 38 项实测。
  Added 94 assertions for the server's pure helpers and 38 live checks for the proxy path.

## v2.3.1 — 2026-10-16

### 修复 / Fixed
- **谷歌搜索用不了**：上一版只把谷歌从搜索引擎设置里去掉了，直接打开 google.com 搜索仍会被拦。现在谷歌首页和搜索页不经代理、直接嵌入（`igu=1`），由浏览器自己访问，不再触发验证码；谷歌重新加回搜索引擎选项。限制：从结果点进去的网站也不经代理，禁止被嵌入的网站会打不开，地址栏不跟随。
  **Google search did not work**: the previous version only removed Google from the engine setting; opening google.com and searching
  was still blocked. Google's homepage and search pages are now embedded directly (`igu=1`) and loaded by the browser itself, so no
  CAPTCHA; Google is back in the engine list. Limitation: sites opened from results are not proxied either, so those that forbid
  embedding fail to load, and the address bar does not follow.

## v2.3.0 — 2026-10-16

### 变更 / Changed
- 新标签页快捷方式全部改为纯域名，不带参数；英文界面下必应换成 DuckDuckGo，百度换成 BBC。
  New Tab shortcuts are now plain domains with no parameters; in English, Bing becomes DuckDuckGo and Baidu becomes BBC.
- 代理按界面语言向网站要对应语言（`Accept-Language`），代理错误页也跟随界面语言。
  The proxy asks websites for the UI language (`Accept-Language`); its error page follows the UI language too.
- 移除谷歌搜索（v2.3.1 改为直接嵌入后重新加回）。
  Removed Google search (re-added in v2.3.1 with direct embedding).
- 开始菜单去掉重复的"新建窗口"，"Google Chrome"一项显示 Chrome 图标。
  The Start menu drops the duplicate "New Window"; the "Google Chrome" item shows the Chrome logo.

### 修复 / Fixed
- **跨网站 Cookie 泄露**：网页脚本把 Cookie 写到"根域名"时，在代理下算出的是 `chrome.localhost`，这些 Cookie（多为跟踪 ID）会被发给之后访问的每个网站。现在桥接脚本把这类写入限制在当前网站，界面启动时清掉已经泄露的 Cookie。
  **Cross-site cookie leak**: when page scripts wrote cookies to the "root domain", behind the proxy that became `chrome.localhost`,
  so those cookies (mostly tracking IDs) were sent to every site visited afterwards. The bridge now keeps such writes on the
  current site, and the UI clears already-leaked cookies on startup.

## v2.2.1 — 2026-10-16

### 修复 / Fixed
- **英文界面下，新标签页的快捷方式点进去仍是中文网站**：以前快捷方式网址写死为中文版，且中文模式下访问过的中文网址会留在"最常访问"里。现在每个快捷方式按界面语言选网址，历史里同一网站的各语言版本合并成一个磁贴。
  **In the English UI, New Tab shortcuts still opened Chinese sites**: their URLs were hard-coded Chinese versions, and Chinese URLs
  visited in Chinese mode stayed in "Most Visited". Each shortcut now picks its URL by UI language, and language variants of the same
  site in history merge into one tile.

  | 快捷方式 / Shortcut | 中文 / Chinese | English |
  |---|---|---|
  | 维基百科 / Wikipedia | zh.wikipedia.org | en.wikipedia.org |
  | 必应 / Bing | www.bing.com | global.bing.com（国际版，不会被跳到 cn.bing.com / international edition, not redirected to cn.bing.com） |
  | MDN | /zh-CN/ | /en-US/ |
  | 百度 → BBC News | www.baidu.com | www.bbc.com/news（百度没有英文版 / Baidu has no English edition） |

  其余快捷方式（GitHub、Hacker News、互联网档案馆、2008 年的 Google、Example）本来就是英文。
  The other shortcuts (GitHub, Hacker News, Internet Archive, Google in 2008, Example) are English already.

## v2.2.0 — 2026-10-16

### 新增 / Added
- 「选项」里新增「清除本地历史记录」：清除浏览历史和最近关闭的标签页，书签和设置保留；两步确认，先显示条数，再点一次才删除。
  "Clear local history" in Options: removes browsing history and recently closed tabs, keeps bookmarks and settings;
  two-step confirmation (shows the count first, deletes on the second click).
- `server.js --launch`：启动器模式，复用已运行的实例、端口被占自动换、启动后打开浏览器。
  `server.js --launch`: launcher mode that reuses a running instance, skips busy ports and opens the browser.
- 代理错误页按浏览器语言显示中文或英文。
  The proxy error page is shown in Chinese or English depending on the browser language.

### 修复 / Fixed
- **锁图标过大**：按钮里的 svg 没有设尺寸，按 SVG 默认的 300×150 渲染；现在是 11×11。
  **Oversized lock icon**: the svg inside the button had no size and rendered at the SVG default of 300×150; now 11×11.
- **地址栏建议从不出现**：`el()` 直接给只读的 `dataset` 赋值，严格模式下每次输入都抛 TypeError。
  **Address-bar suggestions never appeared**: `el()` assigned to the getter-only `dataset`, throwing a TypeError on every keystroke in strict mode.
- **切换窗口会刷新网页**：激活窗口时把窗口节点重新插入 DOM，里面的 iframe 全部重新加载；改为用 z-index 排序。
  **Switching windows reloaded pages**: focusing re-inserted the window node into the DOM, reloading every iframe in it; stacking now uses z-index.
- 关闭窗口后焦点交给叠放最上面的窗口，而不是最后创建的窗口。
  After closing a window, focus goes to the topmost remaining window rather than the most recently created one.
- 选项对话框的默认焦点落在底部按钮上；证书"加密套件"一栏的运算符优先级错误。
  The Options dialog focuses its footer buttons by default; fixed an operator-precedence bug in the certificate "cipher" row.
- **证书接口**（`/?cert=`）：
  **Certificate endpoint** (`/?cert=`):
  - 以前不检查目标地址，且对任何网站开放跨域读取，任何网页都能借它探测你的内网端口；现在拒绝内网地址，只允许界面跨域读取。
    It used to accept any target and allow cross-origin reads from any site, so any web page could use it to probe
    ports on your LAN; it now refuses private targets and only the UI may read it cross-origin.
  - 以前在被代理的网站上也会拦截 `/?cert=` 路径；现在只在界面主机名上生效。
    It used to hijack the `/?cert=` path on proxied sites too; it now only answers on UI hostnames.
- 被代理的 HTML 读取正文时也受 30 秒超时保护（以前只覆盖到响应头）。
  Proxied HTML bodies are now covered by the 30-second timeout (previously only the headers were).
- Windows 启动器：原先多行 `start /b cmd /c "^ …"` 在引号里无法续行，那几行会在前台执行，导致 node 很晚才启动、浏览器不会自动打开；已重写。
  Windows launcher: the multi-line `start /b cmd /c "^ …"` block cannot continue lines inside quotes, so those lines ran in
  the foreground, delaying node and never opening the browser; rewritten.
- Linux 启动器不再依赖 curl / ss / netstat。
  The Linux launcher no longer depends on curl / ss / netstat.

### 变更 / Changed
- 代码注释、启动脚本、服务端输出和文档改为中英双语。
  Code comments, launchers, server output and docs are now bilingual (Chinese / English).
- 桥接脚本注入前去掉整行注释，并去掉了网页控制台里的调试日志。
  The bridge script drops full-line comments before injection, and no longer logs debug warnings in page consoles.

### 文档更正 / Documentation corrections
以前的文档描述过一些代码里并不存在的东西，已更正：没有 `TabManager` 类和 `initDom()`；语言切换在「选项」里，不是标题栏的 🌐 按钮；切换语言会关闭已打开的标签页；界面的 postMessage 校验是"来源必须是 `*.chrome.localhost`"。
Earlier docs described things the code never had; corrected: there is no `TabManager` class or `initDom()`; the language
switch lives in Options, not a 🌐 title-bar button; switching language closes open tabs; the UI's postMessage check is
"origin must be `*.chrome.localhost`".

## v2.1.0 — 2026-10-16
- 中英文界面，默认跟随浏览器语言，在「选项」里切换。
  Chinese / English UI; defaults to the browser language, switchable in Options.
- 多窗口（拖动、8 向拉伸、层叠打开）、锁图标证书查看器。
  Multiple windows (drag, 8-way resize, cascading), certificate viewer behind the lock icon.

## v2.0.0 — 2026-10-16
- 动画：标签开合、窗口最小化 / 最大化 / 关闭、菜单与对话框淡入淡出、新标签页磁贴依次浮现。
  Animations: tab open/close, window minimize / maximize / close, fading menus and dialogs, staggered New Tab tiles.
- 修复 time.is 等网站把界面卡死的问题（不再改写 `window.parent`）。
  Fixed sites such as time.is freezing the UI (no longer overriding `window.parent`).
- macOS / Linux / Windows 一键启动脚本。
  One-click launchers for macOS / Linux / Windows.

## v1.0.0 — 2026-10-14
- Windows XP 上 Chrome 1.0 的界面复刻，子域名隔离的本地代理，桥接脚本注入。
  Chrome 1.0-on-XP UI replica, local proxy with per-site subdomains, bridge script injection.
