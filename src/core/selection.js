import { cleanText, PLAN_MEALS } from './model.js';

export function preferenceReasons(food, preferences) {
    const reasons = [];
    if (preferences.excludedIds.includes(food.id)) reasons.push('已加入不想吃');
    if (preferences.avoidSpicy && !food.tags.includes('mild')) reasons.push(food.tags.includes('spicy') ? '含辣味标签' : '未标注不辣');
    if (preferences.vegetarian && !food.tags.includes('vegetarian')) reasons.push('未标注蛋奶素');
    const text = cleanText(`${food.name} ${food.category} ${food.description}`, 500).toLocaleLowerCase('zh-CN');
    const keyword = preferences.excludedKeywords.find(term => text.includes(term.toLocaleLowerCase('zh-CN')));
    if (keyword) reasons.push(`含关键词「${keyword}」`);
    return reasons;
}

export function filterFoods(foods, { preferences, meal = 'all', categories = [], search = '' } = {}) {
    const terms = cleanText(search, 120).toLocaleLowerCase('zh-CN').split(' ').filter(Boolean);
    return foods.filter(food => {
        if (meal !== 'all' && !food.isNearby && !food.meals.includes(meal)) return false;
        if (categories.length && !categories.includes(food.category)) return false;
        if (preferences && preferenceReasons(food, preferences).length) return false;
        const text = `${food.name} ${food.category} ${food.description}`.toLocaleLowerCase('zh-CN');
        return terms.every(term => text.includes(term));
    });
}

export function foodWeight(food, { history = [], preferences = {}, weather = null, now = Date.now() } = {}) {
    let weight = 1;
    if (preferences.fatigueDecay) {
        const latest = history.reduce((time, entry) => entry.food.id === food.id ? Math.max(time, entry.timestamp) : time, 0);
        const age = Math.max(0, now - latest);
        if (latest && age < 7 * 86400000) weight *= 0.15 + 0.85 * age / (7 * 86400000);
    }
    if (preferences.preferLight && food.tags.includes('light')) weight *= 1.6;
    const weatherRules = { rain: /汤|粥|锅|面|煲/, hot: /凉|沙拉|寿司|冰|轻食/, cold: /锅|炖|煲|汤|羊肉/ };
    if (weatherRules[weather?.kind]?.test(`${food.name} ${food.category}`)) weight *= 1.6;
    return Math.max(0.01, weight);
}

export function filterPlanFoods(foods, options = {}) {
    // Drinks and desserts remain browsable and drawable, but are not a full meal on their own.
    return filterFoods(foods, options).filter(food => food.isCustom || food.category !== '甜品饮品');
}

export function weightedPick(foods, options = {}) {
    if (!foods.length) return null;
    const lastId = options.lastId;
    const pool = options.preferences?.avoidRepeat && foods.length > 1 && lastId
        ? foods.filter(food => food.id !== lastId) : foods;
    const weights = pool.map(food => foodWeight(food, options));
    const random = options.random || Math.random;
    let target = Math.max(0, Math.min(1 - Number.EPSILON, random())) * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < pool.length; i++) { target -= weights[i]; if (target < 0) return pool[i]; }
    return pool.at(-1) || null;
}

export function sampleDistinct(foods, count, random = Math.random) {
    const pool = [...new Map(foods.map(food => [food.id, food])).values()];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
}

export function spinBoard(foods, target, random = Math.random, limit = 12) {
    if (foods.length <= limit) return [...foods];
    return sampleDistinct([target, ...sampleDistinct(foods.filter(food => food.id !== target.id), limit - 1, random)], limit, random);
}

export function targetRotation(index, count, turns = 5) {
    if (!Number.isInteger(index) || index < 0 || index >= count || !Number.isInteger(turns) || turns < 0) throw new Error('无效转盘位置');
    return turns * 2 * Math.PI + 2 * Math.PI - (index + 0.5) * 2 * Math.PI / count;
}

export function indexAtPointer(rotation, count) {
    const circle = 2 * Math.PI;
    return Math.floor((((-rotation % circle) + circle) % circle) / (circle / count)) % count;
}

export function seededRandom(seed) {
    let value = 2166136261;
    for (const char of String(seed)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    return () => {
        value += 0x6D2B79F5;
        let t = Math.imul(value ^ value >>> 15, 1 | value);
        t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Existing choices, locked slots and eaten meals are never silently replaced.
export function generateWeek({ days, menu, plan, preferences, history = [], overwrite = false, random = Math.random }) {
    const next = structuredClone(plan);
    const used = new Set();
    let filled = 0, missing = 0, repeats = 0;
    for (const day of days) for (const { key } of PLAN_MEALS) {
        const slot = next[day]?.[key];
        if (slot && (!overwrite || slot.locked || slot.eaten)) used.add(slot.food.id);
    }
    for (const day of days) {
        for (const { key } of PLAN_MEALS) {
            const previous = next[day]?.[key];
            if (previous && (!overwrite || previous.locked || previous.eaten)) continue;
            const eligible = filterPlanFoods(menu, { preferences, meal: key });
            let pool = eligible.filter(food => !used.has(food.id));
            if (!pool.length) pool = eligible;
            const food = weightedPick(pool, { preferences, history, random, lastId: previous?.food.id });
            if (!food) {
                missing++;
                // No eligible replacement: preserve the user's existing meal.
                continue;
            }
            if (used.has(food.id)) repeats++;
            used.add(food.id);
            next[day] ||= {};
            next[day][key] = { food, locked: false, eaten: false };
            filled++;
        }
    }
    return { plan: next, filled, missing, repeats };
}
