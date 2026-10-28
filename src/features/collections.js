import { $, attr, emptyState, escapeHtml, foodImage, formatDate, on, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { foodCard } from '../ui/cards.js';
import { filterFoods, weightedPick } from '../core/selection.js';
import { localDateKey } from '../core/model.js';
import { resolveFood } from '../core/catalog.js';

export function initCollections(app) {
    const favoritesRoot = $('#favorites-view'), historyRoot = $('#history-view');
    let onlyEaten = false;
    favoritesRoot.innerHTML = `<div class="page-heading"><div><h1 id="favorites-heading">喜欢的味道，留在这里。</h1><p id="favorites-description"></p></div><button class="button primary" id="pick-favorite">${icon('wheel')}从收藏里挑一道</button></div><div class="food-grid" id="favorites-grid"></div>`;
    historyRoot.innerHTML = `<div class="page-heading"><div><h1 id="history-heading">每一餐，都有迹可循。</h1><p>抽中的惊喜与吃过的美味，分开记下来。</p></div><button class="button secondary" id="clear-history">${icon('trash')}清空记录</button></div><div class="history-summary" id="history-summary"></div><div class="results-toolbar"><label class="checkbox-label"><input type="checkbox" id="only-eaten">只看实际吃过</label><span class="muted">保留最近 300 条</span></div><div class="history-list" id="history-list"></div>`;
    const renderFavorites = () => {
        const data = app.store.get(), foods = data.favorites.map(food => resolveFood(food, app.menu()));
        $('#favorites-description').textContent = `收藏了 ${foods.length} 道美食。随机挑选时会遵守你的饮食偏好。`;
        $('#pick-favorite').disabled = !filterFoods(foods, { preferences: data.preferences }).length;
        $('#favorites-grid').innerHTML = foods.length ? foods.map(food => foodCard(food, { favorites: data.favorites, excluded: data.preferences.excludedIds })).join('') : emptyState('留住你喜欢的那一口', '在菜单或抽取结果中点一下爱心，下次就更容易找到它。', '<a class="button primary" href="#list">去菜单挑选</a>');
    };
    const renderHistory = () => {
        const data = app.store.get(), history = onlyEaten ? data.history.filter(item => item.eaten) : data.history;
        const weekAgo = Date.now() - 7 * 86400000;
        const recent = data.history.filter(item => item.timestamp >= weekAgo && item.timestamp <= Date.now());
        $('#history-summary').innerHTML = `<p>最近 7 天 <strong>${recent.length}</strong> 次选择</p><p>尝试 <strong>${new Set(recent.map(item => item.food.id)).size}</strong> 种美食</p><p>实际吃过 <strong>${recent.filter(item => item.eaten).length}</strong> 餐</p>`;
        $('#clear-history').disabled = !data.history.length;
        if (!history.length) { $('#history-list').innerHTML = emptyState(onlyEaten ? '还没有用餐打卡' : '下一餐，留下第一个好选择', onlyEaten ? '在记录或用餐计划中点击「记为已吃」，就能区分实际吃过的美食。' : '转动转盘，或从菜单里选一道美食，记录会出现在这里。', '<a class="button primary" href="#wheel">去转一转</a>'); return; }
        let lastDay = '';
        $('#history-list').innerHTML = history.map(item => {
            const day = localDateKey(new Date(item.timestamp));
            const heading = day !== lastDay ? `<h2 class="history-day">${day === localDateKey() ? '今天' : escapeHtml(day)}</h2>` : '';
            lastDay = day;
            const source = { wheel: '转盘抽取', daily: '今日推荐', favorite: '收藏随机', tournament: '淘汰赛胜出', plan: '用餐计划', manual: '手动选择' }[item.source];
            return `${heading}<article class="history-row"><button class="history-food" data-food-action="detail" data-food-id="${attr(item.food.id)}">${foodImage(item.food, { variant: 'small' })}<span><strong>${escapeHtml(item.food.name)}</strong><small>${source} · ${formatDate(item.timestamp)}</small></span></button><div class="history-row-actions"><button class="eat-button${item.eaten ? ' eaten' : ''}" data-history-eat="${attr(item.id)}" aria-pressed="${item.eaten}">${icon('check')}${item.eaten ? '已吃' : '记为已吃'}</button><button class="icon-btn" data-history-delete="${attr(item.id)}" aria-label="删除${attr(item.food.name)}的记录">${icon('trash')}</button></div></article>`;
        }).join('');
    };
    $('#pick-favorite').addEventListener('click', () => {
        const data = app.store.get();
        const foods = filterFoods(data.favorites.map(food => resolveFood(food, app.menu())), { preferences: data.preferences });
        const food = weightedPick(foods, { history: data.history, preferences: data.preferences, lastId: app.ui.result?.id || data.history[0]?.food.id });
        if (food) app.pick(food, 'favorite'); else toast('当前偏好下没有可选收藏，请调整偏好');
    });
    $('#only-eaten').addEventListener('change', event => { onlyEaten = event.target.checked; renderHistory(); });
    $('#clear-history').addEventListener('click', () => app.dialog.confirm({ title: '清空全部选择记录？', description: '将清空选择与用餐记录，不影响收藏和已安排的计划。此操作无法撤销。', confirmText: '清空记录', danger: true, onConfirm() { app.store.update(data => { data.history = []; }, 'history'); toast('记录已清空'); } }));
    on(historyRoot, 'click', '[data-history-delete]', (_, button) => {
        app.dialog.confirm({ title: '删除这条记录？', description: '删除后不会改变收藏和用餐计划。', confirmText: '删除记录', danger: true, onConfirm() { app.store.update(data => { data.history = data.history.filter(item => item.id !== button.dataset.historyDelete); }, 'history'); toast('记录已删除'); } });
    });
    on(historyRoot, 'click', '[data-history-eat]', (_, button) => app.store.update(data => {
        const item = data.history.find(entry => entry.id === button.dataset.historyEat);
        if (!item) return;
        item.eaten = !item.eaten;
        if (item.id.startsWith('plan:')) {
            const [, date, meal] = item.id.split(':');
            if (data.plan[date]?.[meal]) data.plan[date][meal].eaten = item.eaten;
        }
    }, 'history'));
    return { favorites: { render: renderFavorites }, history: { render: renderHistory } };
}
