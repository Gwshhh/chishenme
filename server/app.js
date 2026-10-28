import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../src/core/model.js';
import { HttpError, nearbyPlaces, weatherAt } from './providers.js';
import { coordinates, searchLevel } from './validation.js';
export { coordinates } from './validation.js';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicFiles = new Set(['index.html', 'app.js', 'data.js', 'config.js', 'styles.css', 'sw.js', 'sw-assets.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-1024.png', 'apple-touch-icon.png', 'favicon.ico', 'favicon-32.png']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/vnd.microsoft.icon' };

export function createApp({ root = defaultRoot, amapKey = '', allowedOrigin = '', fetchImpl = fetch, now = Date.now, pageDelay = 350, development = false } = {}) {
    const cache = new Map(), clients = new Map(), pending = new Map();
    let inflight = 0;
    const json = (res, status, value) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(value));
    };
    const guardRate = req => {
        const key = req.socket.remoteAddress || 'unknown';
        const time = now();
        const entry = clients.get(key);
        if (!entry || time - entry.start > 60000) clients.set(key, { start: time, count: 1 });
        else if (++entry.count > 40) throw new HttpError(429, '请求较频繁，请一分钟后重试');
        if (clients.size > 1000) for (const [ip, value] of clients) { if (time - value.start > 60000 || clients.size > 1000) clients.delete(ip); }
    };
    const cachedRequest = async (key, loader) => {
        const hit = cache.get(key);
        if (hit && now() - hit.time < 300000) return hit.value;
        if (pending.has(key)) return pending.get(key);
        if (inflight >= 2) throw new HttpError(503, '服务正忙，请稍后重试');
        inflight++;
        const work = loader().then(value => {
            cache.set(key, { value, time: now() });
            while (cache.size > 100) cache.delete(cache.keys().next().value);
            return value;
        }).finally(() => { pending.delete(key); inflight--; });
        pending.set(key, work);
        return work;
    };

    return async (req, res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        const origin = req.headers.origin;
        const protocol = req.socket.encrypted ? 'https' : 'http';
        const ownOrigin = `${protocol}://${req.headers.host}`;
        try {
            if (origin && origin !== ownOrigin && origin !== allowedOrigin) throw new HttpError(403, '此来源未获允许');
            if (origin && origin === allowedOrigin) {
                res.setHeader('Access-Control-Allow-Origin', origin);
                res.setHeader('Vary', 'Origin');
            }
            if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' }); res.end(); return; }
            if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, OPTIONS'); throw new HttpError(405, '不支持此请求方式'); }
            let pathname;
            try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); } catch { throw new HttpError(400, '路径编码无效'); }
            if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part === '..' || part.startsWith('.'))) throw new HttpError(403, '禁止访问此路径');
            const url = new URL(req.url, 'http://localhost');
            if (pathname === '/api/config') { json(res, 200, { version: APP_VERSION, nearby: Boolean(amapKey), weather: true }); return; }
            if (pathname === '/api/health') { json(res, 200, { status: 'ok', version: APP_VERSION }); return; }
            if (pathname === '/api/nearby' || pathname === '/api/weather') {
                guardRate(req);
                const coords = coordinates(url.searchParams);
                const level = searchLevel(url.searchParams);
                if (pathname === '/api/nearby' && !amapKey) throw new HttpError(503, '附近店铺服务尚未启用，可继续使用菜单或前往外卖平台');
                const key = `${pathname}:${coords.lat.toFixed(4)}:${coords.lon.toFixed(4)}:${level}`;
                const data = await cachedRequest(key, () => {
                    const options = { ...coords, level, amapKey, fetchImpl, signal: AbortSignal.timeout(25000), pageDelay };
                    return pathname === '/api/nearby' ? nearbyPlaces(options) : weatherAt(options);
                });
                json(res, 200, data);
                return;
            }
            if (pathname.startsWith('/api/')) throw new HttpError(404, '接口不存在');
            // This small capability script is optional on static hosting (loaded only on request).
            if (pathname === '/runtime-config.json') { json(res, 200, { apiBase: '/api/', development }); return; }
            const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
            const allowed = publicFiles.has(relative) || /^src\/(?:core|services|ui|features)\/[a-z0-9-]+\.js$/.test(relative) || /^images_food\/(?:food_\d{2,3}\.jpg|optimized\/food_\d{2,3}-(?:160|480|960)\.webp)$/.test(relative);
            if (!allowed) throw new HttpError(404, '文件不存在');
            const file = path.resolve(root, relative);
            const actual = await realpath(file).catch(() => null);
            const actualRoot = await realpath(root);
            if (!actual || !actual.startsWith(actualRoot + path.sep)) throw new HttpError(404, '文件不存在');
            const info = await stat(actual);
            if (!info.isFile()) throw new HttpError(404, '文件不存在');
            const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
            const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': relative.startsWith('images_food/') ? 'public, max-age=86400' : 'no-cache', ETag: etag };
            if (relative === 'sw.js') headers['Service-Worker-Allowed'] = '/';
            if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
            const body = req.method === 'HEAD' ? null : await readFile(actual);
            res.writeHead(200, { ...headers, 'Content-Length': info.size });
            res.end(body);
        } catch (error) {
            if (!res.headersSent) json(res, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : '服务暂时不可用，请重试' });
            else res.end();
        }
    };
}
