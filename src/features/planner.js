import { $, attr, escapeHtml, emptyState, foodImage, on, toast, copyText } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { PLAN_MEALS, weekDays, localDateKey, currentMeal, isDateKey, LIMITS } from '../core/model.js';
import { filterPlanFoods, generateWeek, preferenceReasons, weightedPick } from '../core/selection.js';
import { addHistory } from '../core/storage.js';
import { resolveFood } from '../core/catalog.js';

export function initPlanner(app) {
    const root = $('#plan-view');
    let offset = 0;
    root.innerHTML = `<div class="page-heading"><div><h1 id="plan-heading">把一周，安排得有滋有味。</h1><p>按你的喜好安排三餐，喜欢的锁定，想换的再换。</p></div><button class="button primary" id="fill-plan">${icon('calendar')}一键安排空位</button></div><div class="plan-toolbar"><div class="week-navigation"><button class="icon-btn previous" id="previous-week" aria-label="上一周">${icon('chevron')}</button><h2 id="week-label"></h2><button class="icon-btn" id="next-week" aria-label="下一周">${icon('chevron')}</button><button class="text-button" id="current-week">回到本周</button></div><div class="heading-actions"><button class="button secondary" id="copy-plan">${icon('share')}复制周计划</button><button class="button secondary" id="regenerate-plan">${icon('refresh')}重排未锁定</button></div></div><div class="plan-summary" id="plan-summary" role="status"></div><div class="week-grid" id="week-grid"></div><div class="plan-bottom"><p>${icon('lock')}锁定和已吃的餐次不会被自动替换。手动添加的菜品会一直保留，直到你调整。</p><button class="text-button danger-text" id="clear-plan">清空本周未锁定餐次</button></div>`;
    const days = () => weekDays(new Date(), offset);
    const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    const trimPlan = data => {
        const keys = Object.keys(data.plan).sort();
        while (keys.length > LIMITS.planDays) delete data.plan[keys.shift()];
    };
    const render = () => {
        const dates = days(), data = app.store.get(), menu = app.menu();
        const today = localDateKey();
        $('#week-label').textContent = `${dateLabel(dates[0])} — ${dateLabel(dates[6])}`;
        let filled = 0, locked = 0, conflicts = 0;
        $('#week-grid').innerHTML = dates.map((date, dayIndex) => `<section class="plan-day${date === today ? ' today' : ''}" aria-label="${date}"><h2><span>${['周一', '周二', '周三', '周四', '周五', '周六', '周日'][dayIndex]}${date === today ? ' · 今天' : ''}</span><time datetime="${date}">${dateLabel(date)}</time></h2>${PLAN_MEALS.map(({ key, label }) => {
            const slot = data.plan[date]?.[key];
            if (!slot) return `<div class="meal-slot empty-slot"><span class="meal-label">${label}</span><button class="add-slot" data-plan-action="select" data-date="${date}" data-meal="${key}" aria-label="安排${date}${label}">${icon('plus')}<span>安排${label}</span></button></div>`;
            filled++; if (slot.locked) locked++;
            const food = resolveFood(slot.food, menu), reasons = preferenceReasons(food, data.preferences);
            if (reasons.length) conflicts++;
            return `<div class="meal-slot${slot.locked ? ' locked-slot' : ''}${slot.eaten ? ' eaten-slot' : ''}"><div class="meal-slot-head"><span class="meal-label">${label}</span><button class="icon-btn small${slot.locked ? ' active' : ''}" data-plan-action="lock" data-date="${date}" data-meal="${key}" aria-pressed="${slot.locked}" aria-label="${slot.locked ? '解锁' : '锁定'}${date}${label}">${icon(slot.locked ? 'lock' : 'unlock')}</button></div><button class="plan-food" data-food-action="detail" data-food-id="${attr(food.id)}">${foodImage(food, { variant: 'small' })}<strong>${escapeHtml(food.name)}</strong></button>${reasons.length ? `<span class="plan-conflict" title="${attr(reasons.join('、'))}">与当前偏好不符</span>` : ''}<div class="slot-actions"><button class="icon-btn small" data-plan-action="shuffle" data-date="${date}" data-meal="${key}" ${slot.locked || slot.eaten ? 'disabled' : ''} aria-label="换一道${date}${label}">${icon('refresh')}</button><button class="icon-btn small" data-plan-action="select" data-date="${date}" data-meal="${key}" ${slot.locked || slot.eaten ? 'disabled' : ''} aria-label="手动选择${date}${label}">${icon('grid')}</button><button class="icon-btn small" data-plan-action="remove" data-date="${date}" data-meal="${key}" ${slot.locked || slot.eaten ? 'disabled' : ''} aria-label="移除${date}${label}">${icon('close')}</button></div><button class="eat-button${slot.eaten ? ' eaten' : ''}" data-plan-action="eat" data-date="${date}" data-meal="${key}" ${date > today ? 'disabled' : ''} aria-pressed="${slot.eaten}">${icon('check')}${slot.eaten ? '已吃 · 可撤销' : date > today ? '到当天再打卡' : '记为已吃'}</button></div>`;
        }).join('')}</section>`).join('');
        $('#plan-summary').innerHTML = `<span>已安排 <strong>${filled}</strong> / 21 餐</span><span>${locked} 餐已锁定</span>${conflicts ? `<a href="#settings" class="plan-conflict">${conflicts} 餐与新偏好不符，已为你保留，可手动调整</a>` : '<span>自动安排遵守你的饮食偏好</span>'}`;
    };
    const setSlot = (date, meal, food, { allowConflict = false } = {}) => {
        if (!isDateKey(date) || !PLAN_MEALS.some(item => item.key === meal)) throw new Error('请选择有效日期和餐次');
        if (!allowConflict && preferenceReasons(food, app.store.get().preferences).length) throw new Error('当前偏好不包含这道菜，请重新选择');
        app.store.update(data => {
            const previous = data.plan[date]?.[meal];
            if (previous?.locked || previous?.eaten) throw new Error('这餐已锁定或已吃，请先解除状态再调整');
            data.plan[date] ||= {};
            data.plan[date][meal] = { food, locked: false, eaten: false }; trimPlan(data);
        }, 'plan');
    };
    function openSlot(date, meal) {
        const label = PLAN_MEALS.find(item => item.key === meal).label;
        let query = '', shown = 48, candidates = [];
        app.dialog.open({ title: `${dateLabel(date)}的${label}，想吃什么`, className: 'picker-dialog', content: `<label class="search-field">${icon('search')}<input type="search" id="plan-search" placeholder="搜索菜名" aria-label="搜索计划候选" autofocus></label><p class="fine-print">只显示适合${label}且符合当前饮食偏好的菜品。</p><div class="plan-picker-list" id="plan-picker-list"></div><p id="picker-error" class="form-error" role="alert"></p>`, onMount(dialog) {
            const paint = () => {
                candidates = filterPlanFoods(app.menu(), { meal, preferences: app.store.get().preferences, search: query });
                $('#plan-picker-list', dialog).innerHTML = candidates.length ? candidates.slice(0, shown).map(food => `<button class="picker-item" data-plan-choice="${attr(food.id)}">${foodImage(food, { variant: 'small' })}<span><strong>${escapeHtml(food.name)}</strong><small>${escapeHtml(food.category)}</small></span>${icon('plus')}</button>`).join('') + (candidates.length > shown ? '<button class="button secondary" id="more-candidates">显示更多</button>' : '') : emptyState('没有符合条件的菜品', '试试其他关键词，或到偏好设置中调整筛选。');
            };
            $('#plan-search', dialog).addEventListener('input', event => { query = event.target.value; shown = 48; paint(); });
            on(dialog, 'click', '#more-candidates', () => { shown += 48; paint(); });
            on(dialog, 'click', '[data-plan-choice]', (_, button) => {
                try { const food = candidates.find(item => item.id === button.dataset.planChoice); setSlot(date, meal, food); app.dialog.close(); toast('这一餐安排好了'); }
                catch (error) { $('#picker-error', dialog).textContent = error.message; }
            });
            paint();
        } });
    }
    function openAdd(food) {
        const reasons = preferenceReasons(food, app.store.get().preferences);
        const initialMeal = PLAN_MEALS.some(item => item.key === currentMeal()) ? currentMeal() : 'dinner';
        app.dialog.open({ title: '把这道美食放进计划', content: `<div class="chosen-food">${foodImage(food, { eager: true, variant: 'small' })}<div><strong>${escapeHtml(food.name)}</strong><p>${escapeHtml(food.category)}</p></div></div><form id="add-plan-form"><div class="form-columns"><div class="field"><label for="plan-date">用餐日期</label><input type="date" id="plan-date" name="date" value="${localDateKey()}" required></div><div class="field"><label for="plan-meal">哪一餐</label><select id="plan-meal" name="meal">${PLAN_MEALS.map(meal => `<option value="${meal.key}" ${meal.key === initialMeal ? 'selected' : ''}>${meal.label}</option>`).join('')}</select></div></div>${reasons.length ? `<p class="notice">${escapeHtml(reasons.join('、'))}</p><label class="checkbox-label"><input type="checkbox" id="allow-conflict" required>我仍然想把这道菜加入计划</label>` : ''}<p class="form-error" id="add-plan-error" role="alert"></p><p class="fine-print">该餐已有安排时会替换它；锁定或已吃的餐次需先解除状态。</p><div class="dialog-actions"><button type="button" class="button secondary" data-dialog-close>取消</button><button type="submit" class="button primary">加入计划</button></div></form>`, onMount(dialog) {
            $('#add-plan-form', dialog).addEventListener('submit', event => {
                event.preventDefault(); const fields = new FormData(event.target);
                try { setSlot(fields.get('date'), fields.get('meal'), food, { allowConflict: $('#allow-conflict', dialog)?.checked === true }); app.dialog.close(); toast('已加入用餐计划'); }
                catch (error) { $('#add-plan-error', dialog).textContent = error.message; }
            });
        } });
    }
    function fill(overwrite) {
        const data = app.store.get();
        const result = generateWeek({ days: days(), menu: app.menu(), plan: data.plan, preferences: data.preferences, history: data.history, overwrite });
        if (!result.filled) { toast(result.missing ? '当前偏好下没有合适菜品，请调整偏好或添加菜单' : '这一周已经安排好啦，锁定和已吃的餐次会保留'); return; }
        app.store.update(draft => { draft.plan = result.plan; trimPlan(draft); }, 'plan');
        toast(`已安排 ${result.filled} 餐${result.missing ? `，${result.missing} 餐没有合适候选` : ''}${result.repeats ? `；候选有限，${result.repeats} 餐使用了重复菜品` : ''}`);
    }
    $('#fill-plan').addEventListener('click', () => fill(false));
    $('#regenerate-plan').addEventListener('click', () => app.dialog.confirm({ title: '换一份本周计划？', description: '会重新安排所有未锁定且未吃的餐次；锁定和已吃的餐次保留。', confirmText: '重新安排', onConfirm: () => fill(true) }));
    $('#previous-week').addEventListener('click', () => { offset--; render(); });
    $('#next-week').addEventListener('click', () => { offset++; render(); });
    $('#current-week').addEventListener('click', () => { offset = 0; render(); });
    $('#copy-plan').addEventListener('click', async () => {
        const data = app.store.get();
        const text = `我的一周用餐计划\n${days().map(date => `${date}\n${PLAN_MEALS.map(meal => `${meal.label}：${data.plan[date]?.[meal.key]?.food.name || '待安排'}`).join(' · ')}`).join('\n\n')}`;
        try { await copyText(text); toast('周计划已复制，可以发给一起吃饭的人'); } catch (error) { toast(error.message); }
    });
    $('#clear-plan').addEventListener('click', () => app.dialog.confirm({ title: '清空本周未锁定餐次？', description: '锁定和已吃的餐次会保留，其他餐次将回到待安排状态。', confirmText: '清空未锁定餐次', danger: true, onConfirm() {
        app.store.update(data => { for (const date of days()) { for (const meal of PLAN_MEALS) if (data.plan[date]?.[meal.key] && !data.plan[date][meal.key].locked && !data.plan[date][meal.key].eaten) delete data.plan[date][meal.key]; if (data.plan[date] && !Object.keys(data.plan[date]).length) delete data.plan[date]; } }, 'plan'); toast('已清空可调整的餐次');
    } }));
    on(root, 'click', '[data-plan-action]', (_, button) => {
        const { date, meal, planAction: action } = button.dataset;
        const data = app.store.get(), slot = data.plan[date]?.[meal];
        try {
            if (action === 'select') { openSlot(date, meal); return; }
            if (!slot) return;
            if (action === 'lock') app.store.update(draft => { draft.plan[date][meal].locked = !slot.locked; }, 'plan');
            if (action === 'remove') app.store.update(draft => { if (slot.locked || slot.eaten) return; delete draft.plan[date][meal]; if (!Object.keys(draft.plan[date]).length) delete draft.plan[date]; }, 'plan');
            if (action === 'shuffle') {
                const candidates = filterPlanFoods(app.menu(), { preferences: data.preferences, meal }).filter(food => food.id !== slot.food.id);
                const used = new Set(days().flatMap(day => Object.values(data.plan[day] || {}).map(value => value.food.id)));
                const fresh = candidates.filter(food => !used.has(food.id));
                const food = weightedPick(fresh.length ? fresh : candidates, { history: data.history, preferences: data.preferences });
                if (!food) { toast('没有其他符合偏好的菜品，已保留当前安排'); return; }
                setSlot(date, meal, food); toast(`换成了${food.name}`);
            }
            if (action === 'eat' && date <= localDateKey()) app.store.update(draft => {
                const id = `plan:${date}:${meal}`;
                draft.plan[date][meal].eaten = !slot.eaten;
                draft.history = draft.history.filter(item => item.id !== id);
                if (!slot.eaten) {
                    const timestamp = date === localDateKey() ? Date.now() : new Date(`${date}T${{ breakfast: '08', lunch: '12', dinner: '18' }[meal]}:00:00`).getTime();
                    addHistory(draft, slot.food, 'plan', true, timestamp); draft.history[0].id = id;
                }
            }, 'plan');
        } catch (error) { toast(error.message); }
    });
    return { render, openAdd, openSlot };
}
