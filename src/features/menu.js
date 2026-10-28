import { $, attr, emptyState, escapeHtml, on, toast, downloadFile, syncFavoriteButtons } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { foodCard } from '../ui/cards.js';
import { categoriesFor } from '../core/catalog.js';
import { cleanText, normalizeFood, MEALS, LIMITS } from '../core/model.js';
import { filterFoods } from '../core/selection.js';
import { createMenuExport, parseMenu } from '../core/backup.js';

export function initMenu(app) {
    const root = $('#list-view');
    let category = '', query = '', respectPreferences = true, order = 'default', shown = 24, searchTimer, categoriesKey = '';
    root.innerHTML = `<div class="page-heading"><div><h1 id="list-heading">你的美食灵感库</h1><p id="menu-description">熟悉的味道，和下一道想吃的。</p></div><div class="heading-actions"><button class="button secondary" id="manage-menu">管理菜单</button><button class="button primary" id="add-food">${icon('plus')}添加美食</button></div></div><div class="browse-toolbar"><label class="search-field">${icon('search')}<input type="search" id="menu-search" placeholder="搜索菜名、分类或描述" aria-label="搜索美食"></label><label class="sort-field"><span class="sr-only">排序方式</span><select id="menu-sort"><option value="default">默认排序</option><option value="name">按名称排序</option><option value="favorite">收藏优先</option></select></label></div><div id="menu-categories" class="category-bar" aria-label="按分类浏览"></div><div class="results-toolbar"><span id="menu-count" role="status"></span><label class="checkbox-label"><input type="checkbox" id="respect-preferences" checked>按我的饮食偏好</label></div><div class="food-grid" id="menu-grid"></div>`;
    const more = document.createElement('div'); more.className = 'menu-more'; root.append(more);
    const render = (reason) => {
        if (reason === 'settings' || reason === 'plan' || reason === 'nearby-setting') return;
        if (reason === 'favorites' && order !== 'favorite') { syncFavoriteButtons(root, app.store.get().favorites); return; }
        const menu = app.dataset();
        const categories = categoriesFor(menu);
        if (!categories.includes(category)) category = '';
        const nextCategories = `${categories.join('|')}|${category}`;
        if (nextCategories !== categoriesKey) {
            $('#menu-categories').innerHTML = ['', ...categories].map(value => `<button class="chip${value === category ? ' active' : ''}" data-category="${attr(value)}" aria-pressed="${value === category}">${escapeHtml(value || '全部')}</button>`).join('');
            categoriesKey = nextCategories;
        }
        const data = app.store.get();
        let foods = filterFoods(menu, { preferences: respectPreferences ? data.preferences : undefined, categories: category ? [category] : [], search: query });
        if (order === 'name') foods.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        if (order === 'favorite') { const favoriteIds = new Set(data.favorites.map(food => food.id)); foods.sort((a, b) => Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id))); }
        $('#menu-count').textContent = `找到 ${foods.length} ${app.ui.useNearby ? '家店铺' : '道美食'} · 共 ${menu.length} 项`;
        $('#menu-description').textContent = app.ui.useNearby ? '正在浏览附近店铺，口味标签以商家实际信息为准。' : data.menuOverride ? '正在使用你的专属菜单，可随时恢复内置菜单。' : '熟悉的味道，和下一道想吃的。';
        $('#menu-grid').innerHTML = foods.length ? foods.slice(0, shown).map(food => foodCard(food, { favorites: data.favorites, excluded: data.preferences.excludedIds })).join('') : emptyState('还没有找到这道美味', '试试其他关键词、全部分类，或调整饮食偏好。', '<button class="button secondary" id="clear-search">清除搜索与分类</button><a class="text-button" href="#settings">调整饮食偏好</a>');
        more.innerHTML = foods.length > shown ? `<button class="button secondary" id="more-foods">再看 ${Math.min(24, foods.length - shown)} 道美食${icon('down')}</button><p>已展示 ${shown} / ${foods.length} 道</p>` : '';
    };
    const search = event => {
        clearTimeout(searchTimer);
        query = event.target.value; shown = 24;
        if (!event.isComposing) searchTimer = setTimeout(render, 90);
    };
    $('#menu-search').addEventListener('input', search);
    $('#menu-search').addEventListener('compositionend', search);
    $('#respect-preferences').addEventListener('change', event => { respectPreferences = event.target.checked; shown = 24; render(); });
    $('#menu-sort').addEventListener('change', event => { order = event.target.value; shown = 24; render(); });
    on(root, 'click', '#more-foods', () => { const count = $('#menu-grid').children.length; shown += 24; render(); $('#menu-grid').children[count]?.querySelector('button')?.focus({ preventScroll: true }); });
    on(root, 'click', '[data-category]', (_, button) => { category = button.dataset.category; shown = 24; render(); root.querySelector(`[data-category="${CSS.escape(category)}"]`)?.focus({ preventScroll: true }); });
    on(root, 'click', '#clear-search', () => { query = ''; category = ''; $('#menu-search').value = ''; render(); $('#menu-search').focus(); });

    function openEditor(food = null) {
        app.dialog.open({ title: food ? '编辑自定义美食' : '把喜欢的味道加进来', content: `<form id="food-form"><div class="field"><label for="food-name">美食名称 <span>必填</span></label><input id="food-name" name="name" required maxlength="60" value="${attr(food?.name || '')}" placeholder="例如：楼下的番茄鸡蛋面" autofocus></div><div class="field"><label for="food-category">分类</label><input id="food-category" name="category" maxlength="24" value="${attr(food?.category || '')}" placeholder="默认：自定义" list="category-options"><datalist id="category-options">${categoriesFor(app.menu()).map(value => `<option value="${attr(value)}">`).join('')}</datalist></div><div class="field"><label for="food-description">一句话描述</label><input id="food-description" name="description" maxlength="240" value="${attr(food?.description || '')}" placeholder="记下店名、位置或你喜欢的理由"></div><fieldset class="form-fieldset"><legend>适合哪一餐 <span>至少选一项</span></legend><div class="inline-options">${MEALS.map(meal => `<label class="checkbox-label"><input type="checkbox" name="meals" value="${meal.key}" ${(food?.meals || ['lunch', 'dinner']).includes(meal.key) ? 'checked' : ''}>${meal.label}</label>`).join('')}</div></fieldset><div class="field"><label for="food-taste">口味</label><select id="food-taste" name="taste"><option value="">暂不标注</option><option value="mild" ${food?.tags.includes('mild') ? 'selected' : ''}>不辣</option><option value="spicy" ${food?.tags.includes('spicy') ? 'selected' : ''}>辣味</option></select></div><div class="inline-options"><label class="checkbox-label"><input type="checkbox" name="vegetarian" ${food?.tags.includes('vegetarian') ? 'checked' : ''}>蛋奶素</label><label class="checkbox-label"><input type="checkbox" name="light" ${food?.tags.includes('light') ? 'checked' : ''}>清淡口味</label></div><p class="fine-print">标签用于你的偏好筛选，仅标注你确认的口味。</p><p class="form-error" id="food-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-dialog-close>取消</button><button class="button primary" type="submit">${food ? '保存修改' : '加入菜单'}</button></div></form>`, onMount(dialog) {
            $('#food-form', dialog).addEventListener('submit', event => {
                event.preventDefault();
                const fields = new FormData(event.target);
                const name = cleanText(fields.get('name'), 60), meals = fields.getAll('meals');
                const tags = [fields.get('taste'), fields.has('vegetarian') && 'vegetarian', fields.has('light') && 'light'].filter(Boolean);
                const error = $('#food-error', dialog);
                if (!name || !meals.length) { error.textContent = '请填写名称，并至少选择一个餐次。'; return; }
                if (app.menu().some(item => item.id !== food?.id && item.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'))) { error.textContent = '已经有同名美食，请换个名称。'; return; }
                const item = normalizeFood({ id: food?.id, name, category: fields.get('category'), description: fields.get('description'), meals, tags, image: food?.image, isCustom: true });
                try {
                    app.store.update(data => {
                        const list = data.menuOverride ?? data.customFoods;
                        const index = list.findIndex(entry => entry.id === food?.id);
                        if (index >= 0) list[index] = item;
                        else { if (list.length >= LIMITS.foods) throw new Error('菜单已达 500 道上限'); list.push(item); }
                    }, 'menu');
                    app.dialog.close(); toast(food ? '美食已更新' : '已加入菜单，也可以从转盘抽到它');
                } catch (failure) { error.textContent = failure.message; }
            });
        } });
    }

    function openManager() {
        const data = app.store.get(), items = data.menuOverride ?? data.customFoods;
        app.dialog.open({ title: '管理我的菜单', content: `<p>${data.menuOverride ? `正在使用专属菜单，共 ${items.length} 道。` : `内置菜单之外，你添加了 ${items.length} 道私藏美食。`}</p><div class="manager-list">${items.length ? items.map(food => `<div class="manager-item"><span><strong>${escapeHtml(food.name)}</strong><small>${escapeHtml(food.category)}</small></span><div><button class="text-button" data-edit="${attr(food.id)}">编辑</button><button class="icon-btn" data-delete="${attr(food.id)}" aria-label="删除${attr(food.name)}">${icon('trash')}</button></div></div>`).join('') : '<p class="muted">还没有自定义菜品。可以添加常去的小店，或导入食堂菜单。</p>'}</div><div class="dialog-actions wrap"><button class="button secondary" id="export-menu">${icon('download')}导出当前菜单</button><button class="button secondary" id="import-menu">${icon('upload')}导入菜单</button>${data.menuOverride ? '<button class="text-button" id="restore-menu">恢复内置菜单</button>' : ''}</div>`, onMount(dialog) {
            $('#export-menu', dialog).addEventListener('click', () => { downloadFile(createMenuExport(app.menu()), '今天吃什么-菜单.json'); toast('当前完整菜单已导出'); });
            $('#import-menu', dialog).addEventListener('click', openImport);
            $('#restore-menu', dialog)?.addEventListener('click', () => app.dialog.confirm({ title: '恢复内置菜单？', description: '将结束专属菜单模式，收藏、记录和用餐计划会保留。建议先导出当前菜单。', confirmText: '恢复内置菜单', onConfirm() { app.store.update(draft => { draft.menuOverride = null; }, 'menu'); toast('已恢复内置菜单'); } }));
            on(dialog, 'click', '[data-edit]', (_, button) => openEditor(items.find(food => food.id === button.dataset.edit)));
            on(dialog, 'click', '[data-delete]', (_, button) => {
                const food = items.find(item => item.id === button.dataset.delete);
                if (data.menuOverride && items.length === 1) { toast('专属菜单至少保留一道菜，也可以恢复内置菜单'); return; }
                app.dialog.confirm({ title: `删除「${food.name}」？`, description: '将从当前菜单移除，收藏和已有计划中的记录仍会保留。', confirmText: '删除菜品', danger: true, onConfirm() {
                    app.store.update(draft => { if (draft.menuOverride) draft.menuOverride = draft.menuOverride.filter(item => item.id !== food.id); else draft.customFoods = draft.customFoods.filter(item => item.id !== food.id); }, 'menu');
                    openManager(); toast('已从菜单移除');
                } });
            });
        } });
    }

    function openImport() {
        let prepared = null;
        app.dialog.open({ title: '导入一份新菜单', content: `<form id="menu-import-form"><div class="field"><label for="menu-file">选择 JSON 菜单文件</label><input id="menu-file" type="file" accept=".json,application/json"></div><div class="field"><label for="menu-json">或粘贴菜单 JSON</label><textarea id="menu-json" rows="7" required placeholder='[{"name":"番茄鸡蛋面","category":"面食"}]'></textarea></div><fieldset class="form-fieldset"><legend>导入方式</legend><label class="radio-label"><input type="radio" name="mode" value="append" checked>追加到当前菜单，同名菜品跳过</label><label class="radio-label"><input type="radio" name="mode" value="replace">整套替换，适合食堂或专属菜单</label></fieldset><p class="form-error" id="import-error" role="alert"></p><p class="import-preview" id="import-preview" role="status"></p><div class="dialog-actions"><button type="button" class="button secondary" data-dialog-close>取消</button><button type="submit" class="button primary" id="submit-import">检查菜单</button></div></form>`, onMount(dialog) {
            const form = $('#menu-import-form', dialog), input = $('#menu-json', dialog), error = $('#import-error', dialog);
            const reset = () => { prepared = null; $('#import-preview', dialog).textContent = ''; $('#submit-import', dialog).textContent = '检查菜单'; };
            form.addEventListener('input', reset);
            $('#menu-file', dialog).addEventListener('change', async event => {
                const file = event.target.files[0]; if (!file) return;
                try { if (file.size > LIMITS.fileBytes) throw new Error('菜单文件不能超过 2 MB'); input.value = await file.text(); reset(); error.textContent = ''; }
                catch (failure) { error.textContent = failure.message; }
            });
            form.addEventListener('submit', event => {
                event.preventDefault(); error.textContent = '';
                try {
                    const mode = new FormData(form).get('mode');
                    if (!prepared) {
                        prepared = parseMenu(input.value);
                        $('#import-preview', dialog).textContent = `已检查 ${prepared.length} 道菜品。${mode === 'replace' ? '确认后将替换当前菜单，收藏、记录与计划会保留。' : '确认后追加到当前菜单，同名菜品不会覆盖。'}`;
                        $('#submit-import', dialog).textContent = mode === 'replace' ? '确认替换菜单' : '确认追加菜单';
                        return;
                    }
                    let added = 0;
                    app.store.update(data => {
                        if (mode === 'replace') { data.menuOverride = prepared; added = prepared.length; }
                        else {
                            const existing = new Set(app.menu().map(food => food.name.toLocaleLowerCase('zh-CN')));
                            const list = data.menuOverride ?? data.customFoods;
                            for (const food of prepared) if (!existing.has(food.name.toLocaleLowerCase('zh-CN'))) { list.push(food); existing.add(food.name.toLocaleLowerCase('zh-CN')); added++; }
                        }
                    }, 'menu');
                    app.dialog.close(); toast(`已${mode === 'replace' ? '导入' : '追加'} ${added} 道菜品`);
                } catch (failure) { error.textContent = failure.message; prepared = null; $('#submit-import', dialog).textContent = '检查菜单'; }
            });
        } });
    }
    $('#add-food').addEventListener('click', () => openEditor());
    $('#manage-menu').addEventListener('click', openManager);
    return { render, openManager, openEditor };
}
