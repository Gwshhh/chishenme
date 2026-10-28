import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const KEY = 'chishenme:state:v1';
const now = new Date('2026-10-27T12:00:00+08:00');
test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(now); });

test('an in-progress spin locks controls and records only one result', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.locator('#spin-btn').click();
    await expect(page.locator('#spin-btn')).toBeDisabled();
    await expect(page.locator('[data-meal="breakfast"]')).toBeDisabled();
    await page.locator('#theme-toggle').click();
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
    const data = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(data.history).toHaveLength(1);
    await expect(page.locator('#wheel-canvas')).toHaveAttribute('aria-label', `美食转盘，本轮抽中${data.history[0].food.name}`);
});

test('future-dated legacy history cannot defeat consecutive-repeat prevention', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('history', JSON.stringify([{ name: '扬州炒饭', timestamp: new Date('2030-01-01').getTime() }]));
        Math.random = () => 0;
    });
    await page.goto('/');
    await page.locator('#spin-btn').click();
    const first = await page.locator('#recommendation h3').textContent();
    await page.locator('#spin-again').click();
    await expect(page.locator('#recommendation h3')).not.toHaveText(first);
});

test('nearby permission denial, network errors, cancellation and successful results recover', async ({ page, context }) => {
    await page.route('**/api/config', route => route.fulfill({ json: { nearby: true, weather: true } }));
    await page.route('**/api/weather?**', route => route.fulfill({ json: { description: '晴', tempC: 32, kind: 'hot' } }));
    await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_, fail) => fail({ code: 1 }); });
    await page.goto('/');
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('定位权限未开启');
    await expect(page.locator('#locate-btn')).toBeEnabled();
    await page.evaluate(() => { navigator.geolocation.getCurrentPosition = success => success({ coords: { latitude: 30, longitude: 120 } }); });
    await page.route('**/api/nearby?**', route => route.fulfill({ status: 502, json: { error: '地图暂不可用，请重试' } }));
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('地图暂不可用');
    await page.unroute('**/api/nearby?**');
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/nearby?**', async route => {
        await gate;
        try { await route.fulfill({ json: { places: [{ id: 'amap:test', name: '测试面馆', category: '面馆', isNearby: true, distance: 120, meals: ['lunch'], tags: [] }], city: '测试城市', partial: false } }); } catch { /* Cancelled browser request. */ }
    });
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('正在搜索');
    await page.locator('#cancel-nearby').click(); release();
    await expect(page.locator('#nearby-status')).toContainText('已取消');
    await expect(page.locator('#wheel-source')).toBeHidden();
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('找到 1 家店');
    await page.locator('#spin-btn').click();
    await expect(page.locator('#recommendation h3')).toHaveText('测试面馆');
    await page.locator('#wheel-source').click();
    await expect(page.locator('#wheel-source')).toBeHidden();
});

test('static hosting advertises its fallback without contacting a missing API', async ({ page }) => {
    let apiCalls = 0;
    await page.route('**/runtime-config.json', route => route.fulfill({ json: { apiBase: '' } }));
    page.on('request', request => { if (request.url().includes('/api/')) apiCalls++; });
    await page.goto('/');
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('服务尚未启用');
    await page.locator('#spin-btn').click();
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
    expect(apiCalls).toBe(0);
});

test('photo failure falls back to a readable local name card', async ({ page }) => {
    await page.route('**/images_food/**', route => route.abort());
    await page.goto('/');
    const image = page.locator('#recommendation img');
    await expect(image).toHaveAttribute('src', /^data:image\/svg\+xml/);
    expect(await image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    await page.locator('#spin-btn').click();
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
});

test('sound and shake are enabled only by an explicit user action', async ({ page }) => {
    await page.addInitScript(() => {
        window.permissionCalls = 0; window.tonesPlayed = 0;
        window.DeviceMotionEvent = class { static async requestPermission() { window.permissionCalls++; return 'granted'; } };
        window.AudioContext = class {
            state = 'running'; currentTime = 0; destination = {};
            createOscillator() { return { frequency: {}, connect() {}, disconnect() {}, start() { window.tonesPlayed++; }, stop() {} }; }
            createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
        };
    });
    await page.goto('/');
    expect(await page.evaluate(() => window.permissionCalls)).toBe(0);
    await page.locator('#sound-toggle').click();
    await page.getByRole('link', { name: '偏好与设置', exact: true }).click();
    await page.locator('#enable-shake').click();
    await expect(page.locator('#enable-shake')).toHaveText('关闭摇一摇');
    expect(await page.evaluate(() => window.permissionCalls)).toBe(1);
    await page.locator('[data-route="wheel"]').click();
    await page.evaluate(() => {
        for (const x of [0, 35]) { const event = new Event('devicemotion'); Object.defineProperty(event, 'accelerationIncludingGravity', { value: { x, y: 0, z: 0 } }); dispatchEvent(event); }
    });
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
    await expect.poll(() => page.evaluate(() => window.tonesPlayed)).toBeGreaterThan(0);
    expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY)).history).toHaveLength(1);
});

test('manual planning, individual replacement and conflict warnings are coherent', async ({ page }) => {
    await page.goto('/#plan');
    await page.getByRole('button', { name: '安排2026-10-27午餐', exact: true }).click();
    await page.locator('#plan-search').fill('黄焖鸡');
    await page.locator('[data-plan-choice]').click();
    await expect(page.locator('[data-date="2026-10-27"][data-meal="lunch"][data-plan-action="shuffle"]')).toBeVisible();
    await expect(page.locator('[data-date="2026-10-27"][data-meal="lunch"][data-plan-action="select"]')).toBeFocused();
    let data = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(data.plan['2026-10-27'].lunch.food.name).toBe('黄焖鸡米饭');
    await page.getByRole('link', { name: '偏好与设置', exact: true }).click();
    await page.locator('#excluded-keywords').fill('黄焖鸡'); await page.locator('#keyword-form button').click();
    await page.locator('[data-route="plan"]').click();
    await expect(page.locator('#plan-summary')).toContainText('1 餐与新偏好不符');
    await page.locator('[data-date="2026-10-27"][data-meal="lunch"][data-plan-action="shuffle"]').click();
    data = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(data.plan['2026-10-27'].lunch.food.name).not.toBe('黄焖鸡米饭');
    await page.locator('[data-date="2026-10-27"][data-meal="lunch"][data-plan-action="remove"]').click();
    await expect(page.getByRole('button', { name: '安排2026-10-27午餐', exact: true })).toBeVisible();
});

test('relative asset paths support a GitHub Pages-style project subdirectory', async ({ page }) => {
    await page.goto('/chishenme/');
    await expect(page.locator('#spin-btn')).toBeEnabled();
    await page.locator('#spin-btn').click();
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
    await page.locator('[data-route="plan"]').click(); await page.locator('#fill-plan').click();
    await expect(page.locator('.plan-food')).toHaveCount(21);
    expect(page.url()).toContain('/chishenme/#plan');
});

test('closing a pending share cannot replace another dialog', async ({ page }) => {
    await page.goto('/'); await page.locator('#spin-btn').click();
    await page.route('**/images_food/**', route => route.abort());
    await page.locator('#recommendation [data-food-action="share"]').click();
    await page.keyboard.press('Escape');
    await page.locator('#recommendation [data-food-action="plan"]').click();
    await expect(page.locator('#dialog-title')).toHaveText('把这道美食放进计划');
    await page.waitForTimeout(300);
    await expect(page.locator('#dialog-title')).toHaveText('把这道美食放进计划');
});

test('all main screens and a dialog meet WCAG AA automated rules', async ({ page }) => {
    await page.goto('/');
    for (const route of ['wheel', 'list', 'plan', 'favorites', 'history']) {
        await page.locator(`[data-route="${route}"]`).click();
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), route).toEqual([]);
    }
    await page.getByRole('link', { name: '偏好与设置', exact: true }).click();
    for (const mode of ['light', 'dark']) {
        await page.locator('#theme-mode').selectOption(mode);
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(result.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), mode).toEqual([]);
    }
    await page.locator('[data-route="list"]').click();
    await page.locator('#add-food').click();
    const dialog = await new AxeBuilder({ page }).include('#app-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(dialog.violations.map(item => item.id)).toEqual([]);
});

test.describe('offline installed app', () => {
    test.use({ serviceWorkers: 'allow' });
    test('development mode removes its own worker so edits cannot be hidden by an old shell', async ({ page }) => {
        let development = false;
        await page.route('**/runtime-config.json', route => route.fulfill({ json: { apiBase: '/api/', development } }));
        await page.goto('/');
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        development = true;
        await page.reload();
        await expect.poll(async () => {
            try {
                return await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length === 0 && !navigator.serviceWorker.controller);
            } catch (error) {
                // The app intentionally reloads once after unregistering its existing worker.
                if (error.message.includes('Execution context was destroyed')) return false;
                throw error;
            }
        }).toBe(true);
        await expect(page.locator('#spin-btn')).toBeEnabled();
    });
    test('cached shell survives a reload offline without deleting unrelated caches', async ({ page, context }) => {
        await page.goto('/');
        await page.evaluate(async () => { const cache = await caches.open('unrelated-app'); await cache.put('/unrelated-fixture', new Response('keep')); });
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
        await page.locator('[data-route="plan"]').click();
        await page.locator('#fill-plan').click();
        await context.setOffline(true);
        await page.reload();
        await expect(page.locator('#offline-notice')).toBeVisible();
        await expect(page.locator('.plan-food')).toHaveCount(21);
        await page.locator('[data-route="wheel"]').click();
        await page.locator('#spin-btn').click();
        await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
        expect(await page.evaluate(() => caches.has('unrelated-app'))).toBe(true);
        await context.setOffline(false);
    });
});
