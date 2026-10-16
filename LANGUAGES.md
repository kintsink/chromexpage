# Languages

[English](LANGUAGES.md) · [简体中文](docs/languages.zh-CN.md)

The UI is available in English and Simplified Chinese.

## Switching

Wrench menu → **Options** → **Language** → **OK**. The UI reloads and **open tabs and windows are closed**
(bookmarks, history and settings are kept).

## Default language

On first use it follows the browser language: Chinese for a Chinese browser, English for everything else.
A manual choice is remembered.

The preference lives in the localStorage key `cx.lang`. You can also change it from the DevTools console:

```js
localStorage.setItem('cx.lang', '"en"'); location.reload();   // English
localStorage.setItem('cx.lang', '"zh"'); location.reload();   // Simplified Chinese
```

## What is translated

Window buttons, toolbar tooltips, menus, the New Tab page, the History page, the bookmarks bar, the Options /
About / Clear data / Certificate dialogs, and date and time formats.

## The language of websites

The proxy asks websites for the UI's language (it rewrites `Accept-Language`). Sites that pick a language
automatically — such as the Wikipedia front page redirect, MDN or DuckDuckGo — therefore open in English with an
English UI and in Chinese with a Chinese UI. Pages are not machine-translated; single-language sites are unaffected.

The UI tells the proxy its language through a `cx_lang` cookie on `chrome.localhost`. The proxy reads it and never
forwards it to websites.

The default New Tab shortcuts are plain domains chosen by UI language:

| Chinese UI | English UI |
|---|---|
| zh.wikipedia.org | en.wikipedia.org |
| www.baidu.com | www.bbc.com (Baidu has no English edition) |
| www.bing.com | duckduckgo.com (Bing redirects by region to its Chinese edition regardless of language) |
| developer.mozilla.org | developer.mozilla.org (opens in English automatically) |

The other shortcuts are the same in both languages. The proxy's error page ("This webpage is not available")
follows the UI language too.

## Adding a language

Add a table to `MESSAGES` in `index.html` (missing keys fall back to Chinese), then add the new code to the
language dropdown in `optionsDialog()` and to the check in `lang.current`.