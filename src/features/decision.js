import { $, attr, escapeHtml, emptyState, foodImage, on, toast, syncFavoriteButtons } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { foodCard, foodTags } from '../ui/cards.js';
import { Wheel } from '../ui/wheel.js';
import { categoriesFor } from '../core/catalog.js';
import { MEALS, localDateKey } from '../core/model.js';
import { preferenceReasons, sampleDistinct, seededRandom, spinBoard, weightedPick } from '../core/selection.js';
import { deliveryLinks } from '../services/delivery.js';
import { APP_CONFIG } from '../../config.js';

const BOARD_SIZE = 8;

export function initDecision(app) {
    const root = $('#wheel-view'), wheel = new Wheel($('#wheel-canvas'), $('#wheel-photos'));
    let signature = '', dailyFood, dailyKey = '', recommendationKey = '', actionsKey = '', extrasKey = '';
    let mealsKey = '', categoriesKey = '', discoveryKey = '';
    const announcement = document.createElement('span');
    announcement.className = 'sr-only'; announcement.setAttribute('role', 'status'); announcement.setAttribute('aria-live', 'polite'); root.append(announcement);
    const recommendation = () => {
        const data = app.store.get(), result = app.ui.result, food = result || dailyFood;
        const target = $('#recommendation');
        if (!food) { target.innerHTML = emptyState('留一点空间给新口味', '调整一下筛选，就能找到新的灵感。', '<a class="text-button" href="#settings">调整饮食偏好</a>'); recommendationKey = ''; return; }
        const favorite = data.favorites.some(item => item.id === food.id);
        const reasons = preferenceReasons(food, data.preferences);
        const record = data.history.find(item => item.id === app.ui.resultEventId);
        target.classList.toggle('is-result', Boolean(result));
        const nextKey = JSON.stringify(food);
        if (nextKey !== recommendationKey) {
            target.innerHTML = `<div class="recommendation-heading"><h2 id="result-title" tabindex="-1"></h2><span>${icon('bowl')}好好吃这一餐</span></div><button class="recommendation-image" data-food-action="detail" data-food-id="${attr(food.id)}" aria-label="查看${attr(food.name)}详情">${foodImage(food, { eager: true, variant: 'hero', priority: 'high' })}</button><div class="recommendation-body"><div class="recommendation-copy"><div class="recommendation-meta"><span class="food-category">${escapeHtml(food.category)}</span><div class="tag-list">${foodTags(food)}</div></div><h3>${escapeHtml(food.name)}</h3><p>${escapeHtml(food.description || '一份新期待，留给这一餐。')}</p></div><div class="recommendation-actions"></div><div class="recommendation-extra"></div></div>`;
            recommendationKey = nextKey; actionsKey = ''; extrasKey = '';
            target.dataset.foodId = food.id;
        }
        $('#result-title').textContent = result ? '这一餐，就它了。' : '今日灵感';
        const actions = `${result ? `<button class="button primary" data-food-action="plan" data-food-id="${attr(food.id)}">${icon('calendar')}加入计划</button>` : `<button class="button primary" id="choose-daily">${icon('check')}就选这道</button><button class="button secondary" id="shuffle-daily">${icon('refresh')}换一道</button>`}<button class="icon-btn${favorite ? ' is-favorite' : ''}" data-food-action="favorite" data-food-id="${attr(food.id)}" aria-label="${favorite ? '取消收藏' : '收藏'}${attr(food.name)}" aria-pressed="${favorite}">${icon('heart')}</button>${result ? `<button class="icon-btn" data-food-action="share" data-food-id="${attr(food.id)}" aria-label="分享${attr(food.name)}">${icon('share')}</button>` : ''}`;
        const extras = `${reasons.length && result ? '<p class="fine-print">这次结果已保留；下一次抽取将按新偏好筛选。</p>' : ''}${result ? `<div class="result-secondary"><button class="text-button" id="spin-again">${icon('refresh')}再抽一次</button><button class="text-button" id="result-eaten" ${record?.eaten ? 'disabled' : ''}>${icon('check')}${record?.eaten ? '已记为吃过' : '记为已吃'}</button></div>${deliveryLinks(food)}` : ''}`;
        if (actions !== actionsKey) { $('.recommendation-actions', target).innerHTML = actions; actionsKey = actions; }
        if (extras !== extrasKey) { $('.recommendation-extra', target).innerHTML = extras; extrasKey = extras; }
    };
    const render = (reason) => {
        if (reason === 'settings') { wheel.refreshTheme(); return; }
        if (reason === 'favorites') { syncFavoriteButtons(root, app.store.get().favorites); return; }
        if (reason === 'plan' || reason === 'nearby-setting') return;
        const data = app.store.get(), categories = categoriesFor(app.dataset());
        app.ui.categories = app.ui.categories.filter(value => categories.includes(value));
        const pool = app.pool();
        const key = pool.map(food => food.id).join('|');
        const nextDailyKey = `${localDateKey()}-${app.meal()}-${key}-${JSON.stringify(data.preferences)}-${app.ui.weather?.kind || ''}`;
        if (nextDailyKey !== dailyKey) {
            dailyKey = nextDailyKey;
            const random = seededRandom(`${localDateKey()}-${app.meal()}-${key}`);
            dailyFood = weightedPick(pool, { preferences: data.preferences, history: data.history, weather: app.ui.weather, random });
        }
        // Put the main photograph on the network before the tiny wheel images.
        if (!app.ui.spinning) recommendation();
        if (!app.ui.spinning && (key !== signature || !wheel.foods.length)) {
            signature = key;
            wheel.setFoods(sampleDistinct(pool, BOARD_SIZE, seededRandom(key)));
        }
        const nextMeals = `${app.meal()}-${app.ui.spinning}`;
        if (nextMeals !== mealsKey) {
            $('#meal-tabs').innerHTML = [...MEALS, { key: 'all', label: '不限' }].map(meal => `<button class="segment${meal.key === app.meal() ? ' active' : ''}" data-meal="${meal.key}" aria-pressed="${meal.key === app.meal()}" ${app.ui.spinning ? 'disabled' : ''}>${meal.label}</button>`).join('');
            mealsKey = nextMeals;
        }
        $('#meal-tabs').hidden = app.ui.useNearby;
        const nextCategories = `${categories.join('|')}|${app.ui.categories.join('|')}|${app.ui.spinning}`;
        if (nextCategories !== categoriesKey) {
            $('#wheel-categories').innerHTML = ['', ...categories].map(category => `<button class="chip${category ? app.ui.categories.includes(category) ? ' active' : '' : !app.ui.categories.length ? ' active' : ''}" data-wheel-category="${attr(category)}" aria-pressed="${category ? app.ui.categories.includes(category) : !app.ui.categories.length}" ${app.ui.spinning ? 'disabled' : ''}>${escapeHtml(category || '全部分类')}</button>`).join('');
            categoriesKey = nextCategories;
        }
        $('#filter-summary').textContent = app.ui.categories.length ? `已选 ${app.ui.categories.length} 个分类` : app.ui.useNearby ? '附近全部分类' : '所有分类';
        const preferenceCount = Object.entries(data.preferences).filter(([key, value]) => ['avoidSpicy', 'vegetarian', 'preferLight'].includes(key) && value).length + (data.preferences.excludedIds.length || data.preferences.excludedKeywords.length ? 1 : 0);
        $('#preference-shortcut').textContent = preferenceCount ? `${preferenceCount} 项饮食偏好已生效` : '饮食偏好';
        $('#wheel-source').hidden = !app.ui.useNearby;
        $('#wheel-source').disabled = app.ui.spinning;
        $('#candidate-count').innerHTML = `<strong>${pool.length}</strong> ${app.ui.useNearby ? '家店铺' : '道美食'}，等一个好选择`;
        $('#wheel-explanation').textContent = pool.length > BOARD_SIZE ? `全部 ${pool.length} 项都有机会 · 盘面展示本轮 ${BOARD_SIZE} 项` : pool.length === 1 ? '只有一个候选，可换个范围发现更多选择' : data.preferences.fatigueDecay ? '最近选过的少抽到，每次都多点新鲜感' : '你的下一餐，藏在转盘里';
        $('#spin-btn').disabled = !pool.length || app.ui.spinning;
        $('#spin-btn').setAttribute('aria-busy', String(app.ui.spinning));
        $('#wheel-hub').disabled = !pool.length || app.ui.spinning;
        $('#wheel-hub').setAttribute('aria-busy', String(app.ui.spinning));
        $('#wheel-hub > span:last-child').textContent = app.ui.spinning ? '挑选中' : '开饭';
        $('.wheel-stage').classList.toggle('is-spinning', app.ui.spinning);
        $('#spin-btn').innerHTML = `${icon('wheel')}<span>${app.ui.spinning ? '正在挑选好滋味…' : '开始抽取'}</span>${icon('arrow')}`;
        $('#tournament-btn').disabled = pool.length < 2 || app.ui.spinning;
        for (const button of root.querySelectorAll('#choose-daily, #shuffle-daily, #spin-again')) button.disabled = app.ui.spinning;
        $('.wheel-stage').hidden = !pool.length;
        $('#wheel-empty').hidden = !!pool.length;
        const nextDiscovery = `${localDateKey()}-${key}`;
        if (nextDiscovery !== discoveryKey) {
            $('#discovery-grid').innerHTML = sampleDistinct(pool, 4, seededRandom(`discovery-${localDateKey()}-${key}`)).map(food => foodCard(food, { favorites: data.favorites, excluded: data.preferences.excludedIds })).join('') || '<p class="muted">还没有合适的候选，调整筛选后再来看看。</p>';
            discoveryKey = nextDiscovery;
        } else syncFavoriteButtons(root, data.favorites);
        wheel.refreshTheme();
    };
    async function spin() {
        if (app.ui.spinning) return;
        const pool = app.pool(), data = app.store.get();
        const food = weightedPick(pool, { preferences: data.preferences, history: data.history, weather: app.ui.weather, lastId: app.ui.result?.id || data.history[0]?.food.id });
        if (!food) { toast('当前没有符合条件的美食，请调整筛选'); return; }
        const board = spinBoard(pool, food, Math.random, BOARD_SIZE);
        app.ui.spinning = true; $('#category-details').open = false; render();
        try {
            await wheel.spin(board, food, { onTick: app.feedback.tick, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches });
            app.ui.spinning = false;
            // Keep the exact landed board even if another tab changed preferences mid-spin.
            signature = app.pool().map(item => item.id).join('|');
            app.pick(food, 'wheel'); app.feedback.finish();
            if (!matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(60);
        } catch { app.ui.spinning = false; render(); toast('抽取未完成，请再试一次'); }
    }
    function tournament() {
        if (app.ui.spinning) return;
        const eligible = app.pool(), data = app.store.get();
        const size = 2 ** Math.floor(Math.log2(Math.min(eligible.length, 8)));
        if (size < 2) { toast('至少需要两道候选美食'); return; }
        let queue = [], pool = [...eligible], winners = [], round = 1, match = 1;
        for (let i = 0; i < size; i++) { const food = weightedPick(pool, { preferences: data.preferences, history: data.history }); queue.push(food); pool = pool.filter(item => item.id !== food.id); }
        const paint = () => {
            const pair = queue.slice(0, 2);
            app.dialog.open({ title: `${queue.length + winners.length * 2 === 2 ? '最后一轮' : `第 ${round} 轮`}，更想吃哪一道？`, className: 'tournament-dialog', content: `<p class="muted">${size} 道候选 · 第 ${match} 次选择，跟着直觉走。</p><div class="duel-grid">${pair.map((food, index) => `<button class="duel-card" data-duel-index="${index}">${foodImage(food, { eager: true })}<span class="food-category">${escapeHtml(food.category)}</span><strong>${escapeHtml(food.name)}</strong><span>就选它${icon('arrow')}</span></button>`).join('')}</div>`, onMount(dialog) {
                on(dialog, 'click', '[data-duel-index]', (_, button) => {
                    const food = pair[Number(button.dataset.duelIndex)]; winners.push(food); queue = queue.slice(2); match++;
                    if (!queue.length) {
                        if (winners.length === 1) {
                            if (preferenceReasons(food, app.store.get().preferences).length) { app.dialog.close(); toast('偏好已更新，请重新开始淘汰赛'); return; }
                            app.dialog.close(); app.pick(food, 'tournament'); app.feedback.finish(); return;
                        }
                        queue = winners; winners = []; round++;
                    }
                    paint();
                });
            } });
        };
        paint();
    }
    on(root, 'click', '[data-meal]', (_, button) => { if (app.ui.spinning) return; app.store.update(data => { data.settings.meal = button.dataset.meal; }, 'meal'); });
    on(root, 'click', '[data-wheel-category]', (_, button) => {
        if (app.ui.spinning) return;
        const value = button.dataset.wheelCategory;
        app.ui.categories = !value ? [] : app.ui.categories.includes(value) ? app.ui.categories.filter(item => item !== value) : [...app.ui.categories, value];
        render();
        root.querySelector(`[data-wheel-category="${CSS.escape(value)}"]`)?.focus({ preventScroll: true });
    });
    $('#reset-wheel').addEventListener('click', () => { app.ui.categories = []; app.store.update(data => { data.settings.meal = 'all'; }, 'meal'); });
    $('#spin-btn').addEventListener('click', spin);
    $('#wheel-hub').addEventListener('click', spin);
    $('#tournament-btn').addEventListener('click', tournament);
    on(root, 'click', '#spin-again', spin);
    on(root, 'click', '#choose-daily', () => { if (dailyFood) app.pick(dailyFood, 'daily'); });
    on(root, 'click', '#shuffle-daily', () => {
        if (app.ui.spinning) return;
        const pool = app.pool(), data = app.store.get();
        const alternatives = pool.filter(food => food.id !== dailyFood?.id);
        dailyFood = weightedPick(alternatives.length ? alternatives : pool, { preferences: data.preferences, history: data.history, weather: app.ui.weather });
        recommendation();
        if (dailyFood) announcement.textContent = `换个灵感：${dailyFood.name}`;
        $('#shuffle-daily')?.focus({ preventScroll: true });
    });
    on(root, 'click', '#result-eaten', () => { app.markResultEaten(); toast('已记为实际吃过'); });
    $('#wheel-source').addEventListener('click', () => { app.features.nearby.cancel(); app.ui.useNearby = false; app.ui.categories = []; render(); toast('已切回我的菜单'); });
    const sponsor = APP_CONFIG.sponsor;
    if (sponsor?.name) {
        try {
            const url = new URL(sponsor.url);
            if (url.protocol === 'https:') {
                const element = document.createElement('aside'); element.className = 'sponsor';
                element.innerHTML = `<span>推广</span><strong>${escapeHtml(sponsor.name)}</strong><p>${escapeHtml(sponsor.desc || '')}</p><a class="text-button" href="${attr(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sponsor.cta || '去看看')}${icon('external')}</a>`;
                $('.decision-side').append(element);
            }
        } catch { /* Invalid optional advertising configuration stays hidden. */ }
    }
    return { render, spin, reveal() { recommendation(); announcement.textContent = `这一餐推荐：${app.ui.result.name}`; $('#wheel-canvas').setAttribute('aria-label', `美食转盘，本轮抽中${app.ui.result.name}`); if (matchMedia('(max-width: 760px)').matches) $('#recommendation').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); } };
}
