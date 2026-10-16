#!/usr/bin/env node
'use strict';
// Chrome XP 复刻版的本地服务：同一个端口既提供界面，也充当网页代理。
// Local server for the Chrome XP replica: one port serves the UI and also acts as the web proxy.
//
//   界面 UI       http://chrome.localhost:8787/
//   代理 Proxy    http://<主机名 host>[.p<端口 port>].<http|https>.chrome.localhost:8787/<路径 path>
//
// 每个被访问的网站都映射到自己的 *.chrome.localhost 子域名，因此相对路径、根路径、
// Cookie、localStorage 都按网站隔离，行为和真实浏览器基本一致。
// Every visited site gets its own *.chrome.localhost subdomain, so relative paths, root paths,
// cookies and localStorage stay isolated per site, much like a real browser.
//
// 代理会去掉 X-Frame-Options / CSP 等禁止嵌入的响应头，并往 HTML 里注入一小段桥接脚本，
// 把地址、标题、链接悬停等信息通过 postMessage 告诉外层界面。
// The proxy strips headers that forbid embedding (X-Frame-Options, CSP, ...) and injects a small
// bridge script into HTML that reports URL, title, hovered links etc. to the UI via postMessage.
//
// 用法 / Usage
//   node server.js                    默认端口 8787 / default port 8787
//   PORT=9000 node server.js          换端口 / another port
//   node server.js --launch           一键启动脚本用：复用已运行的实例、端口被占自动换、打开浏览器
//                                     used by the launchers: reuse a running instance, skip busy ports, open the browser
//   node server.js --log              每个代理请求打一行日志 / log every proxied request
//   node server.js --allow-private    允许代理本机与内网地址（有风险）：被代理的网页因此也能访问
//                                     这台机器上跑的服务，不只是内网主机，慎用
//                                     allow loopback and private-network targets (risky): proxied pages can
//                                     then reach services running on this machine too, not just the LAN

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const dns = require('node:dns');              // 回调式解析，下面的 pinnedLookup 要接管它 / callback API, taken over below
const dnsPromises = require('node:dns/promises');   // 界面侧不用，resolvePublic 在这里查 / used by resolvePublic
// 接管之前的解析函数：接管之后 dns.lookup 就指向 pinnedLookup 自己了，兜底必须用这个
// The resolver as it was before the hook; afterwards dns.lookup points at pinnedLookup itself, so the
// fallback has to use this one.
const rawDnsLookup = dns.lookup;
const tls = require('node:tls');
const { Readable } = require('node:stream');
const crypto = require('node:crypto');

// ================================================================ 配置 / Configuration
const PORT = Number(process.env.PORT) || 8787;
const BIND = '127.0.0.1';
const SUFFIX = '.chrome.localhost';
const UI_HOSTS = new Set(['chrome.localhost', 'localhost', '127.0.0.1']);
// 默认禁止代理本机 / 内网地址；--allow-private 放开（被代理网页的脚本就能访问你的内网，慎用）
// Private / loopback targets are blocked by default; --allow-private lifts this
// (scripts on proxied pages could then reach your local network, so use with care).
const ALLOW_PRIVATE = process.argv.includes('--allow-private');
const ACCESS_LOG = process.argv.includes('--log');   // 每个代理请求打一行 / one line per proxied request
const TIMEOUT_MS = 30000;
// 界面页每次打开都现取一个令牌，代理只服务自己亲手发出的那份界面：别的程序推开的页面拿不到令牌，
// 也就不会连上代理。见 serveUi / servePing。
// A fresh token is minted for every UI page load, and the proxy only serves the UI it handed out itself:
// a page opened by some other program never gets a token and therefore never reaches the proxy.
const UI_TOKEN_HEADER = 'x-cx-token';
// DNS 重绑定窗口的关法：每个名字只解析一次，之后短时间内的连接直接复用那份解析结果，
// 域名来不及在「判公网」和「真连上」之间改答内网地址。见 resolvePublic / pinnedLookup。
// Closing the DNS-rebinding window: each name is resolved once and the next connection or two reuse
// that answer, so a name cannot answer "public" to the check and "private" to the connection itself.
// See resolvePublic / pinnedLookup.
const PIN_TTL_MS = 3000;
const PIN_MAX = 256;
// 保留最近发出的几个令牌：同时开多个界面标签页时，先开的那几个不会失效
// The last few tokens stay valid, so several UI tabs can be open at once
const UI_TOKENS_MAX = 8;
let uiTokens = [];
const newUiToken = () => { const t = crypto.randomBytes(16).toString('hex'); uiTokens.push(t); if (uiTokens.length > UI_TOKENS_MAX) uiTokens.shift(); return t; };
/** 常量时间比较，避免用时间差猜令牌 / Constant-time compare, so a token cannot be guessed from timing */
function sameToken(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
/**
 * 这个请求带的是不是本服务发出的界面令牌？
 * Does this request carry a token this server handed out?
 * 头或查询串都行：查询串是为了让请求保持「简单请求」，界面万一跑在 localhost 而不是
 * chrome.localhost 上时不会触发一次跨域预检。
 * Header or query string both work: the query form keeps the request simple, so no CORS preflight
 * happens if the UI is served from localhost rather than chrome.localhost.
 */
function hasUiToken(req) {
  if (!uiTokens.length) return false;
  let token = req.headers[UI_TOKEN_HEADER];
  if (typeof token !== 'string') token = null;
  if (token === null) {
    try { token = new URL(req.url, 'http://x').searchParams.get('t'); } catch { token = null; }
  }
  return typeof token === 'string' && uiTokens.some((t) => sameToken(t, token));
}
// 名字 -> 最近一次解析结果 / name -> the most recent answer for it
const dnsPins = new Map();
// 界面语言 -> 发给网站的 Accept-Language / UI language -> Accept-Language sent to sites
const UI_ACCEPT_LANGUAGE = { en: 'en-US,en;q=0.9', zh: 'zh-CN,zh;q=0.9,en;q=0.6' };

// 不转发给上游的请求头 / Request headers not forwarded upstream
const DROP_REQ = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length',
  'accept-encoding', 'te', 'origin', 'referer', 'proxy-connection', 'proxy-authorization']);

// 不返回给浏览器的响应头 / Response headers not passed back to the browser
const DROP_RES = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive',
  'set-cookie', 'x-frame-options', 'content-security-policy', 'content-security-policy-report-only',
  'strict-transport-security', 'cross-origin-opener-policy', 'cross-origin-embedder-policy',
  'cross-origin-resource-policy', 'permissions-policy', 'report-to', 'nel', 'alt-svc']);

// ================================================================ 地址映射 / Address mapping

/**
 * 解析代理子域名 / Parse a proxy subdomain: "www.example.com.https.chrome.localhost:8787"
 * @returns {{ scheme, host, hostname, origin, label } | null}
 */
function parseHost(hostHeader) {
  const h = String(hostHeader || '').replace(/:\d+$/, '').toLowerCase();
  if (!h.endsWith(SUFFIX)) return null;
  const parts = h.slice(0, -SUFFIX.length).split('.');
  const scheme = parts.pop();
  if (scheme !== 'http' && scheme !== 'https') return null;
  let port = '';
  if (/^p\d+$/.test(parts[parts.length - 1] || '')) port = ':' + parts.pop().slice(1);
  if (!parts.length || parts.some((p) => !p)) return null;
  const hostname = parts.join('.');
  return { scheme, hostname, host: hostname + port, origin: `${scheme}://${hostname}${port}`,
    label: `${port ? '.p' + port.slice(1) : ''}.${scheme}${SUFFIX}` };
}

/** URL 对象 -> 代理地址 / URL object -> proxy URL */
function toProxyUrl(u, localPort) {
  return `http://${u.hostname}${u.port ? '.p' + u.port : ''}.${u.protocol.slice(0, -1)}${SUFFIX}:${localPort}` +
    u.pathname + u.search + u.hash;
}

/**
 * 代理地址 -> 真实地址；不是代理地址时返回 null。
 * Proxy URL -> real URL; null when the input is not a proxy URL.
 * 不打日志：Origin 为 "null"（沙箱 / 隐私跳转）是正常情况。
 * No logging here: an Origin of "null" (sandboxed / privacy redirects) is a normal case.
 */
function toRealUrl(proxied) {
  try {
    const u = new URL(proxied);
    const site = parseHost(u.host);
    return site ? site.origin + u.pathname + u.search + u.hash : null;
  } catch {
    return null;
  }
}

// ================================================================ 安全 / Safety: no loopback or LAN targets

/** 判断是否为内网或本机 IP / Is this a private or loopback IP? */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const s = ip.toLowerCase();
  if (s.startsWith('::ffff:')) return isPrivateIp(s.slice(7));
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s);
}

/**
 * 解析目标地址、确认是公网，并把结果记下来供紧随其后的连接使用。
 * 关键在于只解析这一次：以前先解析判私网、再交给 fetch 重新解析，两次之间域名可以改答内网地址
 * （DNS 重绑定）；现在连接直接复用这份结果。
 * Resolve the target, make sure it is public, and remember the answer for the connection that follows.
 * Resolving once is the point: previously the check resolved the name and the connection resolved it
 * again, so a name could answer public first and private second (DNS rebinding); now the connection
 * reuses this answer.
 */
async function resolvePublic(hostname) {
  if (ALLOW_PRIVATE) return;
  const addrs = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIPv6(hostname) ? 6 : 4 }]
    : await dnsPromises.lookup(hostname, { all: true });   // DNS 失败在这里抛出，和以前一样落到错误页 / DNS failures throw here, as before
  if (!addrs.length) {
    const err = new Error('no address');
    err.code = 'ENOTFOUND';
    throw err;
  }
  if (addrs.some((a) => isPrivateIp(a.address))) {
    const err = new Error('private address blocked');
    err.code = 'CX_PRIVATE';
    throw err;
  }
  rememberPin(hostname, addrs);
}

/** 记下这次解析，供 pinnedLookup 短时间复用 / Remember this answer for pinnedLookup to reuse briefly */
function rememberPin(hostname, addrs) {
  const key = hostname.toLowerCase();
  dnsPins.delete(key);
  dnsPins.set(key, { addrs, until: Date.now() + PIN_TTL_MS });
  if (dnsPins.size > PIN_MAX) dnsPins.delete(dnsPins.keys().next().value);
}

/** 这个进程里所有出站连接共用的 lookup：命中刚才那份解析就直接用，否则现解析
 *  The lookup shared by every outbound connection in this process: reuse a fresh pin, otherwise resolve now */
function pinnedLookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = undefined; }
  const key = String(hostname).toLowerCase();
  const pin = dnsPins.get(key);
  if (pin && pin.until > Date.now()) {
    const all = pin.addrs.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
    if (options && options.all) return process.nextTick(() => callback(null, all));
    const one = (options && options.family && all.find((a) => a.family === options.family)) || all[0];
    return process.nextTick(() => callback(null, one.address, one.family));
  }
  return rawDnsLookup(hostname, Object.assign({}, options), callback);
}

// ================================================================ 桥接脚本 / Bridge script
// bridge() 会被序列化后注入每个被代理的 HTML 页面，在网页里运行（不是在 Node 里）。
// bridge() is serialized and injected into every proxied HTML page; it runs in the page, not in Node.

/* eslint-disable */
function bridge() {
  if (window.__cxBridge) return;
  window.__cxBridge = true;
  var SUFFIX = '.chrome.localhost', PORT = location.port ? ':' + location.port : '';

  // ---- 地址转换 / Address conversion ----

  /** 代理地址 -> 真实地址 / proxy URL -> real URL */
  function real(u) {
    try {
      var x = new URL(u, location.href);
      if (!x.hostname.endsWith(SUFFIX)) return x.href;
      var p = x.hostname.slice(0, -SUFFIX.length).split('.'), scheme = p.pop();
      var port = /^p\d+$/.test(p[p.length - 1]) ? ':' + p.pop().slice(1) : '';
      return scheme + '://' + p.join('.') + port + x.pathname + x.search + x.hash;
    } catch (e) {
      return String(u);
    }
  }

  /** 是否为外站 http(s) 地址（没走代理）/ Is this an http(s) URL that is not proxied? */
  function foreign(u) {
    try {
      var x = new URL(u, location.href);
      return /^https?:$/.test(x.protocol) && !x.hostname.endsWith(SUFFIX) && x.hostname.charAt(0) !== '[';
    } catch (e) {
      return false;
    }
  }

  /** 真实地址 -> 代理地址 / real URL -> proxy URL */
  function prox(u) {
    try {
      var x = new URL(u, location.href);
      if (!foreign(x.href)) return x.href;
      return 'http://' + x.hostname + (x.port ? '.p' + x.port : '') + '.' + x.protocol.slice(0, -1) + SUFFIX + PORT +
        x.pathname + x.search + x.hash;
    } catch (e) {
      return u;
    }
  }

  // ---- 消息通道 / Message channel ----

  // 只有标签页的顶层文档才向外层界面汇报 / Only a tab's top document reports to the UI
  var main = false;
  try { main = window.parent !== window && window.parent === window.top; } catch (e) {}

  // 注意：不要改写 window.parent。广告 / 统计脚本常用 for (w = window; w !== w.top; w = w.parent)
  // 往上找顶层窗口，parent 被改成自己以后这个循环永远到不了 top，会把整个界面卡死（time.is 实测）。
  // Never override window.parent. Ad / analytics scripts walk up with
  // for (w = window; w !== w.top; w = w.parent); if parent points back at itself the loop never reaches
  // top and freezes the whole UI (observed on time.is).

  function post(type, data) {
    if (!main) return;
    data = data || {};
    data.__cx = type;
    try { window.top.postMessage(data, '*'); } catch (e) {}
  }

  /** 上报标题和图标 / Report title and favicon */
  function meta() {
    try {
      var l = document.querySelector('link[rel~="icon"]');
      post('meta', { url: real(location.href), title: document.title, icon: l ? l.href : location.origin + '/favicon.ico' });
    } catch (e) {}
  }

  // ---- 生命周期 / Lifecycle ----

  post('hello', { url: real(location.href) });
  document.addEventListener('DOMContentLoaded', function () {
    meta();
    try {
      var t = document.querySelector('title');
      if (t && window.MutationObserver) {
        new MutationObserver(meta).observe(t, { childList: true, characterData: true, subtree: true });
      }
    } catch (e) {}
  });
  window.addEventListener('load', meta);
  window.addEventListener('pagehide', function () { post('leaving'); });
  window.addEventListener('mousedown', function () { post('focus'); }, true);

  // ---- 单页应用的地址变化 / Single-page-app URL changes ----

  ['pushState', 'replaceState'].forEach(function (k) {
    try {
      var orig = history[k];
      history[k] = function () {
        var r = orig.apply(this, arguments);
        post('spa', { url: real(location.href), replace: k === 'replaceState' });
        setTimeout(meta, 0);
        return r;
      };
    } catch (e) {}
  });
  window.addEventListener('hashchange', function () { post('spa', { url: real(location.href), replace: false }); });
  window.addEventListener('popstate', function () {
    post('spa', { url: real(location.href), replace: true });
    setTimeout(meta, 0);
  });

  // ---- 跨站请求改走代理，目标站看到真实 Origin / Route cross-site requests through the proxy ----

  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string' || input instanceof URL) {
          if (foreign(input)) input = prox(input);
        } else if (input && input.url && foreign(input.url)) {
          input = new Request(prox(input.url), input);
        }
      } catch (e) {}
      return origFetch.call(this, input, init);
    };
  }
  try {
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) {
      var a = [].slice.call(arguments);
      try { if (foreign(u)) a[1] = prox(u); } catch (e) {}
      return origOpen.apply(this, a);
    };
  } catch (e) {}

  // ---- 脚本写的 Cookie 不能写到公共的上层域名 / Script cookies must not land on a shared parent domain ----
  // 网页脚本常把 Cookie 写到"根域名"上；在代理下它们按 www.example.com.https.chrome.localhost 算出来的根域名
  // 是 chrome.localhost，于是这些 Cookie（多是跟踪 ID）会被所有经代理的网站共享。这里把这类 domain 去掉，
  // 让 Cookie 只属于当前网站；指向本网站自己域名（如 example.com.https.chrome.localhost）的照常保留。
  // Page scripts often put cookies on the "root domain"; behind the proxy, computed from
  // www.example.com.https.chrome.localhost, that root is chrome.localhost, so those cookies (mostly tracking IDs)
  // would be shared by every proxied site. Such domain attributes are dropped so the cookie stays with this site;
  // domains belonging to the site itself (e.g. example.com.https.chrome.localhost) are kept.
  try {
    var cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (cookieDesc && cookieDesc.set) {
      var SITE_DOMAIN = /^[^.]+\.[^.]+(?:\.[^.]+)*\.(?:p\d+\.)?https?\.chrome\.localhost$/;
      Object.defineProperty(Document.prototype, 'cookie', {
        configurable: true, enumerable: cookieDesc.enumerable, get: cookieDesc.get,
        set: function (v) {
          v = String(v).replace(/;\s*domain\s*=\s*([^;]*)/ig, function (m, d) {
            d = d.trim().replace(/^\./, '').toLowerCase();
            var h = location.hostname;
            return (h === d || h.slice(-d.length - 1) === '.' + d) && SITE_DOMAIN.test(d) ? m : '';
          });
          cookieDesc.set.call(this, v);
        },
      });
    }
  } catch (e) {}

  // Service Worker 在代理下不可靠，直接禁用 / Service workers are unreliable behind the proxy
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = function () {
        return Promise.reject(new Error('Service Worker is disabled in the proxy'));
      };
    }
  } catch (e) {}

  // ---- 链接与新窗口 / Links and new windows ----

  // 新窗口 -> 外层界面的新标签页 / New windows become tabs in the UI
  window.open = function (u) {
    if (u) { try { post('open', { url: real(new URL(u, location.href).href) }); } catch (e) {} }
    return null;
  };

  function linkOf(e) {
    return e.target && e.target.closest ? e.target.closest('a[href], area[href]') : null;
  }
  function wantsNewTab(a) {
    try {
      var t = (a.target || ((document.querySelector('base[target]') || {}).target) || '').toLowerCase();
      if (!t || t === '_self' || t === '_top' || t === '_parent') return false;
      if (t !== '_blank' && document.querySelector('iframe[name="' + CSS.escape(a.target) + '"]')) return false;
      return true;
    } catch (e) {
      return false;
    }
  }
  // 冒泡阶段处理：网页自己的点击处理先跑 / Bubble phase, so the page's own handlers run first
  window.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0) return;
    var a = linkOf(e);
    if (!a || !/^https?:/i.test(a.href)) return;
    if (wantsNewTab(a) || e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      post('open', { url: real(a.href) });
      return;
    }
    var t = (a.target || '').toLowerCase();
    if (foreign(a.href) || t === '_top' || t === '_parent') {
      e.preventDefault();
      location.href = prox(a.href);
    }
  });
  window.addEventListener('auxclick', function (e) {
    if (e.defaultPrevented || e.button !== 1) return;
    var a = linkOf(e);
    if (a && /^https?:/i.test(a.href)) {
      e.preventDefault();
      post('open', { url: real(a.href) });
    }
  });

  // ---- 表单提交到别的网站 / Forms that submit to other sites ----

  function fixForm(f, sub) {
    try {
      var holder = sub && sub.hasAttribute && sub.hasAttribute('formaction') ? sub : f;
      var attr = holder === f ? 'action' : 'formaction';
      var act = new URL(holder.getAttribute(attr) || location.href, document.baseURI).href;
      if (foreign(act)) holder.setAttribute(attr, prox(act));
      if (f.getAttribute('target')) f.setAttribute('target', '_self');
      if (sub && sub.getAttribute && sub.getAttribute('formtarget')) sub.setAttribute('formtarget', '_self');
    } catch (e) {}
  }
  window.addEventListener('submit', function (e) {
    if (!e.defaultPrevented && e.target && e.target.tagName === 'FORM') fixForm(e.target, e.submitter);
  });
  try {
    var origSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () { fixForm(this); return origSubmit.call(this); };
  } catch (e) {}

  // ---- 兜底：脚本直接跳到别的网站 / Fallback: scripts navigating to another site ----

  if (window.navigation && navigation.addEventListener) {
    navigation.addEventListener('navigate', function (e) {
      try {
        if (e.hashChange || e.downloadRequest || (e.destination && e.destination.sameDocument)) return;
        if (foreign(e.destination.url) && e.cancelable && !e.formData) {
          e.preventDefault();
          var to = prox(e.destination.url);
          setTimeout(function () { location.href = to; }, 0);
        }
        post('leaving');
      } catch (err) {}
    });
  }

  // ---- 状态栏显示悬停的链接 / Hovered link in the status bubble ----

  var hov = '';
  function setHov(u) { if (u !== hov) { hov = u; post('hover', { url: u }); } }
  document.addEventListener('mouseover', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    setHov(a && /^https?:/i.test(a.href) ? real(a.href) : '');
  }, true);
  document.addEventListener('mouseleave', function () { setHov(''); });
}
/* eslint-enable */

// 注入前去掉整行注释（省体积），再转成纯 ASCII：页面可能是任何编码，而注入是按字节做的
// Before injection, drop full-line comments (size) and make it pure ASCII: pages may use any
// encoding and injection works on raw bytes
const BRIDGE = `<script>(${bridge.toString()
  .replace(/^[ \t]*\/\/.*\n/gm, '')
  .replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))})();</script>`;

const CSP_META = /<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi;

// 跳转页常写 parent.location.replace(...) / top.location = ...。外层是我们的界面，沙箱会拦下这种跳转，
// 页面就停在原地；所以把内联脚本里的 top.location / parent.location 改成 window.location。
// Redirect pages often use parent.location.replace(...) / top.location = .... The outer window is our UI
// and the sandbox blocks that, leaving the page stuck, so inline scripts get them rewritten to window.location.
const INLINE_SCRIPT = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi;
const OUTER_LOCATION = /(?<![\w$.])(?:(?:window|self)\.)?(?:top|parent)\.location\b/g;

function retargetOuterNavigation(html) {
  return html.replace(INLINE_SCRIPT, (all, open, body, close) =>
    (body.includes('.location') ? open + body.replace(OUTER_LOCATION, 'window.location') + close : all));
}

/**
 * 往 HTML 注入桥接脚本。按字节处理（latin1 往返不改任何字节），所以不必关心页面编码。
 * Inject the bridge into HTML. Works on bytes (a latin1 round trip changes none), so page encoding doesn't matter.
 */
function injectBridge(buf) {
  let s = retargetOuterNavigation(buf.toString('latin1').replace(CSP_META, ''));
  const m = /<head(\s[^>]*)?>/i.exec(s) || /<html(\s[^>]*)?>/i.exec(s) || /<!doctype[^>]*>/i.exec(s);
  const at = m ? m.index + m[0].length : 0;
  s = s.slice(0, at) + BRIDGE + s.slice(at);
  return Buffer.from(s, 'latin1');
}

// ================================================================ 错误页 / Error page (early-Chrome style)

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 错误页语言：优先跟随界面语言（cx_lang Cookie），没有时看浏览器语言
// Error page language: the UI language (cx_lang cookie) first, otherwise the browser language
const ERR_TEXT = {
  zh: {
    title: '无法访问', h1: '此网页无法访问。',
    body: (u) => `位于 <b class="u">${u}</b> 的网页可能暂时无法连接，或者它已被永久移动到新的网址。`,
    tips: '下面是一些建议：', retry: '稍后<a href="">重新载入</a>此网页。', spell: '检查网址是否拼写正确。',
    orig: '以下是原始错误信息', err: '错误',
    CX_PRIVATE: '出于安全考虑，代理默认不访问本机或内网地址。启动时加上 --allow-private 可以放开。',
    DNS: '无法解析服务器的 DNS 地址。', REFUSED: '服务器拒绝了连接。', RESET: '连接被重置。',
    TIMEOUT: '操作超时。', CERT: '服务器的安全证书有问题。',
  },
  en: {
    title: 'is not available', h1: 'This webpage is not available.',
    body: (u) => `The webpage at <b class="u">${u}</b> might be temporarily down or it may have moved permanently to a new web address.`,
    tips: 'Here are some suggestions:', retry: '<a href="">Reload</a> this web page later.', spell: 'Check that the address is spelled correctly.',
    orig: 'Below is the original error message', err: 'Error',
    CX_PRIVATE: 'For safety the proxy does not reach loopback or private-network addresses by default. Start it with --allow-private to allow them.',
    DNS: 'Unable to resolve the server\'s DNS address.', REFUSED: 'The server refused the connection.', RESET: 'The connection was reset.',
    TIMEOUT: 'The operation timed out.', CERT: 'The server\'s security certificate has a problem.',
  },
};
function pickLang(req) {
  const ui = takeUiLangCookie(req.headers.cookie).lang;
  if (ui === 'zh' || ui === 'en') return ui;
  return /^zh/i.test(String(req.headers['accept-language'] || '')) ? 'zh' : 'en';
}

/** 底层错误 -> [Chrome 错误码, 说明] / Low-level error -> [Chrome error code, explanation] */
function describeError(err, lang) {
  const T = ERR_TEXT[lang] || ERR_TEXT.en;
  const code = err.code || (err.cause && err.cause.code) || err.name;
  const e = (n, id) => `${T.err} ${n} (net::${id})`;
  if (code === 'CX_PRIVATE') return [e(109, 'ERR_ADDRESS_UNREACHABLE'), T.CX_PRIVATE];
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return [e(105, 'ERR_NAME_NOT_RESOLVED'), T.DNS];
  if (code === 'ECONNREFUSED') return [e(102, 'ERR_CONNECTION_REFUSED'), T.REFUSED];
  if (code === 'ECONNRESET') return [e(101, 'ERR_CONNECTION_RESET'), T.RESET];
  if (code === 'AbortError' || code === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') {
    return [e(118, 'ERR_CONNECTION_TIMED_OUT'), T.TIMEOUT];
  }
  if (/CERT|SSL|TLS/i.test(String(code))) return [e(501, 'ERR_INSECURE_RESPONSE'), T.CERT];
  return [e(2, 'ERR_FAILED'), String((err.cause && err.cause.message) || err.message || code)];
}

/** 目标地址（未带语言与超时上下文时用）/ The target URL of a request, for helpers that have no context yet */
const target_ = (site) => site.origin + '/';

/** 这个请求要的是一份文档吗？/ Is this request asking for a document? */
function isDocRequest(req) {
  const dest = req.headers['sec-fetch-dest'];
  if (dest) return dest === 'iframe' || dest === 'document' || dest === 'frame';
  return /text\/html/.test(req.headers.accept || '');
}

/**
 * 什么都没写出去之前就失败时的 502（解析阶段用）。写出去以后再失败由 proxy 里的 fail 处理。
 * The 502 used when a request fails before anything is written (the resolve stage). Once headers are
 * on the wire the failure path inside proxy() takes over.
 */
function proxyFail(req, res, target, err, isDoc) {
  const lang = pickLang(req);
  if (res.headersSent || res.destroyed) return res.destroy();
  if (isDoc) {
    res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(errorPage(target, err, lang));
  }
  res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
  return res.end(describeError(err, lang).join(' '));
}

/** Chrome 风格错误页（也注入桥接脚本，界面才能拿到地址）/ Chrome-style error page (bridged so the UI gets the URL) */
function errorPage(target, err, lang) {
  const T = ERR_TEXT[lang] || ERR_TEXT.en;
  const [code, detail] = describeError(err, lang);
  const u = esc(target);
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8">${BRIDGE}<title>${u} ${T.title}</title><style>
body{margin:0;padding:46px 40px;background:#fff;color:#000;font:13px/1.6 Helvetica,Arial,"Microsoft YaHei","PingFang SC",sans-serif}
#box{max-width:560px;margin:0 auto;padding:18px 24px 20px;background:#eef3fb;border:1px solid #b8c8e0;border-radius:6px}
h1{margin:0 0 10px;font-size:16px}p{margin:8px 0}ul{margin:6px 0;padding-left:22px}
#more{margin-top:14px;padding-top:10px;border-top:1px solid #c9d6ea;color:#555;font-size:12px}b.u{word-break:break-all}
</style></head><body><div id="box"><h1>${T.h1}</h1>
<p>${T.body(u)}</p>
<p>${T.tips}</p><ul><li>${T.retry}</li><li>${T.spell}</li></ul>
<div id="more">${T.orig}<br><b>${esc(code)}</b>: ${esc(detail)}</div></div></body></html>`;
}

// ================================================================ 代理 / Proxy

/**
 * Cookie 改写：把 Domain 换成对应的代理域名，浏览器就会按子域名正常保存。
 * Cookie rewrite: map Domain onto the matching proxy domain so the browser stores it per subdomain.
 */
function rewriteCookie(sc, site) {
  const parts = sc.split(';').map((s) => s.trim()).filter(Boolean);
  const out = [parts[0]];
  const prefixed = /^__(Secure|Host)-/i.test(parts[0]);
  for (const attr of parts.slice(1)) {
    const eq = attr.indexOf('=');
    const key = (eq < 0 ? attr : attr.slice(0, eq)).trim().toLowerCase();
    if (key === 'domain') {
      const d = attr.slice(eq + 1).trim().replace(/^\./, '').toLowerCase();
      if (d && (site.hostname === d || site.hostname.endsWith('.' + d))) out.push(`Domain=${d}${site.label}`);
    } else if (key === 'samesite' || key === 'partitioned' || (key === 'secure' && !prefixed)) {
      // 代理是 http，这些属性会让 Cookie 存不下来；__Secure-/__Host- 前缀的保留 Secure
      // The proxy is plain http, where these would make the cookie unstorable; prefixed cookies keep Secure
      continue;
    } else {
      out.push(attr);
    }
  }
  return out.join('; ');
}

/**
 * 从 Cookie 头里取出界面语言 cx_lang，并返回去掉它之后的其余 Cookie。
 * Pull the UI-language cookie cx_lang out of a Cookie header and return the remaining cookies.
 */
function takeUiLangCookie(header) {
  let lang = '';
  const rest = String(header || '').split(';').map((s) => s.trim()).filter((c) => {
    if (!c.startsWith('cx_lang=')) return Boolean(c);
    lang = c.slice('cx_lang='.length);
    return false;
  });
  return { lang, rest: rest.join('; ') };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * 转发请求到真实网站，改写响应头，往 HTML 里注入桥接脚本。
 * Forward the request to the real site, rewrite response headers, inject the bridge into HTML.
 */
async function proxy(req, res, site, localPort) {
  // 先解析并确认公网，解析结果会被下面的连接直接复用 / resolve and vet first; the connection below reuses it
  try {
    await resolvePublic(site.hostname);
  } catch (err) {
    return proxyFail(req, res, target_(site), err, isDocRequest(req));
  }
  const target = site.origin + req.url;
  const isDoc = isDocRequest(req);
  const lang = pickLang(req);

  const ac = new AbortController();
  // 文档会整份读进内存再注入，计时要覆盖到读完；其他资源拿到响应头就停表（之后是流式传输）
  // Documents are buffered before injection, so their timer covers the body too; other resources
  // stop the timer once headers arrive (they are streamed afterwards)
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  res.on('close', () => { clearTimeout(timer); if (!res.writableEnded) ac.abort(); });

  const fail = (err) => {
    clearTimeout(timer);
    if (res.headersSent || res.destroyed) return res.destroy();
    if (isDoc) {
      res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(errorPage(target, err, lang));
    }
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end(describeError(err, lang).join(' '));
  };

  let upstream;
  let sentOrigin = '';
  try {
    // ---- 请求头 / Request headers ----
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!DROP_REQ.has(k) && !k.startsWith('sec-')) headers[k] = v;
    }
    // 界面语言：界面在 chrome.localhost 上写的 cx_lang Cookie 会带到每个代理子域名。
    // 界面是什么语言，就向网站要什么语言；这个 Cookie 只给代理看，不转发给网站。
    // UI language: the cx_lang cookie set by the UI on chrome.localhost reaches every proxy subdomain.
    // Ask sites for the UI's language; the cookie is for the proxy only and is not forwarded.
    const { lang: uiLang, rest: siteCookies } = takeUiLangCookie(req.headers.cookie);
    if (siteCookies) headers.cookie = siteCookies; else delete headers.cookie;
    if (UI_ACCEPT_LANGUAGE[uiLang]) headers['accept-language'] = UI_ACCEPT_LANGUAGE[uiLang];
    // Origin / Referer 还原成真实地址 / Restore Origin and Referer to real addresses
    if (req.headers.origin) {
      const o = toRealUrl(req.headers.origin + '/');
      sentOrigin = o ? new URL(o).origin : req.headers.origin;
      headers.origin = sentOrigin;
    }
    const ref = req.headers.referer && toRealUrl(req.headers.referer);
    if (ref) headers.referer = ref;
    // 文档会被改写，不能让上游回 304 / Documents get rewritten, so never let upstream answer 304
    if (isDoc) {
      delete headers['if-none-match'];
      delete headers['if-modified-since'];
    }

    // ---- 发起请求 / Send ----
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const init = {
      method: req.method, headers, redirect: 'manual',
      body: hasBody ? await readBody(req) : undefined,
    };
    try {
      upstream = await fetch(target, Object.assign({ signal: ac.signal }, init));
    } catch (err) {
      // 连接偶尔会被掐断：没有请求体的请求可以安全重试一次
      // Connections sometimes drop: requests without a body are safe to retry once
      if (hasBody || ac.signal.aborted) throw err;
      upstream = await fetch(target, Object.assign({ signal: ac.signal }, init));
    }
  } catch (err) {
    return fail(err);
  }

  // ---- 响应头 / Response headers ----
  const out = {};
  upstream.headers.forEach((v, k) => { if (!DROP_RES.has(k)) out[k] = v; });

  const cookies = upstream.headers.getSetCookie().map((c) => rewriteCookie(c, site));
  if (cookies.length) out['set-cookie'] = cookies;

  // 重定向地址改成代理地址 / Point redirects at the proxy
  if (out.location) {
    try {
      const u = new URL(out.location, target);
      if (u.protocol === 'http:' || u.protocol === 'https:') out.location = toProxyUrl(u, localPort);
    } catch { /* 无法解析就原样保留 / keep as is when unparsable */ }
  }

  // CORS：上游认的是真实 Origin，浏览器认的是代理 Origin，这里翻译回去
  // CORS: upstream approved the real Origin, the browser expects the proxy Origin, so translate it back
  if (sentOrigin && out['access-control-allow-origin'] === sentOrigin) {
    out['access-control-allow-origin'] = req.headers.origin;
  }

  // ---- HTML：注入桥接脚本 / HTML: inject the bridge ----
  const type = out['content-type'] || '';
  if (isDoc && /text\/html|application\/xhtml/i.test(type) && upstream.body && req.method !== 'HEAD') {
    let body;
    try {
      body = injectBridge(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      return fail(err);
    }
    clearTimeout(timer);
    // 同站请求带完整来源（代理会还原），跨站不带，避免图片防盗链误伤
    // Full referrer for same-site requests (the proxy restores it), none cross-site, so hotlink guards don't misfire
    out['referrer-policy'] = 'same-origin';
    // 页面被改写过，不让浏览器拿旧版本做缓存校验 / Rewritten page: no revalidation against stale copies
    out['cache-control'] = 'no-store';
    delete out.etag;
    delete out['last-modified'];
    res.writeHead(upstream.status, out);
    return res.end(body);
  }

  // ---- 其他资源：流式转发 / Everything else: stream through ----
  clearTimeout(timer);
  res.writeHead(upstream.status, out);
  if (!upstream.body || req.method === 'HEAD') return res.end();
  Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
}

// ================================================================ 证书查询 / Certificate lookup

/**
 * 和目标站做一次 TLS 握手，取回证书字段（给锁图标的证书对话框用）。
 * Do one TLS handshake with the target and return certificate fields (for the lock icon's dialog).
 */
function fetchCert(hostname, port) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: 8000 },
      () => {
        try {
          const c = socket.getPeerCertificate();
          socket.end();
          if (!c || !Object.keys(c).length) return reject(new Error('no certificate'));
          // subject / issuer 形如 { C: 'US', O: '…', CN: '…' } / look like { C, O, CN }
          const cn = (name) => (c[name] && typeof c[name].CN === 'string' ? c[name].CN : '');
          resolve({
            subject: cn('subject'),
            issuer: cn('issuer'),
            subjectAltName: typeof c.subjectaltname === 'string' ? c.subjectaltname.split(',').map((x) => x.trim()) : [],
            validFrom: c.valid_from || '',
            validTo: c.valid_to || '',
            serialNumber: c.serialNumber || '',
            fingerprint: c.fingerprint256 || c.fingerprint || '',
            protocol: socket.getProtocol() || '',
            cipher: (socket.getCipher() || {}).name || '',
            bits: c.bits || 0,
          });
        } catch (err) { reject(err); }
      });
    socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
    socket.on('error', reject);
  });
}

/** 只给界面主机名的来源开跨域读取的口子 / Open cross-origin reads only to origins on the UI hostnames */
function uiCorsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin) return {};
  try {
    if (UI_HOSTS.has(new URL(origin).hostname)) return { 'access-control-allow-origin': origin, vary: 'origin' };
  } catch { /* 解析不了的 Origin 一律不给 / an unparsable Origin gets nothing */ }
  return {};
}

/**
 * GET /?cert=<host>[:port]，只对界面开放。
 * GET /?cert=<host>[:port], available to the UI only.
 * 必须带上界面页里的令牌：CORS 只能拦「读响应」，拦不住「发请求」，所以鉴权必须在发请求之前。
 * 有了令牌，本机别的程序、以及任何网页都借不到这个接口去探测端口或读取证书。
 * The token from the UI page is required: CORS only stops a response from being *read*, never a request
 * from being *sent*, so the check has to happen before the handshake. With it, no other program on this
 * machine and no web page can borrow this endpoint to probe ports or read certificates.
 * 同样不碰内网——除了界面自己那个 ping 主机名，它只是用来判断代理是否在工作。
 * Private targets are still refused, except the UI's own ping hostname, which only answers whether the
 * proxy is alive.
 */
async function serveCert(req, res) {
  const json = (status, obj) => {
    res.writeHead(status, Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, uiCorsHeaders(req)));
    res.end(JSON.stringify(obj));
  };
  if (!hasUiToken(req)) return json(403, { error: 'forbidden' });
  const host = new URL(req.url, 'http://x').searchParams.get('cert') || '';
  const m = /^([\w.-]+)(?::(\d{1,5}))?$/.exec(host);
  const port = m && m[2] ? Number(m[2]) : 443;
  if (!m || port < 1 || port > 65535) return json(400, { error: 'bad host' });
  // 界面探测用的 ping.<scheme>.chrome.localhost 就指向本服务，而本服务是明文 http，没有证书可谈，
  // 硬做 TLS 握手只会卡到超时。这里在解析域名之前就直接回一份「空证书」，界面据此显示「本机代理，无证书」。
  // ping.<scheme>.chrome.localhost points at this very server, which speaks plain http: there is no
  // certificate to read and a forced handshake would just hang until the timeout. Answer with an empty
  // one, before any name resolution, so the UI can say "local proxy, no certificate".
  if (m[1] === 'ping') {
    return json(200, { echo: true, subject: '', issuer: '', subjectAltName: [], validFrom: '', validTo: '',
      serialNumber: '', fingerprint: '', protocol: '', cipher: '', bits: 0 });
  }
  try {
    await resolvePublic(m[1]);
    json(200, await fetchCert(m[1], port));
  } catch (err) {
    json(502, { error: err.code === 'CX_PRIVATE' ? 'private address blocked' : String(err.message || err) });
  }
}

/**
 * GET /__ping?t=<令牌>，界面用它判断代理是否可用；令牌不对就 403。
 * GET /__ping?t=<token>: the UI uses this to detect the proxy; a wrong token is refused.
 * 跨域读取仍然放行，但只给界面主机名的来源（界面在 chrome.localhost 上调 ping.https.chrome.localhost）。
 * Cross-origin reads are still allowed, but only to origins on the UI hostnames (the UI calls
 * ping.https.chrome.localhost from chrome.localhost).
 */
function servePing(req, res) {
  const token = new URL(req.url, 'http://x').searchParams.get('t') || '';
  const ok = Boolean(uiTokens.length) && uiTokens.some((t) => sameToken(t, token));
  res.writeHead(ok ? 200 : 403, Object.assign({ 'content-type': 'text/plain', 'cache-control': 'no-store' }, uiCorsHeaders(req)));
  res.end(ok ? 'cx-ok' : 'forbidden');
}

// ================================================================ 入口 / Entry point

/**
 * 界面页：每次打开都换一个新令牌，注入到 <html> 上，并记住它。
 * 令牌只存在于本服务的进程内存里，别的程序（哪怕同样打开 localhost:8787）拿不到，因此它打开的副本
 * 检测不到代理、只会退化成「无代理模式」，不会借用你的代理。
 * The UI page: mint a fresh token per load, inject it into <html> and remember it. The token lives only in
 * this process's memory, so any other program opening localhost:8787 has a copy without it: that copy fails
 * to detect the proxy and falls back to no-proxy mode instead of borrowing yours.
 */
function serveUi(req, res) {
  const pathname = req.url.split('?')[0];
  if (pathname !== '/' && pathname !== '/index.html') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
    if (err) {
      console.error('[serveUi]', err.message);
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('index.html 缺失 / index.html is missing');
    }
    const token = newUiToken();
    const html = data.toString('utf8').replace(/<html(\s[^>]*)?>/i, (m) => m.replace('<html', `<html data-cx-token="${token}"`));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html);
  });
}

// 让本进程所有出站连接（代理转发 + 证书握手）共用带钉住的解析，堵住「先判后连」之间的重绑定窗口。
// 只影响这一个进程，dns.lookup 的默认行为对调用方不变。
// Every outbound connection in this process (proxy forwarding and TLS handshakes) goes through the pinned
// resolver, closing the rebinding window between the check and the connect. It only affects this process,
// and dns.lookup keeps working normally for everyone else who calls it.
dns.lookup = pinnedLookup;

const server = http.createServer((req, res) => {
  const hostHeader = req.headers.host || '';
  const localPort = (/:(\d+)$/.exec(hostHeader) || [])[1] || server.address().port;

  const site = parseHost(hostHeader);
  // 界面用 ping.https.chrome.localhost 探测代理是否可用；它不是真实网站，交给健康检查。
  // The UI probes the proxy as ping.https.chrome.localhost; it is not a real site, so it goes to the
  // health check rather than the proxy. Real sites keep their own /__ping path.
  if (site && site.hostname === 'ping') return void servePing(req, res);
  if (site) {
    if (ACCESS_LOG) {
      const t0 = Date.now();
      res.on('close', () => console.log(`${new Date().toISOString().slice(11, 23)} ${res.statusCode} ${req.method} ${site.origin}${req.url} ${Date.now() - t0}ms`));
    }
    return proxy(req, res, site, localPort).catch((err) => {
      console.error('[proxy]', site.origin + req.url, err && err.message);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      if (!res.writableEnded) res.end();
    });
  }

  // 只响应本机的几个固定主机名，防止 DNS 重绑定 / Only fixed local hostnames, to stop DNS rebinding
  if (!UI_HOSTS.has(hostHeader.replace(/:\d+$/, '').toLowerCase())) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Forbidden');
  }
  // 界面主机名上本来就不可能有 /__ping 这个页面，所以健康检查放在这里：被代理的网站因此能照常拥有自己的
  // /__ping 路径，而页面里的令牌保证只有本服务发出的界面才探测得到代理。
  // No real page lives at /__ping on the UI hostnames, so the health check goes here: proxied sites keep
  // their own /__ping path, and the token in the page means only a UI this server handed out can detect it.
  if (req.url.startsWith('/__ping')) return void servePing(req, res);
  if (req.url.startsWith('/?cert=')) return void serveCert(req, res);
  serveUi(req, res);
});

// ================================================================ 启动 / Startup
// --launch（三个一键启动脚本都用它）：端口上已经是本服务就只打开浏览器；端口被别的程序占用就往后找；
// 启动成功后自动打开浏览器。不带 --launch 时行为和以前一样：端口被占就报错退出。
// --launch (used by all three launchers): if this server already runs on the port, just open the browser;
// if another program holds the port, try the next one; open the browser once listening.
// Without --launch nothing changes: a busy port is an error.
const LAUNCH = process.argv.includes('--launch');
const MAX_PORT_TRIES = 20;

async function isOurs(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/__ping`, { signal: AbortSignal.timeout(1000) });
    return (await r.text()) === 'cx-ok';
  } catch {
    return false;
  }
}

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => { server.off('listening', onListening); reject(err); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, BIND);
  });
}

/** 用系统默认浏览器打开 / Open in the system default browser */
function openBrowser(url) {
  const { spawn } = require('node:child_process');
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true })
      .on('error', () => console.log(`请手动打开 / Please open manually: ${url}`))
      .unref();
  } catch {
    console.log(`请手动打开 / Please open manually: ${url}`);
  }
}

async function start() {
  let port = PORT;
  for (let i = 0; i < (LAUNCH ? MAX_PORT_TRIES : 1); i++, port++) {
    if (LAUNCH && await isOurs(port)) {
      console.log(`服务已经在运行（端口 ${port}），直接打开浏览器。`);
      console.log(`Already running on port ${port}; opening the browser.`);
      openBrowser(`http://localhost:${port}/`);
      return;
    }
    try {
      await listenOn(port);
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      if (!LAUNCH) {
        console.error(`端口 ${port} 已被占用，可以换一个：PORT=8899 node server.js`);
        console.error(`Port ${port} is in use; pick another one: PORT=8899 node server.js`);
        process.exit(1);
      }
      console.log(`端口 ${port} 被别的程序占用，换下一个… / Port ${port} is in use, trying the next one…`);
      continue;
    }
    console.log(`Chrome XP 复刻版已启动 / Chrome XP replica running: http://chrome.localhost:${port}/`);
    console.log(`如果打不开，试试 / If that does not open, try: http://localhost:${port}/`);
    if (ALLOW_PRIVATE) console.log('⚠ --allow-private：代理可访问内网地址 / the proxy can reach private-network addresses');
    if (LAUNCH) {
      console.log('关掉这个窗口或按 Ctrl+C 停止服务 / Close this window or press Ctrl+C to stop the server');
      // 界面自己会跳到 chrome.localhost / the UI redirects itself to chrome.localhost
      openBrowser(`http://localhost:${port}/`);
    }
    return;
  }
  console.error(`从 ${PORT} 起的 ${MAX_PORT_TRIES} 个端口都被占用，请手动指定，例如 PORT=9000`);
  console.error(`The ${MAX_PORT_TRIES} ports from ${PORT} are all in use; set one manually, e.g. PORT=9000`);
  process.exit(1);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
