# 多语言

**简体中文** · [English](../LANGUAGES.md)

界面支持中文和英文。

## 如何切换

扳手菜单 →「选项」→「界面语言」→「确定」。界面会刷新，**已打开的标签页和窗口会关闭**（书签、历史记录、设置都会保留）。

## 默认语言

第一次打开时跟随浏览器语言：浏览器是中文就用中文，其他一律英文。手动选过以后会记住。

偏好保存在 localStorage 的 `cx.lang` 键里，也可以在开发者工具控制台里改：

```js
localStorage.setItem('cx.lang', '"en"'); location.reload();   // 英文
localStorage.setItem('cx.lang', '"zh"'); location.reload();   // 中文
```

## 哪些内容会翻译

窗口按钮、工具栏提示、菜单、新标签页、历史记录页、书签栏、选项 / 关于 / 清除数据 / 证书对话框、日期和时间格式。

## 网站的语言

界面是什么语言，代理就向网站要什么语言（改写请求里的 `Accept-Language`）。所以会按语言自动切换的网站，比如维基
百科首页跳转、MDN、DuckDuckGo，在英文界面下打开英文版，在中文界面下打开中文版。网站本身不会被翻译；只有一种语言
的网站不受影响。

界面通过 `chrome.localhost` 上的 `cx_lang` Cookie 把语言告诉代理；这个 Cookie 只给代理看，不会发给网站。

新标签页的默认快捷方式都是纯域名，按界面语言选择：

| 中文界面 | 英文界面 |
|---|---|
| zh.wikipedia.org | en.wikipedia.org |
| www.baidu.com | www.bbc.com（百度没有英文版） |
| www.bing.com | duckduckgo.com（必应按地区跳到中文国内版，语言设置管不住） |
| developer.mozilla.org | developer.mozilla.org（自动是英文版） |

其余快捷方式两种语言相同。代理的错误页（"此网页无法访问"）也跟随界面语言。

## 添加新语言

在 `index.html` 的 `MESSAGES` 里加一份语言表（缺的键会回退到中文），然后在 `optionsDialog()` 的语言下拉框和
`lang.current` 的校验里加上新代码。
