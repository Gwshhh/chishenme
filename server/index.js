import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const listener = createApp({ amapKey: process.env.AMAP_KEY || '', allowedOrigin: process.env.ALLOWED_ORIGIN || '', development: process.argv.includes('--dev') });
const secure = process.env.HTTPS_KEY && process.env.HTTPS_CERT;
const server = secure ? https.createServer({ key: readFileSync(process.env.HTTPS_KEY), cert: readFileSync(process.env.HTTPS_CERT) }, listener) : http.createServer(listener);
server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用，请设置 PORT 后重试。` : `服务启动失败：${error.code || error.message}`);
    process.exitCode = 1;
});
server.listen(port, host, () => {
    console.log(`今天吃什么：http${secure ? 's' : ''}://${host}:${port}`);
    console.log(`附近店铺：${process.env.AMAP_KEY ? '已启用' : '未配置（本地功能正常）'}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
