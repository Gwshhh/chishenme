import { foodData, IMAGE_ORDER, MEAL_EXTRA } from '../../data.js';
import { normalizeFood, foodId } from './model.js';

// 常见做法的参考标签；自定义菜品可编辑，不推断店铺的配料或营养数据。
const spicy = new Set('重庆小面,酸辣粉,螺蛳粉,麻辣烫,麻辣香锅,冒菜,回锅肉,宫保鸡丁,鱼香肉丝,麻婆豆腐,酸菜鱼,水煮鱼,大盘鸡,烤鱼,鸡公煲,重庆火锅,小龙虾,部队锅,冬阴功'.split(','));
const mild = new Set('黄焖鸡米饭,扬州炒饭,煲仔饭,卤肉饭,照烧鸡饭,兰州拉面,刀削面,热干面,云吞面,羊肉泡馍,越南河粉,炒面,过桥米线,干炒牛河,汉堡,炸鸡,薯条,东北饺子,小笼包,生煎包,煎饼果子,鸡蛋灌饼,粥品,红烧肉,北京烤鸭,梅菜扣肉,潮汕牛肉火锅,烤茄子,拉面,寿司,天妇罗,寿喜烧,蛋包饭,牛排,披萨,意大利面,早茶,虾饺,烧鹅,白切鸡,肠粉,肉夹馍,春卷,章鱼小丸子,关东煮,手抓饼,奶茶,咖啡,鲜榨果汁,蛋糕,冰淇淋,双皮奶,杨枝甘露,蛋挞,提拉米苏,糖葫芦,沙拉,三明治,健身餐'.split(','));
const vegetarian = new Set('薯条,烤茄子,凉皮,奶茶,咖啡,鲜榨果汁,蛋糕,冰淇淋,双皮奶,杨枝甘露,蛋挞,提拉米苏,糖葫芦,沙拉'.split(','));
const light = new Set('云吞面,越南河粉,粥品,潮汕牛肉火锅,白切鸡,肠粉,沙拉,健身餐,鲜榨果汁,虾饺,寿司'.split(','));

export const catalog = Object.freeze(foodData.map(raw => {
    const meals = raw.category === '甜品饮品' ? [] : ['lunch', 'dinner'];
    if (MEAL_EXTRA.早.includes(raw.name)) meals.push('breakfast');
    if (MEAL_EXTRA.夜.includes(raw.name) || raw.category === '甜品饮品') meals.push('night');
    const tags = [];
    if (spicy.has(raw.name)) tags.push('spicy');
    else if (mild.has(raw.name)) tags.push('mild');
    if (vegetarian.has(raw.name)) tags.push('vegetarian');
    if (light.has(raw.name)) tags.push('light');
    const index = IMAGE_ORDER.indexOf(raw.name);
    const image = index >= 0 ? `images_food/food_${String(index + 1).padStart(2, '0')}.jpg` : '';
    return Object.freeze(normalizeFood({ ...raw, id: foodId(raw), image, meals, tags }));
}));

const byName = new Map(catalog.map(food => [food.name, food]));

export function enrichLegacyFood(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const known = !raw.isNearby && !raw.isCustom && byName.get(raw.name);
    return known ? { ...known } : normalizeFood(raw);
}

export function activeMenu(data) {
    const base = data.menuOverride ?? catalog;
    const all = data.menuOverride ? base : [...base, ...data.customFoods];
    return [...new Map(all.map(food => [food.id, food])).values()];
}

export function categoriesFor(foods) { return [...new Set(foods.map(food => food.category))]; }

export function resolveFood(snapshot, menu) { return menu.find(food => food.id === snapshot?.id) || snapshot; }
