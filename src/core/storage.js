import { STORAGE_KEY, defaultData, validateData, LIMITS } from './model.js';
import { enrichLegacyFood } from './catalog.js';

function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
    }
    return value;
}

export function migrateLegacy(read) {
    const data = defaultData();
    const parse = (key, fallback) => {
        try { return JSON.parse(read(key)) ?? fallback; } catch { return fallback; }
    };
    const foods = key => {
        const items = parse(key, []);
        return Array.isArray(items) ? items.map(enrichLegacyFood).filter(Boolean) : [];
    };
    data.favorites = foods('favorites').slice(0, LIMITS.foods);
    data.customFoods = foods('customFoods').slice(0, LIMITS.foods);
    const override = foods('menuOverride').slice(0, LIMITS.foods);
    if (override.length) data.menuOverride = override;
    const history = parse('history', []);
    if (Array.isArray(history)) data.history = history.filter(item => item && Number.isFinite(item.timestamp) && item.timestamp > 0).slice(0, LIMITS.history).map((item, index) => ({
        id: `legacy:${item.timestamp}:${index}`, food: enrichLegacyFood(item), timestamp: item.timestamp, source: 'wheel', eaten: false,
    })).filter(item => item.food);
    if (read('avoidRepeat') !== null) data.preferences.avoidRepeat = read('avoidRepeat') === '1';
    if (read('fatigueDecay') !== null) data.preferences.fatigueDecay = read('fatigueDecay') !== '0';
    if (read('soundOn') !== null) data.settings.sound = read('soundOn') !== '0';
    if (read('theme')) data.settings.theme = read('theme');
    if (read('colorTheme')) data.settings.accent = read('colorTheme');
    data.settings.nearbyLevel = Number(read('nearbyLevel')) || 1;
    return validateData(data, { strict: false });
}

export function createStore({ storage, onWarning = () => {}, eventTarget } = {}) {
    let backend;
    let persisted = true;
    let damaged = null;
    let warningSent = false;
    const warn = message => { persisted = false; if (!warningSent) { warningSent = true; onWarning(message); } };
    try { backend = storage ?? globalThis.localStorage; } catch { warn('浏览器暂不允许保存数据。本次仍可使用，请在离开前导出备份。'); }
    const read = key => {
        try { return backend?.getItem(key) ?? null; }
        catch { warn('无法读取浏览器数据。本次仍可使用，请在离开前导出备份。'); return null; }
    };
    let state;
    const saved = read(STORAGE_KEY);
    if (saved) {
        try { state = validateData(JSON.parse(saved)); }
        catch {
            damaged = saved;
            onWarning('原保存数据格式异常，已保留原文并尝试恢复旧版数据。建议先导出备份。');
        }
    }
    state = freeze(state || migrateLegacy(read));
    const subscribers = new Set();
    const save = next => {
        try {
            if (!backend) throw new Error('Storage unavailable');
            // Preserve invalid/newer data before replacing the single atomic state key.
            if (damaged) {
                backend.setItem('chishenme:recovery:v1', damaged);
                damaged = null;
            }
            backend.setItem(STORAGE_KEY, JSON.stringify(next));
            persisted = true;
            warningSent = false;
        } catch { warn('浏览器存储已满或不可用，修改暂存于本次会话。请导出备份后再关闭页面。'); }
    };
    const emit = reason => { for (const listener of subscribers) listener(state, reason); };
    const replace = (data, reason = 'replace') => {
        const validated = validateData(data);
        save(validated);
        state = freeze(validated);
        emit(reason);
        return persisted;
    };
    const onStorage = event => {
        if (event.key !== STORAGE_KEY || !event.newValue) return;
        try { state = freeze(validateData(JSON.parse(event.newValue))); persisted = true; emit('external'); }
        catch { onWarning('另一个页面写入的数据无法读取，当前数据未被替换。'); }
    };
    eventTarget?.addEventListener('storage', onStorage);
    return {
        get: () => state,
        get persisted() { return persisted; },
        update(mutator, reason = 'update') {
            const draft = structuredClone(state);
            mutator(draft);
            return replace(draft, reason);
        },
        replace,
        subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
        destroy() { eventTarget?.removeEventListener('storage', onStorage); subscribers.clear(); },
    };
}

export function addHistory(data, food, source = 'wheel', eaten = false, timestamp = Date.now()) {
    data.history.unshift({ id: `event:${timestamp}:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`, food, timestamp, source, eaten });
    data.history = data.history.slice(0, LIMITS.history);
}

export function toggleFavorite(data, food) {
    const index = data.favorites.findIndex(item => item.id === food.id);
    if (index >= 0) data.favorites.splice(index, 1);
    else {
        if (data.favorites.length >= LIMITS.foods) throw new Error(`最多收藏 ${LIMITS.foods} 道美食`);
        data.favorites.push(food);
    }
}
