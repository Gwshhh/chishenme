import { foodData, IMAGE_ORDER } from '../../data.js';
import { cleanText, safeImage } from './model.js';

const photos = new Map(foodData.map(food => {
    const index = IMAGE_ORDER.indexOf(food.name);
    return [food.name, index >= 0 ? `images_food/food_${String(index + 1).padStart(2, '0')}.jpg` : ''];
}));
// Match specific dishes before brands/categories. References never become stored shop photos.
const dishNames = [...photos.keys()].sort((a, b) => b.length - a.length);
const nameRules = [
    [/塔斯[汀丁]|麦当劳|汉堡王|华莱士|汉堡|burger/i, '汉堡'],
    [/肯德基|德克士|炸鸡|KFC/i, '炸鸡'],
    [/必胜客|达美乐|棒约翰|披萨|比萨|pizza/i, '披萨'],
    [/瑞幸|星巴克|库迪|咖啡|coffee/i, '咖啡'],
    [/蜜雪冰城|茶百道|古茗|喜茶|霸王茶姬|沪上阿姨|益禾堂|奶茶|茶饮|果茶/, '奶茶'],
    [/牛肉面|牛肉拉面|拉面馆/, '兰州拉面'],
    [/米粉|米线/, '过桥米线'],
    [/馄饨|抄手/, '沙县小吃'],
    [/小笼|包子|包点/, '小笼包'],
    [/饺子|水饺|锅贴/, '东北饺子'],
    [/煎饼/, '煎饼果子'],
    [/粥/, '粥品'],
    [/麻辣拌|串串香/, '麻辣烫'],
    [/火锅|涮肉/, '重庆火锅'],
    [/烧烤|烤串|烤吧/, '烧烤'],
    [/烘焙|糕点|蛋糕/, '蛋糕'],
];
const categoryRules = [
    [/汉堡/, '汉堡'], [/炸鸡/, '炸鸡'], [/披萨|比萨/, '披萨'],
    [/咖啡/, '咖啡'], [/奶茶|茶饮/, '奶茶'],
    [/火锅/, '重庆火锅'], [/烧烤|烤肉/, '烧烤'],
    [/面馆|面食|粉面|米粉/, '兰州拉面'], [/饺子|包子/, '小笼包'],
    [/快餐|便当|盖饭/, '盖浇饭'], [/日本|日料|寿司/, '寿司'],
    [/韩国|韩餐|韩式/, '石锅拌饭'], [/西餐/, '牛排'],
    [/轻食|沙拉/, '沙拉'], [/粤式点心|早茶|茶餐厅/, '早茶'],
    [/甜品|蛋糕|糕饼|烘焙/, '蛋糕'],
];

export function referencePhoto(food) {
    const name = cleanText(food?.name, 60);
    const dish = dishNames.find(value => name.includes(value));
    let match = dish || nameRules.find(([pattern]) => pattern.test(name))?.[1];
    if (!match) {
        const category = cleanText(`${food?.category || ''} ${food?.sourceType || ''}`, 160);
        match = categoryRules.find(([pattern]) => pattern.test(category))?.[1];
    }
    if (!match || !photos.get(match)) return null;
    const label = match === '沙县小吃' ? '馄饨' : match === '海底捞' ? '火锅' : match;
    return { src: photos.get(match), kind: 'reference', label: `${label}参考图` };
}

export function photoCandidates(food) {
    const supplied = [food?.image, ...(Array.isArray(food?.imageCandidates) ? food.imageCandidates : [])];
    const candidates = [...new Set(supplied.map(safeImage).filter(Boolean))].slice(0, 5).map(src => ({ src, kind: 'original', label: '' }));
    const reference = referencePhoto(food);
    if (reference && !candidates.some(candidate => candidate.src === reference.src)) candidates.push(reference);
    return candidates;
}
