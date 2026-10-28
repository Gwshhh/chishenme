import { setTimeout as delay } from 'node:timers/promises';
import { Buffer } from 'node:buffer';
import { cleanText, normalizeFood, safeImage } from '../src/core/model.js';

export class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

export async function fetchJson(url, { fetchImpl = fetch, signal, timeout = 6000 } = {}) {
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
    try {
        // Workers supports manual redirects; rejecting non-2xx below also prevents
        // provider credentials from being forwarded to a redirected destination.
        const response = await fetchImpl(url, { signal: combined, headers: { Accept: 'application/json' }, redirect: 'manual' });
        if (!response.ok) throw new HttpError(502, '上游服务暂时不可用，请稍后重试');
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
            size += chunk.byteLength;
            if (size > 1024 * 1024) throw new HttpError(502, '上游响应过大');
            chunks.push(Buffer.from(chunk));
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(combined.aborted ? 504 : 502, combined.aborted ? '服务响应超时，请重试' : '暂时无法连接数据服务，请重试');
    }
}

// WGS-84 → GCJ-02, only inside mainland China's coordinate bounds.
export function toGCJ02(lat, lon) {
    if (lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lon, lat];
    const x = lon - 105, y = lat - 35, pi = Math.PI;
    let dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    dLat += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3;
    dLat += (20 * Math.sin(y * pi) + 40 * Math.sin(y / 3 * pi)) * 2 / 3;
    dLat += (160 * Math.sin(y / 12 * pi) + 320 * Math.sin(y * pi / 30)) * 2 / 3;
    let dLon = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    dLon += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3;
    dLon += (20 * Math.sin(x * pi) + 40 * Math.sin(x / 3 * pi)) * 2 / 3;
    dLon += (150 * Math.sin(x / 12 * pi) + 300 * Math.sin(x / 30 * pi)) * 2 / 3;
    const rad = lat / 180 * pi;
    const magic = 1 - 0.00669342162296594323 * Math.sin(rad) ** 2;
    dLat = dLat * 180 / ((6378245 * (1 - 0.00669342162296594323) / magic ** 1.5) * pi);
    dLon = dLon * 180 / ((6378245 / Math.sqrt(magic) * Math.cos(rad)) * pi);
    return [lon + dLon, lat + dLat];
}

const cuisineRules = [[/咖啡/, '咖啡'], [/甜品|糕饼|蛋糕|冰淇淋|冷饮/, '甜品饮品'], [/快餐/, '快餐便当'], [/火锅/, '火锅'], [/烧烤|烤肉/, '烧烤'], [/海鲜/, '海鲜'], [/日本|寿司/, '日料'], [/韩国/, '韩餐'], [/西餐|披萨/, '西餐'], [/面|粉/, '米粉面馆']];

export function normalizePlaces(pois) {
    const unique = new Map();
    for (const poi of pois) {
        if (!poi || typeof poi !== 'object' || typeof poi.name !== 'string') continue;
        const category = cuisineRules.find(([pattern]) => pattern.test(String(poi.type || '')))?.[1] || '中餐';
        if (/酒吧|夜店|KTV|茶艺|网吧|棋牌|台球/i.test(`${poi.name} ${poi.type}`)) continue;
        const distance = typeof poi.distance === 'string' && poi.distance.trim() ? Number(poi.distance) : poi.distance;
        const address = cleanText(poi.address, 160);
        const photoCandidates = (Array.isArray(poi.photos) ? poi.photos : []).map(photo => typeof photo?.url === 'string' ? safeImage(photo.url.replace(/^http:/, 'https:')) : '').filter(Boolean);
        const food = normalizeFood({
            id: typeof poi.id === 'string' ? `amap:${poi.id}` : '', name: poi.name, category,
            description: address, address, image: photoCandidates[0], imageCandidates: photoCandidates, location: poi.location,
            sourceType: poi.type, isNearby: true, distance, meals: ['breakfast', 'lunch', 'dinner', 'night'], tags: [],
        });
        if (food) {
            const previous = unique.get(food.id);
            unique.set(food.id, previous ? normalizeFood({ ...previous, imageCandidates: [previous.image, ...(previous.imageCandidates || []), food.image, ...(food.imageCandidates || [])] }) : food);
        }
    }
    return [...unique.values()].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

export async function nearbyPlaces({ lat, lon, level, amapKey, fetchImpl, signal, pageDelay = 350 }) {
    if (!amapKey) throw new HttpError(503, '附近店铺服务尚未启用，可继续使用菜单或前往外卖平台');
    const settings = { 1: { limit: 60, radius: 1500, pages: 4 }, 2: { limit: 180, radius: 3000, pages: 9 }, 3: { limit: 360, radius: 5000, pages: 18 } }[level];
    const center = toGCJ02(lat, lon).map(n => n.toFixed(6)).join(',');
    const pois = [];
    let partial = false;
    let city = '';
    const request = async (path, query, retryInitial = false) => {
        const url = new URL(`https://restapi.amap.com/v3/${path}`);
        url.search = new URLSearchParams({ key: amapKey, ...query }).toString();
        let result;
        try { result = await fetchJson(url, { fetchImpl, signal }); }
        catch (error) {
            // A cold edge connection can time out once. Retry only the first page;
            // later-page failures still return already acquired restaurants.
            if (!retryInitial || signal?.aborted || ![502, 504].includes(error.status)) throw error;
            result = await fetchJson(url, { fetchImpl, signal });
        }
        if (result?.status !== '1') throw new HttpError(502, '地图服务暂不可用，请稍后重试');
        return result;
    };
    for (let page = 1; page <= settings.pages; page++) {
        try {
            if (page > 1 && pageDelay) await delay(pageDelay, undefined, { signal });
            const data = await request('place/around', { location: center, types: '050000', radius: String(settings.radius), sortrule: 'distance', offset: '25', extensions: 'all', page: String(page) }, page === 1);
            if (!Array.isArray(data.pois)) throw new HttpError(502, '地图返回的数据格式异常');
            pois.push(...data.pois);
            if (data.pois.length < 25 || normalizePlaces(pois).length >= settings.limit) break;
        } catch (error) {
            if (!pois.length || signal?.aborted) throw error;
            partial = true;
            break;
        }
    }
    try {
        if (pageDelay) await delay(pageDelay, undefined, { signal });
        const data = await request('geocode/regeo', { location: center, extensions: 'base' });
        const address = data.regeocode?.addressComponent;
        city = [cleanText(address?.city) || cleanText(address?.province), cleanText(address?.district)].filter(Boolean).join(' · ');
    } catch { /* City labels are optional; real restaurant results remain usable. */ }
    return { places: normalizePlaces(pois).slice(0, settings.limit), city, partial, radius: settings.radius, source: '高德地图' };
}

export function normalizeWeather(data) {
    const current = data?.current;
    if (!current || !Number.isFinite(current.temperature_2m) || !Number.isFinite(current.weather_code)) throw new HttpError(502, '天气数据暂不可用');
    const temp = current.temperature_2m, code = current.weather_code;
    const rain = (code >= 51 && code <= 86) || code >= 95;
    const description = code === 0 ? '晴' : code <= 3 ? '多云' : code <= 48 ? '雾' : code >= 95 ? '雷雨' : (code >= 71 && code <= 77) || code >= 85 ? '雪' : '雨';
    return { tempC: Math.round(temp), kind: rain ? 'rain' : temp >= 30 ? 'hot' : temp <= 8 ? 'cold' : 'mild', description };
}

export async function weatherAt({ lat, lon, fetchImpl, signal }) {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: String(lat), longitude: String(lon), current: 'temperature_2m,weather_code', timezone: 'auto' }).toString();
    return normalizeWeather(await fetchJson(url, { fetchImpl, signal }));
}
