import { $, attr, escapeHtml, foodImage, on, toast } from '../ui/dom.js';
import { foodTags } from '../ui/cards.js';
import { icon } from '../ui/icons.js';
import { deliveryLinks, initDelivery } from '../services/delivery.js';
import { shareFood } from '../services/share.js';
import { preferenceReasons } from '../core/selection.js';
import { toggleFavorite } from '../core/storage.js';

export function initFoodActions(app) {
    const open = food => {
        const reasons = preferenceReasons(food, app.store.get().preferences);
        const favorite = app.store.get().favorites.some(item => item.id === food.id);
        const excluded = app.store.get().preferences.excludedIds.includes(food.id);
        app.dialog.open({ title: food.name, className: 'food-dialog', content: `${foodImage(food, { eager: true })}<div class="detail-body"><span class="food-category">${escapeHtml(food.category)}</span><p>${escapeHtml(food.description)}</p><div class="tag-list">${foodTags(food)}</div>${reasons.length ? `<p class="notice">当前偏好不包含这道菜：${escapeHtml(reasons.join('、'))}</p>` : ''}<div class="detail-actions"><button class="button primary" data-food-action="choose" data-food-id="${attr(food.id)}">就选这道${icon('arrow')}</button><button class="button secondary" data-food-action="favorite" data-food-id="${attr(food.id)}">${icon('heart')}${favorite ? '已收藏' : '收藏'}</button><button class="button secondary" data-food-action="plan" data-food-id="${attr(food.id)}">${icon('calendar')}加入计划</button></div><div class="detail-secondary"><button class="text-button" data-food-action="share" data-food-id="${attr(food.id)}">${icon('share')}分享</button><button class="text-button" data-food-action="exclude" data-food-id="${attr(food.id)}">${icon('ban')}${excluded ? '移出不想吃' : '暂时不想吃'}</button></div>${food.tags.length ? '<p class="fine-print">标签按常见做法标注；口味和配料请以实际菜品为准。</p>' : ''}${deliveryLinks(food)}</div>` });
    };
    on(document, 'click', '[data-food-action]', async (_, button) => {
        const food = app.findFood(button.dataset.foodId);
        if (!food) { toast('这道菜已变更，请刷新列表'); return; }
        const action = button.dataset.foodAction;
        try {
            if (action === 'detail') open(food);
            if (action === 'favorite') {
                const exists = app.store.get().favorites.some(item => item.id === food.id);
                app.store.update(data => toggleFavorite(data, food), 'favorites');
                if (button.closest('.food-dialog')) open(food);
                toast(exists ? '已取消收藏' : '已加入收藏');
            }
            if (action === 'choose') {
                if (app.ui.spinning) { toast('转盘正在抽取，请稍等'); return; }
                app.dialog.close(); app.pick(food, 'manual');
            }
            if (action === 'plan') app.features.plan.openAdd(food);
            if (action === 'share') await shareFood(food, app.dialog);
            if (action === 'exclude') {
                app.store.update(data => {
                    const ids = data.preferences.excludedIds;
                    const index = ids.indexOf(food.id);
                    if (index >= 0) ids.splice(index, 1); else ids.push(food.id);
                }, 'preferences');
                open(food); toast('已更新不想吃清单');
            }
        } catch (error) { toast(error.message); }
    });
    initDelivery();
    return { open };
}
