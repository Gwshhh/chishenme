import { icon } from './icons.js';
import { attr, escapeHtml, foodImage } from './dom.js';
import { MEALS } from '../core/model.js';

export function foodCard(food, { favorites = [], excluded = [] } = {}) {
    const favorite = favorites.some(item => item.id === food.id);
    const blocked = excluded.includes(food.id);
    const mealLabel = food.meals.map(key => MEALS.find(meal => meal.key === key)?.label).filter(Boolean).slice(0, 2).join(' / ');
    return `<article class="food-card${blocked ? ' is-excluded' : ''}">
        <button class="food-card-main" data-food-action="detail" data-food-id="${attr(food.id)}">${foodImage(food)}<span class="food-card-content"><span class="food-category">${escapeHtml(food.category)}${food.isNearby && Number.isFinite(food.distance) ? ` · ${food.distance < 1000 ? food.distance + 'm' : (food.distance / 1000).toFixed(1) + 'km'}` : ''}</span><strong>${escapeHtml(food.name)}</strong><span class="food-description">${escapeHtml(food.description || '下一餐的新选择')}</span></span></button>
        <button class="card-favorite icon-btn${favorite ? ' is-favorite' : ''}" data-food-action="favorite" data-food-id="${attr(food.id)}" aria-label="${favorite ? '取消收藏' : '收藏'}${attr(food.name)}" aria-pressed="${favorite}">${icon('heart')}</button>
        <div class="food-card-foot"><span>${blocked ? '已加入不想吃' : food.tags.includes('light') ? '清淡口味' : food.tags.includes('spicy') ? '辣味' : food.isCustom ? '我的私藏菜单' : mealLabel}</span><button class="icon-btn small" data-food-action="plan" data-food-id="${attr(food.id)}" aria-label="将${attr(food.name)}加入计划">${icon('calendar')}</button></div>
    </article>`;
}

export function foodTags(food) {
    const labels = { mild: '常见做法不辣', spicy: '辣味', vegetarian: '蛋奶素参考', light: '清淡参考' };
    return food.tags.map(tag => `<span class="tag">${labels[tag]}</span>`).join('');
}
