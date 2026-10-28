import { validateData, normalizeFood, cleanText, LIMITS } from './model.js';

export function createBackup(data, now = new Date()) {
    return JSON.stringify({ format: 'chishenme-backup', version: 1, exportedAt: now.toISOString(), data: validateData(data) }, null, 2);
}

function parseJson(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMITS.fileBytes) throw new Error('文件不能超过 2 MB');
    try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch { throw new Error('文件不是有效的 JSON，请检查格式后重试'); }
}

export function parseBackup(text) {
    const raw = parseJson(text);
    if (!raw || raw.format !== 'chishenme-backup' || raw.version !== 1) throw new Error('这不是受支持的完整备份文件。菜单文件请到「管理菜单」导入。');
    return validateData(raw.data);
}

export function parseMenu(text) {
    const raw = parseJson(text);
    const entries = Array.isArray(raw) ? raw : raw?.format === 'chishenme-menu' && raw.version === 1 ? raw.foods : null;
    if (!Array.isArray(entries) || !entries.length) throw new Error('菜单需要包含至少一道菜品的 JSON 数组');
    if (entries.length > LIMITS.foods) throw new Error(`菜单最多包含 ${LIMITS.foods} 道菜品`);
    const foods = [], names = new Set();
    for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        if (!entry || typeof entry.name !== 'string' || !cleanText(entry.name, 60)) throw new Error(`第 ${index + 1} 项缺少有效名称`);
        if (entry.meals !== undefined && (!Array.isArray(entry.meals) || !entry.meals.length || entry.meals.some(m => !['breakfast', 'lunch', 'dinner', 'night'].includes(m)))) throw new Error(`第 ${index + 1} 项餐次标签无效`);
        if (entry.tags !== undefined && (!Array.isArray(entry.tags) || entry.tags.some(t => !['mild', 'spicy', 'vegetarian', 'light'].includes(t)) || (entry.tags.includes('mild') && entry.tags.includes('spicy')))) throw new Error(`第 ${index + 1} 项口味标签无效`);
        const food = normalizeFood({ ...entry, id: '', isNearby: false, isCustom: true });
        const name = food.name.toLocaleLowerCase('zh-CN');
        if (names.has(name)) throw new Error(`菜单中有重复名称「${food.name}」`);
        names.add(name);
        foods.push(food);
    }
    return foods;
}

export function createMenuExport(foods) {
    return JSON.stringify({ format: 'chishenme-menu', version: 1, foods: foods.map(food => ({ name: food.name, category: food.category, description: food.description, meals: food.meals, tags: food.tags })) }, null, 2);
}
