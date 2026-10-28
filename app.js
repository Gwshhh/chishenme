import { APP_VERSION, currentMeal } from './src/core/model.js';
import { activeMenu } from './src/core/catalog.js';
import { createStore, addHistory } from './src/core/storage.js';
import { filterFoods } from './src/core/selection.js';
import { $, toast, initImageFallback } from './src/ui/dom.js';
import { icon } from './src/ui/icons.js';
import { createDialog } from './src/ui/dialog.js';
import { createApi } from './src/services/api.js';
import { createFeedback } from './src/services/feedback.js';
import { initPwa } from './src/services/pwa.js';
import { initFoodActions } from './src/features/food-actions.js';
import { initDecision } from './src/features/decision.js';
import { initMenu } from './src/features/menu.js';
import { initPlanner } from './src/features/planner.js';
import { initCollections } from './src/features/collections.js';
import { initSettings } from './src/features/settings.js';
import { initNearby } from './src/features/nearby.js';

const ROUTES = { wheel: '转盘', list: '菜单', plan: '一周计划', favorites: '收藏', history: '记录', settings: '偏好与设置' };

function init() {
    document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
    initImageFallback();
    const store = createStore({ eventTarget: window, onWarning(message) { $('#storage-notice').hidden = false; $('#storage-notice').textContent = message; } });
    const app = {
        store, dialog: createDialog(), api: createApi(), features: {},
        ui: { route: 'wheel', categories: [], spinning: false, useNearby: false, nearby: [], result: null, resultEventId: null, weather: null },
        menu: () => activeMenu(store.get()),
        dataset() { return this.ui.useNearby ? this.ui.nearby : this.menu(); },
        meal: () => store.get().settings.meal === 'auto' ? currentMeal() : store.get().settings.meal,
        pool() { return filterFoods(this.dataset(), { preferences: store.get().preferences, meal: this.meal(), categories: this.ui.categories }); },
        findFood(id) {
            const data = store.get();
            return [...this.menu(), ...this.ui.nearby, ...data.favorites, ...data.history.map(item => item.food), ...Object.values(data.plan).flatMap(day => Object.values(day).map(slot => slot.food)), this.ui.result].find(food => food?.id === id);
        },
        navigate(route) {
            if (!(route in ROUTES)) return;
            history.pushState({}, '', '#' + route); renderRoute();
        },
        pick(food, source) {
            if (this.ui.spinning) { toast('转盘正在抽取，请稍等'); return; }
            this.ui.result = food;
            store.update(data => { addHistory(data, food, source); this.ui.resultEventId = data.history[0].id; }, 'history');
            if (this.ui.route !== 'wheel') this.navigate('wheel');
            this.features.wheel.reveal();
        },
        markResultEaten() {
            if (!this.ui.result) return;
            store.update(data => {
                const record = data.history.find(item => item.id === this.ui.resultEventId);
                if (record) record.eaten = true;
                else { addHistory(data, this.ui.result, 'manual', true); this.ui.resultEventId = data.history[0].id; }
            }, 'history');
        },
    };
    app.feedback = createFeedback(() => store.get().settings);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const applySettings = () => {
        const settings = store.get().settings;
        const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
        document.documentElement.dataset.mode = dark ? 'dark' : 'light';
        document.documentElement.dataset.accent = settings.accent;
        $('meta[name="theme-color"]').content = dark ? '#211e1b' : '#f8f5f0';
        $('#theme-toggle').innerHTML = icon(dark ? 'sun' : 'moon');
        $('#theme-toggle').setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
        $('#theme-toggle').title = dark ? '切换浅色模式' : '切换深色模式';
        $('#sound-toggle').innerHTML = icon(settings.sound ? 'sound' : 'muted');
        $('#sound-toggle').setAttribute('aria-label', settings.sound ? '关闭音效' : '开启音效');
        $('#sound-toggle').setAttribute('aria-pressed', String(settings.sound));
    };
    applySettings();
    app.features.actions = initFoodActions(app);
    app.features.list = initMenu(app);
    app.features.plan = initPlanner(app);
    Object.assign(app.features, initCollections(app));
    app.features.settings = initSettings(app);
    app.features.wheel = initDecision(app);
    app.features.nearby = initNearby(app);
    $('#today-label').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    $('#app-version').textContent = 'v' + APP_VERSION;
    $('#theme-toggle').addEventListener('click', () => store.update(data => { data.settings.theme = document.documentElement.dataset.mode === 'dark' ? 'light' : 'dark'; }, 'settings'));
    $('#sound-toggle').addEventListener('click', () => store.update(data => { data.settings.sound = !data.settings.sound; }, 'settings'));
    media.addEventListener('change', () => { applySettings(); app.features.wheel.render('settings'); });

    const badge = () => { const count = store.get().favorites.length; $('#favorite-count').textContent = String(count); $('#favorite-count').hidden = count === 0; };
    function renderRoute(initial = false) {
        const hash = location.hash.slice(1);
        if (hash === 'main') return;
        const route = Object.hasOwn(ROUTES, hash) ? hash : 'wheel';
        app.ui.route = route;
        app.dialog.close();
        document.querySelectorAll('.view').forEach(element => { element.hidden = element.id !== route + '-view'; });
        document.querySelectorAll('[data-route]').forEach(link => {
            const active = link.dataset.route === route;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
        });
        app.features[route].render();
        document.title = ROUTES[route] + ' · 今天吃什么';
        if (!initial) { window.scrollTo({ top: 0, behavior: 'instant' }); const heading = $('#' + route + '-view h1'); heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
    }
    store.subscribe((_, reason) => {
        // Retain the keyboard target when a small control's surrounding list rerenders.
        const focused = document.activeElement;
        const scope = focused?.closest('.view');
        const attributes = focused?.tagName === 'BUTTON' ? [...focused.attributes].filter(attribute => attribute.name.startsWith('data-') || attribute.name === 'id').map(attribute => '[' + attribute.name + '="' + CSS.escape(attribute.value) + '"]').join('') : '';
        if (reason === 'restore' || reason === 'external') {
            app.ui.result = null; app.ui.resultEventId = null; app.ui.categories = [];
            if (reason === 'restore') { app.features.nearby.cancel(); app.ui.useNearby = false; }
            app.features.nearby.refresh();
        }
        applySettings(); badge(); app.features[app.ui.route].render(reason);
        if (attributes && scope && !focused.isConnected) scope.querySelector('button' + attributes)?.focus({ preventScroll: true });
        if (reason === 'external') toast('已同步另一个页面的修改');
    });
    window.addEventListener('hashchange', () => renderRoute());
    window.addEventListener('popstate', () => { if (location.hash.slice(1) !== app.ui.route) renderRoute(); });
    const network = () => { $('#offline-notice').hidden = navigator.onLine; };
    window.addEventListener('online', network); window.addEventListener('offline', network);
    network(); badge(); renderRoute(true); initPwa(app.api).catch(() => {});
}

try { init(); }
catch (error) {
    console.error('Application initialization failed:', error);
    const notice = $('#storage-notice');
    notice.hidden = false;
    notice.textContent = '页面暂时未能加载，请刷新重试。原保存数据不会被删除。';
}
