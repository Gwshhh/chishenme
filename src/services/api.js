import { APP_CONFIG } from '../../config.js';
import { normalizeFood } from '../core/model.js';

async function fetchJson(url, { signal, timeout = 10000, fetchImpl = fetch } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, timeout);
    try {
        const response = await fetchImpl(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store', headers: { Accept: 'application/json' } });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || '服务暂不可用，请稍后重试');
        return data;
    } catch (error) {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        if (controller.signal.aborted) throw new Error('请求超时，请检查网络后重试');
        if (error instanceof TypeError) throw new Error('无法连接服务，请检查网络后重试');
        throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export function createApi({ config: appConfig = APP_CONFIG, fetchImpl = fetch } = {}) {
    let base = null;
    let development = false;
    let capabilities = { nearby: false, weather: false };
    let pending = null, settled = false, connectionError = '';
    const discover = async () => {
        try {
            const config = appConfig.apiBase ? appConfig : await fetchJson(new URL('../../runtime-config.json', import.meta.url), { timeout: 5000, fetchImpl });
            development = config.development === true;
            base = null;
            capabilities = { nearby: false, weather: false };
            connectionError = '';
            if (!config.apiBase) return capabilities;
            const parsed = new URL(config.apiBase, new URL('../../', import.meta.url));
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid API address');
            base = parsed.href.endsWith('/') ? parsed : new URL(`${parsed.href}/`);
            const data = await fetchJson(new URL('config', base), { timeout: 8000, fetchImpl });
            capabilities = { nearby: data.nearby === true, weather: data.weather === true };
        } catch {
            base = null;
            capabilities = { nearby: false, weather: false };
            connectionError = '暂时连接不上附近店铺服务，请稍后重试';
        } finally { settled = true; }
        return capabilities;
    };
    const ensureReady = ({ retry = false } = {}) => {
        if (pending) return pending;
        if (settled && (!retry || capabilities.nearby && !connectionError)) return Promise.resolve(capabilities);
        pending = discover().finally(() => { pending = null; });
        return pending;
    };
    const ready = ensureReady();
    const request = async (route, position, options = {}) => {
        await ensureReady({ retry: true });
        if (!base || !capabilities[route]) throw new Error(connectionError || (route === 'nearby' ? '附近店铺服务尚未启用，可前往外卖平台查看' : '天气服务暂不可用'));
        const url = new URL(route, base);
        url.searchParams.set('lat', String(position.latitude));
        url.searchParams.set('lon', String(position.longitude));
        if (options.level) url.searchParams.set('level', String(options.level));
        return fetchJson(url, { signal: options.signal, timeout: route === 'nearby' ? 28000 : 10000, fetchImpl });
    };
    return {
        ready,
        ensureReady,
        get capabilities() { return capabilities; },
        get connectionError() { return connectionError; },
        get development() { return development; },
        async nearby(position, options) {
            const data = await request('nearby', position, options);
            if (!Array.isArray(data.places)) throw new Error('附近店铺数据格式异常');
            return { ...data, places: data.places.map(normalizeFood).filter(Boolean) };
        },
        weather: (position, options) => request('weather', position, options),
    };
}

export function locate() {
    return new Promise((resolve, reject) => {
        if (!window.isSecureContext || !navigator.geolocation) { reject(new Error('定位需要 HTTPS 或 localhost，请在安全地址打开')); return; }
        navigator.geolocation.getCurrentPosition(position => resolve(position.coords), error => reject(new Error({ 1: '定位权限未开启，可在浏览器设置中允许后重试', 2: '暂时无法确定位置，请重试', 3: '定位超时，请移至信号较好的位置后重试' }[error.code] || '定位失败，请重试')), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    });
}
