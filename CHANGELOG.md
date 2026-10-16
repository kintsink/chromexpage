# Changelog

## Unreleased

### Added

- Screenshots in the README (New Tab, browsing, certificate viewer, multiple windows), stored in
  `docs/screenshots/`.

## v2.4.1 — 2026-10-17

### Changed

- **English file names.** The launchers are now `start-macos.command`, `start-windows.bat` and `start-linux.sh`;
  the guides are `LAUNCHERS.md` and `LANGUAGES.md`. The Chinese guides moved under `docs/` (their own file names
  keep the `.zh-CN.md` suffix so the language is obvious at a glance).
- **The README is English by default**, with a Simplified Chinese translation in `docs/README.zh-CN.md` and a
  language switcher on the first line. Chinese and English are no longer interleaved in the same paragraphs.
- The CHANGELOG is English only.

## v2.4.0 — 2026-10-17

### Security

- **The certificate endpoint was open to everyone**: `/?cert=` never checked the caller. CORS stops a response from
  being *read*, never a request from being *sent*, so any local program could use it as a TLS prober (open ports, any
  site's certificate fields) and any web page could probe it blindly. It now requires the token from the UI page and
  answers 403 without it; cross-origin reads stay limited to the UI's own hostnames.
- **DNS-rebinding window**: the check resolved the name and the connection resolved it again, so a name could answer
  public first and private second. Each name is now resolved once and the connection that follows reuses that answer
  (valid for 3 seconds).
- **`/__ping` was a public probe**: it answered `cx-ok` on every hostname, so proxied pages could use it to detect
  the proxy, and it shadowed the `/__ping` path of every real site. It now lives on the UI hostnames only and needs
  the token.

### Added

- **UI token**: every UI page load gets a fresh token and the server only accepts tokens it handed out. Another program
  opening the same address gets a tokenless page, falls back to no-proxy mode, and does not borrow your proxy. Several
  UI tabs can be open at once (the last 8 tokens stay valid).
- The lock icon now says "local proxy (plain http): no certificate" when it points at the proxy itself, and no longer
  offers a certificate window that would have nothing to show.
- Added the missing `LICENSE` file (the README had said MIT all along).

### Fixed

- **Chinese left in the English UI**: the desktop icon tooltip and the info bar's close button did not follow the UI
  language, and `<html lang>` was hard-coded to `zh-CN`.

### Changed

- The `--allow-private` description now says what it really opens: services running on this machine, not just the LAN.
- Added 94 assertions for the server's pure helpers and 38 live checks for the proxy path.

## v2.3.1 — 2026-10-16

### Fixed

- **Google search did not work**: the previous version only removed Google from the engine setting; opening google.com
  and searching was still blocked. Google's homepage and search pages are now embedded directly (`igu=1`) and loaded by
  the browser itself, so no CAPTCHA; Google is back in the engine list. Limitation: sites opened from results are not
  proxied either, so those that forbid embedding fail to load, and the address bar does not follow.

## v2.3.0 — 2026-10-16

### Changed

- New Tab shortcuts are now plain domains with no parameters; in English, Bing becomes DuckDuckGo and Baidu becomes BBC.
- The proxy asks websites for the UI language (`Accept-Language`); its error page follows the UI language too.
- Removed Google search (re-added in v2.3.1 with direct embedding).
- The Start menu drops the duplicate "New Window"; the "Google Chrome" item shows the Chrome logo.

### Fixed

- **Cross-site cookie leak**: when page scripts wrote cookies to the "root domain", behind the proxy that became
  `chrome.localhost`, so those cookies (mostly tracking IDs) were sent to every site visited afterwards. The bridge now
  keeps such writes on the current site, and the UI clears already-leaked cookies on startup.

## v2.2.1 — 2026-10-16

### Fixed

- **In the English UI, New Tab shortcuts still opened Chinese sites**: their URLs were hard-coded Chinese versions, and
  Chinese URLs visited in Chinese mode stayed in "Most Visited". Each shortcut now picks its URL by UI language, and
  language variants of the same site in history merge into one tile.

  | Shortcut | Chinese | English |
  |---|---|---|
  | Wikipedia | zh.wikipedia.org | en.wikipedia.org |
  | Bing | www.bing.com | global.bing.com (international edition, not redirected to cn.bing.com) |
  | MDN | /zh-CN/ | /en-US/ |
  | Baidu → BBC News | www.baidu.com | www.bbc.com/news (Baidu has no English edition) |

  The other shortcuts (GitHub, Hacker News, Internet Archive, Google in 2008, Example) are English already.

## v2.2.0 — 2026-10-16

### Added

- "Clear local history" in Options: removes browsing history and recently closed tabs, keeps bookmarks and settings;
  two-step confirmation (shows the count first, deletes on the second click).
- `server.js --launch`: launcher mode that reuses a running instance, skips busy ports and opens the browser.
- The proxy error page is shown in Chinese or English depending on the browser language.

### Fixed

- **Oversized lock icon**: the svg inside the button had no size and rendered at the SVG default of 300×150; now 11×11.
- **Address-bar suggestions never appeared**: `el()` assigned to the getter-only `dataset`, throwing a TypeError on
  every keystroke in strict mode.
- **Switching windows reloaded pages**: focusing re-inserted the window node into the DOM, reloading every iframe in it;
  stacking now uses z-index.
- After closing a window, focus goes to the topmost remaining window rather than the most recently created one.
- The Options dialog focuses its footer buttons by default; fixed an operator-precedence bug in the certificate
  "cipher" row.
- **Certificate endpoint** (`/?cert=`):
  - it used to accept any target and allow cross-origin reads from any site, so any web page could use it to probe ports
    on your LAN; it now refuses private targets and only the UI may read it cross-origin;
  - it used to hijack the `/?cert=` path on proxied sites too; it now only answers on UI hostnames.
- Proxied HTML bodies are now covered by the 30-second timeout (previously only the headers were).
- Windows launcher: the multi-line `start /b cmd /c "^ …"` block cannot continue lines inside quotes, so those lines
  ran in the foreground, delaying node and never opening the browser; rewritten.
- The Linux launcher no longer depends on curl / ss / netstat.

### Changed

- Code comments, launchers, server output and docs became bilingual (Chinese / English).
  *(As of v2.4.1 the documentation is English by default, with Simplified Chinese in `docs/`.)*
- The bridge script drops full-line comments before injection, and no longer logs debug warnings in page consoles.

### Documentation corrections

Earlier docs described things the code never had; corrected: there is no `TabManager` class or `initDom()`; the
language switch lives in Options, not a 🌐 title-bar button; switching language closes open tabs; the UI's postMessage
check is "origin must be `*.chrome.localhost`".

## v2.1.0 — 2026-10-16

- Chinese / English UI; defaults to the browser language, switchable in Options.
- Multiple windows (drag, 8-way resize, cascading), certificate viewer behind the lock icon.

## v2.0.0 — 2026-10-16

- Animations: tab open/close, window minimize / maximize / close, fading menus and dialogs, staggered New Tab tiles.
- Fixed sites such as time.is freezing the UI (no longer overriding `window.parent`).
- One-click launchers for macOS / Linux / Windows.

## v1.0.0 — 2026-10-14

- Chrome 1.0-on-XP UI replica, local proxy with per-site subdomains, bridge script injection.