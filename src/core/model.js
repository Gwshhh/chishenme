export const APP_VERSION = '3.1.0';
export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = 'chishenme:state:v1';
export const LIMITS = Object.freeze({ foods: 500, history: 300, planDays: 366, fileBytes: 2 * 1024 * 1024 });
export const MEALS = Object.freeze([
    { key: 'breakfast', label: '早餐' },
    { key: 'lunch', label: '午餐' },
    { key: 'dinner', label: '晚餐' },
    { key: 'night', label: '夜宵' },
]);
export const PLAN_MEALS = MEALS.slice(0, 3);
export const ACCENTS = ['sunset', 'celadon', 'indigo', 'violet', 'amber', 'rose'];
export const TAGS = ['mild', 'spicy', 'vegetarian', 'light'];

export function cleanText(value, max = 120) {
    return typeof value === 'string'
        ? value.normalize('NFKC').replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
        : '';
}

export function foodId(food) {
    if (food.isNearby) return `nearby:${cleanText(food.name, 60)}:${cleanText(food.location, 50)}`;
    return `food:${cleanText(food.name, 60).toLocaleLowerCase('zh-CN')}`;
}

export function safeImage(value) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    if (/^images_food\/food_\d{2,3}\.jpg$/.test(value)) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
}

export function normalizeFood(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const name = cleanText(value.name, 60);
    if (!name) return null;
    const images = [...new Set([value.image, ...(Array.isArray(value.imageCandidates) ? value.imageCandidates : [])].map(safeImage).filter(Boolean))].slice(0, 5);
    const food = {
        id: cleanText(value.id, 180),
        name,
        category: cleanText(value.category, 24) || '自定义',
        description: cleanText(value.description, 240),
        image: images[0] || '',
        meals: Array.isArray(value.meals) ? [...new Set(value.meals.filter(m => MEALS.some(def => def.key === m)))] : ['lunch', 'dinner'],
        tags: Array.isArray(value.tags) ? [...new Set(value.tags.filter(t => TAGS.includes(t)))] : [],
    };
    if (images.length > 1) food.imageCandidates = images;
    if (value.isNearby === true) {
        food.isNearby = true;
        food.address = cleanText(value.address, 160);
        food.location = cleanText(value.location, 50);
        food.sourceType = cleanText(value.sourceType, 100);
        if (Number.isFinite(value.distance) && value.distance >= 0) food.distance = Math.round(value.distance);
        else if (Number.isFinite(value._dist) && value._dist >= 0) food.distance = Math.round(value._dist);
    }
    if (value.isCustom === true) food.isCustom = true;
    food.id ||= foodId(food);
    return food;
}

export function defaultData() {
    return {
        schemaVersion: SCHEMA_VERSION,
        favorites: [], history: [], customFoods: [], menuOverride: null, plan: {},
        preferences: {
            avoidSpicy: false, vegetarian: false, preferLight: false,
            avoidRepeat: true, fatigueDecay: true, excludedKeywords: [], excludedIds: [],
        },
        settings: { theme: 'system', accent: 'sunset', sound: false, nearbyLevel: 1, meal: 'auto' },
    };
}

export function isDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) && localDateKey(date) === value;
}

export function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(date, count) {
    const next = new Date(typeof date === 'string' ? `${date}T12:00:00` : date);
    next.setDate(next.getDate() + count);
    return next;
}

export function weekDays(date = new Date(), offset = 0) {
    const monday = addDays(date, -((date.getDay() + 6) % 7) + offset * 7);
    return Array.from({ length: 7 }, (_, i) => localDateKey(addDays(monday, i)));
}

export function currentMeal(date = new Date()) {
    const hour = date.getHours();
    if (hour >= 5 && hour < 10) return 'breakfast';
    if (hour >= 10 && hour < 16) return 'lunch';
    if (hour >= 16 && hour < 21) return 'dinner';
    return 'night';
}

function invalid(message) { throw new Error(message); }

// All import paths use this same schema. Strict imports fail before touching state.
export function validateData(raw, { strict = true } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('备份内容必须是数据对象');
    if (raw.schemaVersion !== SCHEMA_VERSION) invalid('暂不支持此数据版本，请使用对应版本的应用');
    const data = defaultData();
    const foodList = (list, key, max) => {
        if (!Array.isArray(list)) { if (strict) invalid(`${key} 必须是数组`); return []; }
        if (strict && list.length > max) invalid(`${key} 超过 ${max} 条上限`);
        const out = [], seen = new Set();
        for (const item of list.slice(0, max)) {
            const food = normalizeFood(item);
            if (!food) { if (strict) invalid(`${key} 中有无效菜品`); continue; }
            if (!seen.has(food.id)) { out.push(food); seen.add(food.id); }
        }
        return out;
    };
    data.favorites = foodList(raw.favorites, '收藏', LIMITS.foods);
    data.customFoods = foodList(raw.customFoods, '自定义菜单', LIMITS.foods).map(f => ({ ...f, isCustom: true }));
    if (raw.menuOverride !== null && raw.menuOverride !== undefined) {
        data.menuOverride = foodList(raw.menuOverride, '替换菜单', LIMITS.foods).map(f => ({ ...f, isCustom: true }));
        if (!data.menuOverride.length) { if (strict) invalid('替换菜单不能为空'); data.menuOverride = null; }
    }
    if (!Array.isArray(raw.history)) { if (strict) invalid('记录必须是数组'); }
    else {
        if (strict && raw.history.length > LIMITS.history) invalid('记录数量超过上限');
        const seen = new Set();
        for (const item of raw.history.slice(0, LIMITS.history)) {
            if (!item || typeof item !== 'object') { if (strict) invalid('记录格式无效'); continue; }
            const food = normalizeFood(item.food || item);
            if (!food || !Number.isFinite(item.timestamp) || item.timestamp <= 0 || item.timestamp > 8640000000000000) {
                if (strict) invalid('记录中有无效菜品或时间'); continue;
            }
            const id = cleanText(item.id, 220) || `history:${item.timestamp}:${food.id}`;
            if (seen.has(id)) continue;
            seen.add(id);
            data.history.push({ id, food, timestamp: item.timestamp, source: ['wheel', 'daily', 'favorite', 'tournament', 'plan', 'manual'].includes(item.source) ? item.source : 'wheel', eaten: item.eaten === true });
        }
        data.history.sort((a, b) => b.timestamp - a.timestamp);
    }
    const prefs = raw.preferences;
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) { if (strict) invalid('偏好设置格式不正确'); }
    else {
        for (const key of ['avoidSpicy', 'vegetarian', 'preferLight', 'avoidRepeat', 'fatigueDecay']) {
            if (key in prefs && typeof prefs[key] !== 'boolean' && strict) invalid('偏好开关必须为布尔值');
            if (typeof prefs[key] === 'boolean') data.preferences[key] = prefs[key];
        }
        for (const [key, limit, length] of [['excludedKeywords', 50, 30], ['excludedIds', LIMITS.foods, 180]]) {
            if (prefs[key] !== undefined && !Array.isArray(prefs[key])) { if (strict) invalid('不想吃清单格式不正确'); continue; }
            const values = prefs[key] || [];
            if (strict && (values.length > limit || values.some(v => typeof v !== 'string' || !cleanText(v, length)))) invalid('不想吃清单包含无效内容或条目过多');
            data.preferences[key] = [...new Set(values.map(v => cleanText(v, length)).filter(Boolean))].slice(0, limit);
        }
    }
    if ((!raw.settings || typeof raw.settings !== 'object' || Array.isArray(raw.settings)) && strict) invalid('外观设置格式不正确');
    const settings = raw.settings || {};
    if (strict && (typeof settings.sound !== 'boolean' || !['system', 'light', 'dark'].includes(settings.theme) || !ACCENTS.includes(settings.accent))) invalid('外观设置含无效值');
    data.settings.theme = ['system', 'light', 'dark'].includes(settings.theme) ? settings.theme : 'system';
    data.settings.accent = ACCENTS.includes(settings.accent) ? settings.accent : 'sunset';
    data.settings.sound = settings.sound === true;
    data.settings.nearbyLevel = [1, 2, 3].includes(settings.nearbyLevel) ? settings.nearbyLevel : 1;
    data.settings.meal = ['auto', 'all', ...MEALS.map(m => m.key)].includes(settings.meal) ? settings.meal : 'auto';
    if (!raw.plan || typeof raw.plan !== 'object' || Array.isArray(raw.plan)) { if (strict) invalid('用餐计划格式不正确'); }
    else {
        const entries = Object.entries(raw.plan);
        if (strict && entries.length > LIMITS.planDays) invalid('用餐计划最多保存 366 天');
        for (const [date, slots] of entries.slice(-LIMITS.planDays)) {
            if (!isDateKey(date) || !slots || typeof slots !== 'object' || Array.isArray(slots)) { if (strict) invalid('用餐计划日期或餐次无效'); continue; }
            const day = {};
            for (const meal of PLAN_MEALS) {
                const slot = slots[meal.key];
                if (slot === undefined || slot === null) continue;
                const food = normalizeFood(slot.food);
                if (!food) { if (strict) invalid('用餐计划中有无效菜品'); continue; }
                day[meal.key] = { food, locked: slot.locked === true, eaten: slot.eaten === true };
            }
            if (Object.keys(day).length) data.plan[date] = day;
        }
    }
    return data;
}
