# Launcher guide

[English](LAUNCHERS.md) · [简体中文](docs/启动说明.zh-CN.md)

The three launchers all do the same two things: check that Node.js 20 or newer is installed, then run
`node server.js --launch`. Everything else — port selection, "already running" detection, opening the
browser — is handled by the server itself.

| OS | Double-click | Or from a terminal |
|---|---|---|
| macOS | `start-macos.command` | `./start-macos.command` |
| Windows | `start-windows.bat` | `start-windows.bat` |
| Linux | — | `bash start-linux.sh` |

## What the launchers do

1. Check that Node.js is installed and at least version 20; otherwise print install hints and keep the window open.
2. Run `node server.js --launch`, which:
   - starts the server if the port is free;
   - reuses an instance of this server that is already running (it just opens the browser);
   - moves to the next port when another program holds it — up to 20 tries;
   - once listening, opens the default browser (macOS `open`, Linux `xdg-open`, Windows `start`).

The launchers therefore depend on nothing but Node.js — no curl, nc, ss or netstat.

## Stopping

Close the terminal window, or press Ctrl+C. Closing the browser tab alone does not stop the server.

## Ports and logging

```bash
PORT=9000 "./start-macos.command"     # macOS
PORT=9000 bash start-linux.sh         # Linux
CX_LOG=1 bash start-linux.sh          # log every proxied request
```

```bat
:: Windows (cmd)
set PORT=9000
start-windows.bat
```

## Troubleshooting

- **"Node.js was not found"** — install Node.js 20 or newer: https://nodejs.org/
- **macOS refuses to open the .command file** — right-click → Open, or run `chmod +x "start-macos.command"` in Terminal.
  macOS quarantines downloaded scripts; the executable bit is kept in this repository, so a `git clone` works as is.
- **The browser did not open** — open the address printed in the terminal yourself (by default `http://localhost:8787/`).
- **`chrome.localhost` does not resolve** — use `http://localhost:8787/`; see Known limitations in the README.

## Test status

The macOS launcher and all three `--launch` paths (fresh start, reuse of a running instance, busy port) have been
tested on a real machine. The Linux and Windows launchers are syntax-checked only and have not been run on real machines.
