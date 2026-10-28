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

export function meituanDestination({ userAgent = '', maxTouchPoints = 0, keyword = '' } = {}) {
    const ios = /iPhone|iPad|iPod/i.test(userAgent) || /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
    const android = /Android/i.test(userAgent);
    const mobile = ios || android;
    const embedded = /MicroMessenger|\bQQ\/|Weibo/i.test(userAgent);
    const search = `q=${encodeURIComponent(keyword || '附近美食')}`;
    // Meituan's registered scheme opens its global search. Amap POI ids are
    // deliberately not passed as Meituan shop ids: they are different catalogs.
    const scheme = `imeituan://www.meituan.com/search?${search}`;
    const web = mobile ? 'https://i.meituan.com/' : 'https://waimai.meituan.com/';
    const app = android ? `intent://www.meituan.com/search?${search}#Intent;scheme=imeituan;package=com.sankuai.meituan;S.browser_fallback_url=${encodeURIComponent(web)};end` : scheme;
    return { mobile, embedded, app, web, href: mobile && !embedded ? app : web };
}

function destination(keyword) {
    return meituanDestination({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, keyword });
}

export function deliveryLinks(food) {
    const keyword = deliveryKeywords(food)[0];
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    const meituan = destination(keyword);
    return `<details class="delivery-details"><summary>去外卖平台找一找${icon('external')}</summary><p>在美团中搜索「${escapeHtml(keyword)}」，也可以复制店名到其他平台查找。店铺与营业情况以平台为准。</p><div class="delivery-buttons"><a class="button secondary" href="${attr(meituan.href)}" target="${meituan.mobile ? '_self' : '_blank'}" rel="noopener noreferrer" data-open-meituan data-copy-keyword="${attr(keyword)}">美团${icon('external')}</a><a class="button secondary" href="${mobile ? 'https://h5.ele.me' : 'https://www.ele.me'}" target="_blank" rel="noopener noreferrer" data-copy-keyword="${attr(keyword)}">饿了么${icon('external')}</a></div><div class="delivery-small"><a href="${attr(safeLink(APP_CONFIG.affiliate.meituanCoupon, 'https://i.waimai.meituan.com/coupon'))}" target="_blank" rel="noopener noreferrer">美团领券（需登录）</a><a href="${attr(safeLink(APP_CONFIG.affiliate.elemeCoupon, 'https://h5.ele.me/hongbao/'))}" target="_blank" rel="noopener noreferrer">饿了么红包</a></div>${food.isNearby ? `<div class="keyword-list">换个词搜索：${deliveryKeywords(food).map(word => `<button class="text-button" data-copy-keyword="${attr(word)}">${escapeHtml(word)}</button>`).join('')}</div>` : ''}</details>`;
}

export function initDelivery() {
    const prepare = target => {
        const link = destination(target.dataset.copyKeyword);
        target.href = link.href;
        target.target = link.mobile ? '_self' : '_blank';
        return link;
    };
    document.querySelectorAll('[data-open-meituan]').forEach(prepare);
    on(document, 'click', '[data-open-meituan]', (event, target) => {
        if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = prepare(target);
        if (!link.mobile) return;
        // Keep native navigation in this trusted click. Awaiting a clipboard
        // operation or a network request first loses Safari's user activation.
        const host = target.closest('.delivery-details, .nearby-panel');
        if (host) {
            let help = host.querySelector('.delivery-handoff');
            if (!help) { help = document.createElement('div'); help.className = 'delivery-handoff'; help.setAttribute('role', 'status'); host.append(help); }
            help.innerHTML = `<p>${link.embedded ? '请用 Safari 或系统浏览器打开本页面，再点击打开美团。' : '未打开美团？请确认已安装美团，也可以使用网页版。'}</p><a class="text-button" href="${link.web}" target="_blank" rel="noopener noreferrer">使用美团网页版${icon('external')}</a>`;
        }
        if (link.embedded) event.preventDefault();
    });
    on(document, 'click', '[data-copy-keyword]', async (_, target) => {
        try { await copyText(target.dataset.copyKeyword); toast(`已复制「${target.dataset.copyKeyword}」，可到平台粘贴搜索`); }
        catch { toast(`未能复制，请手动搜索「${target.dataset.copyKeyword}」`); }
    });
}
