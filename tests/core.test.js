import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, activeMenu } from '../src/core/catalog.js';
import { defaultData, normalizeFood, STORAGE_KEY, isDateKey, localDateKey, weekDays, currentMeal } from '../src/core/model.js';
import { createStore, addHistory } from '../src/core/storage.js';
import { createBackup, parseBackup, parseMenu, createMenuExport } from '../src/core/backup.js';
import { filterFoods, preferenceReasons, foodWeight, weightedPick, seededRandom, spinBoard, targetRotation, indexAtPointer, generateWeek } from '../src/core/selection.js';

class MemoryStorage {
    constructor(data = {}) { this.map = new Map(Object.entries(data)); }
    getItem(key) { return this.map.get(key) ?? null; }
    setItem(key, value) { this.map.set(key, value); }
}
const fixture = (name, options = {}) => normalizeFood({ name, category: '测试菜', meals: ['breakfast', 'lunch', 'dinner'], tags: ['mild'], ...options });

test('old favorites/history/custom and replacement menus migrate without deleting the old keys', () => {
    const storage = new MemoryStorage({
        favorites: JSON.stringify([{ name: '黄焖鸡米饭' }, { name: '黄焖鸡米饭' }, null]),
        history: JSON.stringify([{ name: '黄焖鸡米饭', timestamp: 123456 }]),
        customFoods: JSON.stringify([{ name: '小店', category: '私藏' }]),
        menuOverride: JSON.stringify([{ name: '食堂面' }]), theme: 'dark', colorTheme: 'celadon', soundOn: '1',
    });
    const store = createStore({ storage });
    assert.equal(store.get().favorites.length, 1);
    assert.equal(store.get().favorites[0].image, 'images_food/food_01.jpg');
    assert.equal(store.get().history[0].food.name, '黄焖鸡米饭');
    assert.equal(store.get().history[0].eaten, false);
    assert.deepEqual(activeMenu(store.get()).map(food => food.name), ['食堂面']);
    assert.equal(store.get().settings.theme, 'dark');
    store.update(data => { data.preferences.avoidSpicy = true; });
    assert(storage.getItem(STORAGE_KEY));
    assert(storage.getItem('favorites'));
    const restored = createStore({ storage });
    assert.deepEqual(restored.get(), store.get());
});

test('malformed and incorrectly typed legacy data cannot break startup', () => {
    for (const value of ['{bad', '{}', 'false', '"text"', 'null', '[null,42,{}]']) {
        const store = createStore({ storage: new MemoryStorage({ favorites: value, customFoods: value, history: value, menuOverride: value }) });
        assert.equal(store.get().favorites.length, 0);
        assert.equal(store.get().history.length, 0);
        assert.equal(store.get().menuOverride, null);
    }
});

test('unavailable/quota storage retains in-session changes and warns without overwriting saved data', () => {
    const data = defaultData(), original = JSON.stringify(data), warnings = [];
    const storage = { getItem: key => key === STORAGE_KEY ? original : null, setItem() { throw new Error('QuotaExceeded'); } };
    const store = createStore({ storage, onWarning: message => warnings.push(message) });
    const persisted = store.update(draft => { draft.favorites.push(catalog[0]); });
    assert.equal(persisted, false);
    assert.equal(store.get().favorites.length, 1);
    assert.equal(storage.getItem(STORAGE_KEY), original);
    assert.equal(warnings.length, 1);
    assert.throws(() => store.get().favorites.push(catalog[1]), TypeError);
});

test('damaged primary data is archived before a subsequent successful save', () => {
    const storage = new MemoryStorage({ [STORAGE_KEY]: '{broken' });
    const store = createStore({ storage });
    store.update(data => { data.settings.theme = 'dark'; });
    assert.equal(storage.getItem('chishenme:recovery:v1'), '{broken');
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).settings.theme, 'dark');
});

test('full backup round-trips every persisted feature and excludes runtime credentials/location', () => {
    const data = defaultData();
    data.favorites = [catalog[0]]; data.customFoods = [fixture('私房菜', { isCustom: true })]; data.menuOverride = [fixture('食堂菜', { isCustom: true })];
    addHistory(data, catalog[1], 'wheel', true, 123456);
    data.plan['2026-10-27'] = { lunch: { food: catalog[0], locked: true, eaten: true } };
    data.preferences.excludedKeywords = ['羊肉']; data.settings.accent = 'rose';
    const text = createBackup(data, new Date('2026-10-27T00:00:00Z'));
    assert.deepEqual(parseBackup(text), data);
    assert(!/AMAP_KEY|latitude|longitude/.test(text));
    const store = createStore({ storage: new MemoryStorage() });
    store.replace(parseBackup(text));
    assert.deepEqual(store.get(), data);
});

test('invalid/future/oversized backup is rejected instead of partially restoring', () => {
    const data = defaultData();
    const wrap = value => JSON.stringify({ format: 'chishenme-backup', version: 1, data: value });
    for (const broken of [ { ...data, history: [null] }, { ...data, favorites: {} }, { ...data, schemaVersion: 999 }, { ...data, plan: { '2026-02-31': { lunch: { food: catalog[0] } } } }, { ...data, preferences: { ...data.preferences, excludedIds: 'wrong' } } ]) assert.throws(() => parseBackup(wrap(broken)));
    assert.throws(() => parseBackup('x'.repeat(2 * 1024 * 1024 + 1)), /2 MB/);
    assert.throws(() => parseBackup('[]'), /完整备份/);
});

test('menu import validates all entries, rejects duplicates and strips executable images', () => {
    assert.throws(() => parseMenu('[{"name":"饭"},null]'), /第 2 项/);
    assert.throws(() => parseMenu('[{"name":"饭"},{"name":"饭"}]'), /重复/);
    assert.throws(() => parseMenu('[{"name":"饭","tags":["spicy","mild"]}]'), /口味标签/);
    const menu = parseMenu('[{"name":"<img onerror=alert(1)>","image":"javascript:alert(1)","meals":["breakfast"]}]');
    assert.equal(menu[0].image, '');
    assert.equal(menu[0].name, '<img onerror=alert(1)>');
    assert.deepEqual(parseMenu(createMenuExport(menu)), menu);
});

test('replacement menu updates persist independently of archived custom additions', () => {
    const storage = new MemoryStorage(), store = createStore({ storage });
    store.update(data => { data.customFoods = [fixture('原私藏')]; data.menuOverride = [fixture('食堂饭')]; });
    store.update(data => { data.menuOverride.push(fixture('食堂面')); });
    const next = createStore({ storage });
    assert.deepEqual(activeMenu(next.get()).map(food => food.name), ['食堂饭', '食堂面']);
    next.update(data => { data.menuOverride = null; });
    assert(activeMenu(next.get()).some(food => food.name === '原私藏'));
});

test('preferences are strict for unknown/spicy labels, excluded ids and keyword matches', () => {
    const preferences = { ...defaultData().preferences, avoidSpicy: true, vegetarian: true, excludedKeywords: ['花生'] };
    const foods = [fixture('青菜', { tags: ['mild', 'vegetarian'] }), fixture('麻辣菜', { tags: ['spicy', 'vegetarian'] }), fixture('未知', { tags: [] }), fixture('花生酱菜', { tags: ['mild', 'vegetarian'] })];
    assert.deepEqual(filterFoods(foods, { preferences }).map(food => food.name), ['青菜']);
    preferences.excludedIds = [foods[0].id];
    assert.equal(filterFoods(foods, { preferences }).length, 0);
    assert.equal(preferenceReasons(foods[2], preferences).length, 2);
});

test('meal and multi-term search compose with categories and preferences', () => {
    const preferences = defaultData().preferences;
    assert(filterFoods(catalog, { preferences, meal: 'breakfast' }).every(food => food.meals.includes('breakfast')));
    assert(!filterFoods(catalog, { preferences, meal: 'lunch' }).some(food => food.category === '甜品饮品'));
    assert.deepEqual(filterFoods([fixture('番茄面', { description: '食堂二楼' })], { search: '番茄 二楼' }).map(food => food.name), ['番茄面']);
});

test('avoid-repeat removes the previous choice even when random always returns zero', () => {
    const foods = [fixture('A'), fixture('B')], preferences = defaultData().preferences;
    for (let i = 0; i < 100; i++) assert.equal(weightedPick(foods, { preferences, lastId: foods[0].id, random: () => 0 }).id, foods[1].id);
    assert.equal(weightedPick([foods[0]], { preferences, lastId: foods[0].id }).id, foods[0].id);
    assert.equal(weightedPick([], { preferences }), null);
});

test('recency weights clamp future timestamps and recover after seven days', () => {
    const food = fixture('饭'), preferences = defaultData().preferences, now = 1000000000;
    assert.equal(foodWeight(food, { preferences, now, history: [{ food, timestamp: now + 5000 }] }), 0.15);
    assert.equal(foodWeight(food, { preferences, now, history: [{ food, timestamp: now - 8 * 86400000 }] }), 1);
    assert(foodWeight({ ...food, tags: ['light'] }, { preferences: { preferLight: true } }) > 1);
});

test('pointer and result align for every segment, including 360-item sources', () => {
    for (const count of [1, 2, 3, 8, 12, 91, 360]) for (let i = 0; i < count; i++) assert.equal(indexAtPointer(targetRotation(i, count, 7), count), i);
    assert.throws(() => targetRotation(2, 3, 5.5));
    const foods = Array.from({ length: 360 }, (_, i) => fixture(String(i)));
    const board = spinBoard(foods, foods[355], seededRandom('test'));
    assert.equal(board.length, 12); assert.equal(new Set(board.map(food => food.id)).size, 12);
    assert(board.some(food => food.id === foods[355].id));
    assert.equal(foods.length, 360);
});

test('week generation fills 21 meals while preserving manual, locked and eaten choices', () => {
    const days = weekDays(new Date('2026-10-27T12:00:00')), preferences = defaultData().preferences;
    const first = generateWeek({ days, menu: catalog, plan: {}, preferences, random: seededRandom('week') });
    assert.equal(first.filled, 21); assert.equal(first.missing, 0);
    assert(Object.values(first.plan).every(day => Object.values(day).every(slot => slot.food.category !== '甜品饮品')));
    assert.equal(new Set(Object.values(first.plan).flatMap(day => Object.values(day).map(slot => slot.food.id))).size, 21);
    const original = structuredClone(first.plan);
    first.plan[days[0]].lunch.locked = true; first.plan[days[0]].dinner.eaten = true;
    assert.equal(generateWeek({ days, menu: catalog, plan: first.plan, preferences }).filled, 0);
    const replacement = generateWeek({ days, menu: catalog, plan: first.plan, preferences, overwrite: true, random: seededRandom('other') });
    assert.equal(replacement.filled, 19);
    assert.equal(replacement.plan[days[0]].lunch.food.id, original[days[0]].lunch.food.id);
    assert.equal(replacement.plan[days[0]].dinner.food.id, original[days[0]].dinner.food.id);
    assert.notEqual(first.plan, replacement.plan);
});

test('empty preference pools never relax restrictions and small pools report repeats', () => {
    const days = weekDays(new Date('2026-10-27T12:00:00'));
    const preferences = { ...defaultData().preferences, excludedKeywords: ['测试菜'] };
    const none = generateWeek({ days, menu: [fixture('饭')], plan: {}, preferences });
    assert.equal(none.filled, 0); assert.equal(none.missing, 21); assert.deepEqual(none.plan, {});
    const repeated = generateWeek({ days, menu: [fixture('饭')], plan: {}, preferences: defaultData().preferences });
    assert.equal(repeated.filled, 21); assert.equal(repeated.repeats, 20);
});

test('local calendar weeks handle Sunday, leap days and year boundaries', () => {
    assert.deepEqual(weekDays(new Date('2027-01-03T12:00:00')), ['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
    assert(isDateKey('2024-02-29')); assert(!isDateKey('2026-02-29')); assert(!isDateKey('2026-13-01'));
    assert.equal(localDateKey(new Date(2026, 9, 27, 0, 1)), '2026-10-27');
    assert.equal(currentMeal(new Date(2026, 9, 27, 7)), 'breakfast');
    assert.equal(currentMeal(new Date(2026, 9, 27, 22)), 'night');
});
