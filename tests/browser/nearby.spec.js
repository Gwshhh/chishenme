import { test, expect } from '@playwright/test';

const result = { places: [{ id: 'amap:recovery', name: '测试面馆', category: '米粉面馆', isNearby: true, meals: ['lunch'], tags: [], distance: 120 }], city: '测试市', partial: false };
const stubLocation = () => {
    window.locationRequests = 0;
    navigator.geolocation.getCurrentPosition = success => {
        window.locationRequests++;
        success({ coords: { latitude: 39.9042, longitude: 116.4074 } });
    };
};

test('nearby recovers after its startup capability request fails without reloading', async ({ page }) => {
    let checks = 0;
    await page.addInitScript(stubLocation);
    await page.route('**/api/config', route => route.fulfill(++checks === 1 ? { status: 503, json: { error: '暂时不可用' } } : { json: { nearby: true, weather: false } }));
    await page.route('**/api/nearby?**', route => route.fulfill({ json: result }));
    await page.goto('/');
    await expect(page.locator('#nearby-status')).toContainText('连接不上');
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('找到 1 家店');
    expect(checks).toBe(2);
    expect(await page.evaluate(() => window.locationRequests)).toBe(1);
    await page.locator('#spin-btn').click();
    await expect(page.locator('#recommendation h3')).toHaveText('测试面馆');
});

test('cancelling pending service discovery prevents a later location permission request', async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.addInitScript(stubLocation);
    await page.route('**/api/config', async route => { await gate; await route.fulfill({ json: { nearby: true, weather: false } }); });
    await page.goto('/');
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('正在连接');
    await page.locator('#cancel-nearby').click();
    const response = page.waitForResponse('**/api/config');
    release();
    await response;
    await expect(page.locator('#nearby-status')).toHaveText('已取消搜索，当前菜单保持不变。');
    expect(await page.evaluate(() => window.locationRequests)).toBe(0);
});

test('Pages-style hosting uses its configured cross-origin nearby API', async ({ page }) => {
    const api = 'https://nearby.example/api/';
    const headers = { 'access-control-allow-origin': '*' };
    await page.addInitScript(stubLocation);
    await page.route('**/runtime-config.json', route => route.fulfill({ json: { apiBase: api } }));
    await page.route(api + 'config', route => route.fulfill({ headers, json: { nearby: true, weather: false } }));
    await page.route(api + 'nearby?**', route => route.fulfill({ headers, json: result }));
    await page.goto('/chishenme/');
    expect(await page.evaluate(() => window.locationRequests)).toBe(0);
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('找到 1 家店');
    await expect(page.locator('#wheel-source')).toBeVisible();
});
