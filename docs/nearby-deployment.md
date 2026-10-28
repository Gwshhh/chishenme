# 附近店铺部署与验收

修复版本：v3.2.3。店铺来源仍然是高德地图；GitHub Pages 通过独立的 Cloudflare Worker 调用，Node 本地预览继续使用同源 API。

## 配置与发布

`server/worker.js` 与 Node 服务共用 `server/providers.js` 的店铺归一化和 `server/validation.js` 的参数校验。`wrangler.jsonc` 定义服务名 `chishenme-api`、允许的网页来源 `https://gwshhh.github.io` 和每 IP 每分钟 40 次的限流绑定。执行区域通过 `placement.region = aws:ap-east-1` 配置在香港附近，减少跨洲连接高德造成的超时。

生产 API：`https://chishenme-api.gwshhh007.workers.dev/api/`。

1. `npm ci` 安装固定版本的开发工具。
2. 确保本地 `.env` 已有可用的高德 Web 服务 `AMAP_KEY`。
3. 首次或登录过期时执行 `npx wrangler login --scopes account:read user:read workers_scripts:write`。
4. 执行 `npm run deploy:api -- --dry-run` 检查打包，再执行 `npm run deploy:api`。
5. 部署脚本只把 `AMAP_KEY` 上传为 Worker Secret；临时文件位于忽略的 `.wrangler/` 下，命令结束后删除。脚本验证 HTTPS、准确 CORS、当前版本与固定公开地点的真实高德结果，通过后才更新 `runtime-config.json`。
6. 将前端及生成的运行配置发布到 GitHub Pages，然后执行 `npm run verify:live`。

`npm run verify:live` 不使用浏览器定位，查询固定公开测试地点。它会拒绝空 API 地址、未启用的服务、错误的跨域配置、无真实店铺结果或过期的网页版本，避免只检查页面能打开就宣布功能可用。

如果浏览器授权成功而命令行报 `fetch failed`，检查当前终端的 `HTTP_PROXY` / `HTTPS_PROXY` 是否与本机浏览器代理一致；`NO_PROXY` 应包含 `localhost,127.0.0.1,::1`。Node 原生 fetch 在支持的版本可通过 `NODE_USE_ENV_PROXY=1` 使用该终端代理。无需把机器代理地址写进项目配置。

## 功能行为

- 能力检测请求暂时失败后，点击「定位找店」会重新连接；不会一直把临时断网显示为「未启用」。
- 服务未配置与临时连接失败分别提示，内置菜单和计划持续可用。
- 连接阶段取消后，不再弹出迟到的定位权限请求。
- 高德第一页遇到短暂网络错误时自动重试一次；后续页失败保留已找到的结果，不重复发起无界限请求。
- 服务端拒绝未知来源、异常参数和重定向；地图密钥不出现在前端、API 响应和部署输出中。
- 查询结果短时保存在服务内存，响应为 `Cache-Control: no-store`。前端 Service Worker 不缓存 API 或运行配置，运行配置和 API 请求也显式绕过浏览器 HTTP 缓存。

## 本地验收

- 45 项 Node 测试通过，包含 Worker 适配、参数与来源校验、限流、并发合并、错误恢复及重定向边界。
- 14 项桌面/手机定向浏览器测试通过，包含跨域接入、连接失败后的重试、取消、子目录与离线回归。
- 静态校验通过：53 个脚本、38 个离线资源、91 张菜图与 273 个 WebP。
- 当前 Cloudflare 版本 `9ca2f0bc-6813-4bac-b71a-e892b7d3f101`。调整执行区域后，两处固定公开坐标的连续三次请求均返回 60 家高德店铺，`partial=false`；这组请求耗时约 2.7–4.7 秒，不作为所有设备的性能保证。
- 在实际 GitHub Pages 来源的浏览器中，直接请求该 API 已返回 200 与 60 家店，跨域访问正常。完整网页操作验收在前端发布后另记。
