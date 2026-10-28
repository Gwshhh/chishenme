import { APP_CONFIG } from '../../config.js';
import { attr, copyText, escapeHtml, on, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

export function deliveryKeywords(food) {
    const name = food.name.normalize('NFKC').trim();
    const core = food.isNearby ? name.replace(/\([^()]*\)/g, '').replace(/[·|丨].*$/, '').trim() : name;
    return [...new Set([core, name, food.isNearby ? food.category : ''].filter(Boolean))];
}

function safeLink(value, fallback) {
    try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch { /* Use known platform home. */ }
    return fallback;
}

export function deliveryLinks(food) {
    const keyword = deliveryKeywords(food)[0];
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    return `<details class="delivery-details"><summary>去外卖平台找一找${icon('external')}</summary><p>点击后打开平台并尝试复制「${escapeHtml(keyword)}」，粘贴搜索即可。店铺与营业情况以平台为准。</p><div class="delivery-buttons"><a class="button secondary" href="${mobile ? 'https://i.waimai.meituan.com' : 'https://waimai.meituan.com'}" target="_blank" rel="noopener noreferrer" data-copy-keyword="${attr(keyword)}">美团外卖${icon('external')}</a><a class="button secondary" href="${mobile ? 'https://h5.ele.me' : 'https://www.ele.me'}" target="_blank" rel="noopener noreferrer" data-copy-keyword="${attr(keyword)}">饿了么${icon('external')}</a></div><div class="delivery-small"><a href="${attr(safeLink(APP_CONFIG.affiliate.meituanCoupon, 'https://i.waimai.meituan.com/coupon'))}" target="_blank" rel="noopener noreferrer">美团领券（需登录）</a><a href="${attr(safeLink(APP_CONFIG.affiliate.elemeCoupon, 'https://h5.ele.me/hongbao/'))}" target="_blank" rel="noopener noreferrer">饿了么红包</a></div>${food.isNearby ? `<div class="keyword-list">换个词搜索：${deliveryKeywords(food).map(word => `<button class="text-button" data-copy-keyword="${attr(word)}">${escapeHtml(word)}</button>`).join('')}</div>` : ''}</details>`;
}

export function initDelivery() {
    on(document, 'click', '[data-copy-keyword]', async (_, target) => {
        try { await copyText(target.dataset.copyKeyword); toast(`已复制「${target.dataset.copyKeyword}」，可到平台粘贴搜索`); }
        catch { toast(`未能复制，请手动搜索「${target.dataset.copyKeyword}」`); }
    });
}
