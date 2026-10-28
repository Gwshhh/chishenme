import test from 'node:test';
import assert from 'node:assert/strict';
import { photoCandidates, referencePhoto } from '../src/core/photos.js';
import { defaultData, normalizeFood } from '../src/core/model.js';
import { normalizePlaces } from '../server/providers.js';
import { createBackup, parseBackup } from '../src/core/backup.js';

test('Tastien without a provider photo gets a labeled hamburger photograph', () => {
    const food = normalizeFood({ name: '塔斯汀中国汉堡', isNearby: true, category: '快餐便当' });
    assert.deepEqual(photoCandidates(food), [{ src: 'images_food/food_32.jpg', kind: 'reference', label: '汉堡参考图' }]);
    assert.equal(food.image, '', 'a reference must not be stored as an actual shop image');
});

test('specific dishes outrank generic categories and unknown shops are not assigned random food', () => {
    assert.equal(referencePhoto({ name: '老张螺蛳粉', category: '快餐便当' }).src, 'images_food/food_66.jpg');
    assert.equal(referencePhoto({ name: '瑞幸', category: '中餐' }).src, 'images_food/food_48.jpg');
    assert.equal(referencePhoto({ name: '必胜客', category: '中餐' }).src, 'images_food/food_31.jpg');
    assert.equal(referencePhoto({ name: '某某私房菜', category: '中餐' }), null);
    assert.deepEqual(photoCandidates({ name: '无法识别的菜', category: '自定义' }), []);
});

test('all supplied photos precede the reference and unsafe or duplicate candidates are removed', () => {
    const candidates = photoCandidates({ name: '塔斯汀中国汉堡', image: 'https://photos.example/one.jpg', imageCandidates: ['javascript:alert(1)', 'https://photos.example/one.jpg', 'https://photos.example/two.jpg', 'data:image/svg+xml,evil'] });
    assert.deepEqual(candidates.map(photo => photo.src), ['https://photos.example/one.jpg', 'https://photos.example/two.jpg', 'images_food/food_32.jpg']);
    assert.deepEqual(candidates.map(photo => photo.kind), ['original', 'original', 'reference']);
});

test('provider photo normalization skips invalid first photos and preserves later usable photos', () => {
    const [food] = normalizePlaces([{ id: 'burger', name: '塔斯汀中国汉堡', photos: [null, { url: 'javascript:alert(1)' }, { url: 'http://photos.example/one.jpg' }, { url: 'https://photos.example/two.jpg' }] }]);
    assert.equal(food.image, 'https://photos.example/one.jpg');
    assert.deepEqual(food.imageCandidates, ['https://photos.example/one.jpg', 'https://photos.example/two.jpg']);
});

test('duplicate POI entries can enrich missing photos without replacing identity', () => {
    const foods = normalizePlaces([{ id: 'one', name: '同一家店', distance: '20' }, { id: 'one', name: '同一家店', distance: '30', photos: [{ url: 'https://photos.example/one.jpg' }] }]);
    assert.equal(foods.length, 1);
    assert.equal(foods[0].distance, 20);
    assert.equal(foods[0].image, 'https://photos.example/one.jpg');
});

test('photo lists survive favorites/backups while retaining the bounded schema', () => {
    const food = normalizeFood({ name: '照片测试', imageCandidates: Array.from({ length: 12 }, (_, i) => `https://photos.example/${i}.jpg`), isNearby: true });
    assert.equal(food.imageCandidates.length, 5);
    const data = defaultData(); data.favorites = [food];
    assert.deepEqual(parseBackup(createBackup(data)).favorites, [food]);
});
