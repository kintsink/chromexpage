# Chrome XP Replica

[English](README.md) · [简体中文](docs/README.zh-CN.md)

A replica of Chrome 1.0 on Windows XP that runs in your browser and **actually browses**: XP desktop, taskbar,
multiple windows, tabs and an address bar, pointing at the real web.

![The Chrome 1.0 on XP interface: XP taskbar, tabs, and a New Tab page](docs/screenshots/newtab.jpg)

Requires Node.js 20 or newer. Nothing else — no npm install, no dependencies.

> For learning and nostalgia only. Not affiliated with Google.

## Run it

**1. Install Node.js** (skip if you already have it) — https://nodejs.org/ or `brew install node`

**2. Get the project** — `git clone https://github.com/kintsink/chromexpage.git`, or use **Code → Download ZIP**

**3. Double-click the launcher for your system**

| OS | Double-click this file |
|---|---|
| macOS | `start-macos.command` |
| Windows | `start-windows.bat` |
| Linux | in a terminal: `bash start-linux.sh` |

The browser opens **http://chrome.localhost:8787/** by itself. When you see an XP desktop with a taskbar, it works.
Close the terminal window (or press Ctrl+C) to stop the server.

<details>
<summary>Manual start, or a different port</summary>

```bash
node server.js                  # http://localhost:8787/
PORT=9000 node server.js        # another port
```

The launchers run `node server.js --launch`: it starts the server, reuses one that is already running, moves to the
next port when another program holds it (up to 20 tries), and opens the default browser once listening.

If `chrome.localhost` does not open, try http://localhost:8787/ . Safari may not resolve `*.localhost` subdomains and
falls back to no-proxy mode; Chrome, Edge or Firefox are recommended.
</details>

## Features

- XP desktop, taskbar and Start menu, with Chrome 1.0 tabs, toolbar and bookmarks bar
- Multiple windows: drag, 8-way resize, minimize / maximize / close, all animated
- Address-bar suggestions, back / forward, bookmarks, history, New Tab page, zoom
- The lock icon shows the site's real TLS certificate
- Chinese and English UI, switchable in Options; websites open in the UI's language
- Clear local history from Options
- Zero dependencies: Node.js 20+ and nothing else

## Command-line options

| Flag | Meaning |
|---|---|
| `--launch` | launcher mode (see above) |
| `--log` | log one line per proxied request |
| `--allow-private` | allow loopback and private-network targets. Scripts on proxied pages can then reach services **running on this machine**, not just your LAN — use with care |
| `PORT=…` | port, or the starting port with `--launch` |

The macOS and Linux launchers also accept `CX_LOG=1` to enable logging.

## How it works

```
browser
  └─ http://chrome.localhost:8787/                        UI (index.html)
       └─ <iframe> http://example.com.https.chrome.localhost:8787/
            └─ server.js ──fetch──> https://example.com/
```

- Every site gets its own `*.chrome.localhost` subdomain, so relative paths, cookies and localStorage stay per site.
  For example `https://example.com/` → `http://example.com.https.chrome.localhost:8787/`,
  and `http://localhost:3000/` → `http://localhost.p3000.http.chrome.localhost:8787/`
- The proxy strips headers that forbid embedding (`X-Frame-Options`, CSP, …) and rewrites redirects and cookie domains.
- A small bridge script injected into every HTML page reports URL, title, favicon, hovered links and new-window requests
  to the UI over `postMessage`; the UI only accepts messages from `*.chrome.localhost`.
- `top.location` / `parent.location` in inline scripts become `window.location`, so frame-busting redirect pages stay
  inside the tab.

## Screenshots

| Browsing the real web | Certificate viewer |
|---|---|
| ![Wikipedia open in a tab, with the XP-style toolbar and tab strip above it](docs/screenshots/browsing.jpg) | ![TLS certificate details for developer.mozilla.org, opened from the lock icon](docs/screenshots/certificate.jpg) |

| Multiple windows and the About box |
|---|
| ![Two overlapping browser windows on the XP desktop, with the About Google Chrome dialog showing version 1.0.154.36](docs/screenshots/about.jpg) |

## Safety

- The server listens on `127.0.0.1` only, and serves the UI only for `localhost` / `127.0.0.1` / `chrome.localhost`
  (a DNS-rebinding guard).
- Loopback and private-network targets are refused by default. Each name is resolved exactly once and the connection that
  follows reuses that answer, so a name cannot answer "public" to the check and "private" to the connection itself.
- The certificate endpoint (`/?cert=`) requires the token from the UI page and answers 403 without it. Cross-origin reads
  are opened to the UI's own hostnames only. It returns real certificate fields, so it must not be usable as a port prober
  by other programs or web pages.
- `/__ping` needs the token too, so only a UI this server handed out can detect the proxy. Another program opening the
  same address gets a page without a token, falls back to no-proxy mode, and does not borrow your proxy.
- Proxied pages run in a sandboxed iframe and cannot navigate the UI away.

### The UI token

Every UI page load gets a fresh random token baked into the page (`<html data-cx-token="…">`), and the server accepts
only tokens it handed out. Older ones stop working once you reopen the UI; the last 8 stay valid, so several UI tabs can
be open at once.

That is how "only a UI this server handed out may use the proxy" is implemented: no other program and no web page can
obtain this token.

## Known limitations

- **Google**: Google flags proxied requests as unusual traffic and shows a CAPTCHA that does not support
  `*.chrome.localhost`, so its homepage and search pages are embedded directly instead (Google allows embedding with
  `igu=1`). Searching works fully, but sites opened from the results are not proxied either: those that allow embedding
  (e.g. Wikipedia) display, those that forbid it (e.g. Reddit) fail to load, and the address bar does not follow.
  Cmd/Ctrl-click a result to open it in a new browser tab.
- **Other search engines**: DuckDuckGo (default), Baidu and Bing go through the proxy; DuckDuckGo may ask for a check
  after many searches.
- **Shared process**: pages and the UI share one browser process, so a runaway page script freezes the UI too.
- **SPAs and logins**: sites relying on cross-site cookies, service workers or WebSockets may be incomplete.
- **Safari**: may not resolve `*.localhost` subdomains and falls back to no-proxy mode. Prefer Chrome, Edge or Firefox.
- **New Tab thumbnails**: generated from the domain name, not real screenshots.
- **Switching language** reloads the UI and closes open tabs.

## Files

```
server.js              local server: UI + proxy + certificate lookup
index.html             the whole UI (HTML + CSS + JS, single file)
start-macos.command    macOS launcher
start-windows.bat      Windows launcher
start-linux.sh         Linux launcher
LAUNCHERS.md           launcher guide
LANGUAGES.md           language guide
CHANGELOG.md           changelog
LICENSE                MIT license
docs/                  Simplified Chinese translations
docs/screenshots/      screenshots used in this README
```

## Test status

- `node --check` covers both sources; the UI script is syntax-checked on its own as well.
- The server's pure helpers (address mapping, cookie rewriting, bridge injection, error codes, token checks) have
  94 assertions.
- The proxy path is exercised with real requests: a PNG fetched through the proxy matches the direct download byte for
  byte, `Range` returns 206, redirects and `Set-Cookie` are rewritten, and private targets are refused.
- The UI is driven in headless Chrome: New Tab, browsing, the lock icon, the certificate dialog, the error page,
  multiple windows, minimize and the language switch, with no console errors.
- **Not tested**: the Windows and Linux launchers are syntax-checked only and have never run on real machines;
  Safari's `*.localhost` fallback path is untested.

## License

MIT — see [LICENSE](LICENSE).