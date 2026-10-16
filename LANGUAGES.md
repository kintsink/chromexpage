# 多语言 / Languages

> 这份与 [`多语言功能说明.md`](多语言功能说明.md) 内容相同，两个名字都能打开。
> Same document as [`多语言功能说明.md`](多语言功能说明.md); either name works.

界面支持中文和英文。
The UI is available in Chinese and English.

## 如何切换 / How to switch

扳手菜单 →「选项」→「界面语言」→「确定」。界面会刷新，**已打开的标签页和窗口会关闭**（书签、历史记录、设置都会保留）。
Wrench menu → Options → Language → OK. The UI reloads and **open tabs and windows are closed**
(bookmarks, history and settings are kept).

## 默认语言 / Default language

第一次打开时跟随浏览器语言：浏览器是中文就用中文，其他一律英文。手动选过以后会记住。
On first use it follows the browser language: Chinese for a Chinese browser, English otherwise.
A manual choice is remembered.

偏好保存在 localStorage 的 `cx.lang` 键里，也可以在开发者工具控制台里改：
The preference lives in the localStorage key `cx.lang`; you can also change it from the DevTools console:

```js
localStorage.setItem('cx.lang', '"en"'); location.reload();   // 英文 / English
localStorage.setItem('cx.lang', '"zh"'); location.reload();   // 中文 / Chinese
```

## 哪些内容会翻译 / What is translated

窗口按钮、工具栏提示、菜单、新标签页、历史记录页、书签栏、选项 / 关于 / 清除数据 / 证书对话框、日期和时间格式。
Window buttons, toolbar tooltips, menus, the New Tab page, the History page, the bookmarks bar, the Options /
About / Clear data / Certificate dialogs, and date and time formats.

## 网站的语言 / Language of websites

界面是什么语言，代理就向网站要什么语言（改写请求里的 `Accept-Language`）。所以会按语言自动切换的网站，比如维基百科首页跳转、MDN、DuckDuckGo，在英文界面下打开英文版，在中文界面下打开中文版。网站本身不会被翻译；只有一种语言的网站不受影响。
The proxy asks websites for the UI's language (it rewrites `Accept-Language`). Sites that pick a language
automatically, such as MDN or DuckDuckGo, therefore open in English with an English UI and in Chinese with a
Chinese UI. Pages are not machine-translated; single-language sites are unaffected.

界面通过 `chrome.localhost` 上的 `cx_lang` Cookie 把语言告诉代理；这个 Cookie 只给代理看，不会发给网站。
The UI tells the proxy its language through a `cx_lang` cookie on `chrome.localhost`; the proxy reads it and never
forwards it to websites.

新标签页的默认快捷方式都是纯域名，按界面语言选择：
The default New Tab shortcuts are plain domains chosen by UI language:

| 中文界面 / Chinese UI | 英文界面 / English UI |
|---|---|
| zh.wikipedia.org | en.wikipedia.org |
| www.baidu.com | www.bbc.com（百度没有英文版 / Baidu has no English edition） |
| www.bing.com | duckduckgo.com（必应按地区跳到中文国内版，语言设置管不住 / Bing redirects by region to its Chinese edition regardless of language） |
| developer.mozilla.org | developer.mozilla.org（自动是英文版 / opens in English automatically） |

其余快捷方式两种语言相同。代理的错误页（"此网页无法访问"）也跟随界面语言。
The other shortcuts are the same in both languages. The proxy's error page ("This webpage is not available")
follows the UI language too.

## 添加新语言 / Adding a language

在 `index.html` 的 `MESSAGES` 里加一份语言表（缺的键会回退到中文），然后在 `optionsDialog()` 的语言下拉框和 `lang.current` 的校验里加上新代码。
Add a table to `MESSAGES` in `index.html` (missing keys fall back to Chinese), then add the new code to the
language dropdown in `optionsDialog()` and to the check in `lang.current`.
