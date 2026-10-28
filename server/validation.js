import { HttpError } from './providers.js';

export function coordinates(query) {
    const number = (name, min, max) => {
        const value = query.get(name);
        if (query.getAll(name).length !== 1 || !value?.trim() || !/^-?\d+(\.\d+)?$/.test(value)) throw new HttpError(400, '请提供有效经纬度');
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new HttpError(400, '经纬度超出范围');
        return numeric;
    };
    return { lat: number('lat', -90, 90), lon: number('lon', -180, 180) };
}

export function searchLevel(query) {
    const level = Number(query.get('level') || 1);
    if (!Number.isInteger(level) || ![1, 2, 3].includes(level) || query.getAll('level').length > 1) throw new HttpError(400, '无效的附近搜索范围');
    return level;
}
