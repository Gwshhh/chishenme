import { APP_VERSION } from '../src/core/model.js';
import { HttpError, nearbyPlaces, weatherAt } from './providers.js';
import { coordinates, searchLevel } from './validation.js';

// The edge adapter shares the same provider, normalization and validation as Node.
// Maps and coordinates stay in short-lived memory; they never enter a public cache.
export function createWorker({ fetchImpl = fetch, now = Date.now, pageDelay = 350 } = {}) {
    const cache = new Map(), pending = new Map(), clients = new Map();
    let inflight = 0;
    const guardRate = async (request, env) => {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (env.NEARBY_LIMITER) {
            const result = await env.NEARBY_LIMITER.limit({ key: ip });
            if (!result.success) throw new HttpError(429, '请求较频繁，请一分钟后重试');
            return;
        }
        // Also keeps local development and tests bounded without a Cloudflare binding.
        const time = now(), entry = clients.get(ip);
        if (!entry || time - entry.start >= 60000) clients.set(ip, { start: time, count: 1 });
        else if (++entry.count > 40) throw new HttpError(429, '请求较频繁，请一分钟后重试');
        while (clients.size > 1000) clients.delete(clients.keys().next().value);
    };
    const cachedRequest = (key, loader) => {
        const hit = cache.get(key);
        if (hit && now() - hit.time < 300000) return Promise.resolve(hit.value);
        if (pending.has(key)) return pending.get(key);
        if (inflight >= 2) throw new HttpError(503, '服务正忙，请稍后重试');
        inflight++;
        const work = Promise.resolve().then(loader).then(value => {
            cache.set(key, { value, time: now() });
            while (cache.size > 100) cache.delete(cache.keys().next().value);
            return value;
        }).finally(() => { pending.delete(key); inflight--; });
        pending.set(key, work);
        return work;
    };

    return async (request, env = {}) => {
        const url = new URL(request.url), origin = request.headers.get('Origin');
        const headers = new Headers({
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Vary': 'Origin',
        });
        const placement = request.headers.get('cf-placement');
        if (/^(?:local|remote)-[A-Z]{3}$/.test(placement || '')) headers.set('X-Worker-Placement', placement);
        const json = (status, value) => new Response(request.method === 'HEAD' ? null : JSON.stringify(value), { status, headers });
        try {
            if (origin && origin !== url.origin && origin !== env.ALLOWED_ORIGIN) throw new HttpError(403, '此来源未获允许');
            if (origin && origin === env.ALLOWED_ORIGIN) headers.set('Access-Control-Allow-Origin', origin);
            if (!['/api/config', '/api/health', '/api/nearby', '/api/weather'].includes(url.pathname)) throw new HttpError(404, '接口不存在');
            if (request.method === 'OPTIONS') {
                headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
                return new Response(null, { status: 204, headers });
            }
            if (!['GET', 'HEAD'].includes(request.method)) {
                headers.set('Allow', 'GET, HEAD, OPTIONS');
                throw new HttpError(405, '不支持此请求方式');
            }
            if (url.pathname === '/api/health') return json(200, { status: 'ok', version: APP_VERSION });
            if (url.pathname === '/api/config') return json(200, { version: APP_VERSION, nearby: Boolean(env.AMAP_KEY), weather: true });
            const coords = coordinates(url.searchParams), level = searchLevel(url.searchParams);
            if (url.pathname === '/api/nearby' && !env.AMAP_KEY) throw new HttpError(503, '附近店铺服务尚未启用，可继续使用菜单或前往外卖平台');
            await guardRate(request, env);
            const key = `${url.pathname}:${coords.lat.toFixed(4)}:${coords.lon.toFixed(4)}:${level}`;
            const data = await cachedRequest(key, () => {
                const options = { ...coords, level, amapKey: env.AMAP_KEY, fetchImpl, pageDelay, signal: AbortSignal.timeout(25000) };
                return url.pathname === '/api/nearby' ? nearbyPlaces(options) : weatherAt(options);
            });
            return json(200, data);
        } catch (error) {
            const status = error instanceof HttpError ? error.status : 500;
            if (status === 429) headers.set('Retry-After', '60');
            return json(status, { error: error instanceof HttpError ? error.message : '服务暂时不可用，请重试' });
        }
    };
}

export default { fetch: createWorker() };
