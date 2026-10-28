# 今天吃什么 · APP 图标

v3.2.1，2026-10-28。按用户要求重新设计并替换现有图标。

![APP 图标及小尺寸、系统遮罩预览](app-icon-preview.webp)

## 设计

暖珊瑚色底让食物主题在桌面上容易辨认，奶油白陶瓷碗以少量明暗表达质感。问号形蒸汽呼应「今天吃什么」。不使用文字、外部字体或品牌素材；这一图标为项目原生矢量绘制，没有调用图片生成 API。

设计源：[app-icon-master.svg](../assets/brand/app-icon-master.svg)。圆角浏览器图标与所有 PNG 均从同一来源导出，避免旧版 SVG 与 Pillow 手工重绘形状不同的问题。

## 文件

| 文件 | 用途 |
|---|---|
| `assets/brand/app-icon-master.svg` | 1024px 全出血矢量母版 |
| `icon-1024.png` | 1024px 全彩高清母版，不加入首页或离线预缓存 |
| `icon.svg` | 圆角 SVG，浏览器 favicon 与网页品牌，3,204 bytes |
| `icon-512.png` | PWA 安装图标及 Android maskable，90,732 bytes |
| `icon-192.png` | PWA 小图标，15,739 bytes |
| `apple-touch-icon.png` | iOS 180px 图标，14,096 bytes |
| `favicon-32.png` | 32px PNG favicon |
| `favicon.ico` | 16 / 32 / 48px 浏览器兼容图标 |

原生安装 PNG 均不透明且为完整方形，由系统施加圆角或圆形遮罩；主体通过中央 80% 安全圆检查。安装用 PNG 使用 256 色调色板减少体积，1024px 母版保留全彩。

## 重新导出

安装现有开发依赖 `npm ci`，准备 Pillow 及 Playwright 浏览器（Windows 默认使用本机 Edge），执行：

```sh
python gen_icon.py
```

`scripts/render-icon.mjs` 使用无界面浏览器渲染 SVG，Pillow 统一缩放、压缩及导出 ICO。不增加任何生产运行时依赖。

## 验证

- 31 项 Node 核心 / HTTP 测试通过。
- 12 项现有桌面 / 手机定向浏览器测试通过，覆盖 320px、200% 字号、WCAG AA 自动规则、子目录、离线与图片性能行为。未重复执行完整浏览器套件。
- 静态校验通过：46 个脚本、38 个离线资源、91 张菜图及其 273 个 WebP。
- 6 个网页与安装图标资源在 `/chishenme/` 子目录全部返回 200，MIME 正确。
- 查看图标预览，以及 1365px 桌面、390px 手机明暗截图；品牌分别为 42px / 38px，图片加载成功，无横向溢出或控制台错误。
- 这次为主会话图标与页面复核，没有独立代理审查。

manifest、图标链接和 shell 版本统一更新到 3.2.1。已安装网页接受页脚「有新版本，点击更新」后切换缓存；手机系统的桌面图标刷新时机由系统控制，仍显示旧图标时可重新添加到桌面。
