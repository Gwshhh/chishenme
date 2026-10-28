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

test('nearby weather card displays real location, temperature and daily range', async ({ page }) => {
    await page.addInitScript(stubLocation);
    await page.route('**/api/config', route => route.fulfill({ json: { nearby: true, weather: true } }));
    await page.route('**/api/nearby?**', route => route.fulfill({ json: { ...result, city: '桂林市 · 雁山区' } }));
    await page.route('**/api/weather?**', route => route.fulfill({ json: { tempC: 20, description: '多云', kind: 'mild', condition: 'partly-cloudy', isDay: true, highC: 25, lowC: 17 } }));
    await page.goto('/');
    await expect(page.locator('#weather-temperature')).toHaveText('--');
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('找到 1 家店');
    await expect(page.locator('#weather-city')).toHaveText('桂林市');
    await expect(page.locator('#weather-district')).toHaveText('雁山区');
    await expect(page.locator('#weather-temperature')).toHaveText('20');
    await expect(page.locator('#weather-range')).toHaveText('最高 25° · 最低 17°');
    await expect(page.locator('#weather-status')).toHaveAttribute('data-scene', 'partly-cloudy');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('weather failure keeps restaurant results usable and does not invent a temperature', async ({ page }) => {
    await page.addInitScript(stubLocation);
    await page.route('**/api/config', route => route.fulfill({ json: { nearby: true, weather: true } }));
    await page.route('**/api/nearby?**', route => route.fulfill({ json: result }));
    await page.route('**/api/weather?**', route => route.fulfill({ status: 502, json: { error: '天气暂不可用' } }));
    await page.goto('/');
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('找到 1 家店');
    await expect(page.locator('#weather-temperature')).toHaveText('--');
    await expect(page.locator('#weather-status')).toHaveAttribute('data-state', 'error');
    await page.locator('#spin-btn').click();
    await expect(page.locator('#recommendation h3')).toHaveText('测试面馆');
});

test('a failed weather refresh clearly labels the last known temperature', async ({ page }) => {
    let available = true;
    await page.addInitScript(stubLocation);
    await page.route('**/api/config', route => route.fulfill({ json: { nearby: true, weather: true } }));
    await page.route('**/api/nearby?**', route => route.fulfill({ json: result }));
    await page.route('**/api/weather?**', route => route.fulfill(available ? { json: { tempC: 20, description: '多云', kind: 'mild' } } : { status: 502, json: { error: '天气暂不可用' } }));
    await page.goto('/');
    await page.locator('#locate-btn').click();
    await expect(page.locator('#weather-temperature')).toHaveText('20');
    await expect(page.locator('#locate-btn')).toBeEnabled();
    available = false;
    await page.locator('#locate-btn').click();
    await expect(page.locator('#weather-description')).toHaveText('多云 · 上次天气');
    await expect(page.locator('#weather-temperature')).toHaveText('20');
    await expect(page.locator('#nearby-status')).toContainText('找到 1 家店');
});

test('unreachable nearby service never requests GPS and the error can be retried', async ({ page }) => {
    await page.addInitScript(stubLocation);
    await page.route('**/api/config', route => route.abort('failed'));
    await page.goto('/');
    await expect(page.locator('#nearby-status')).toContainText('连接不上');
    await page.locator('#locate-btn').click();
    await expect(page.locator('#nearby-status')).toContainText('连接不上');
    expect(await page.evaluate(() => window.locationRequests)).toBe(0);
    await expect(page.locator('#locate-btn')).toBeEnabled();
    await expect(page.locator('#cancel-nearby')).toBeHidden();
});

test('Meituan handoff keeps the iPhone click synchronous and provides an explicit web fallback', async ({ page, isMobile }) => {
    // Observe the real click's final destination, then stop OS navigation. Desktop
    // automation cannot attest whether Meituan is installed on a physical iPhone.
    await page.addInitScript(() => {
        window.addEventListener('click', event => {
            const link = event.target.closest('[data-open-meituan]');
            if (link) { window.meituanClick = { href: link.href, target: link.target, trusted: event.isTrusted }; event.preventDefault(); }
        });
    });
    await page.goto('/');
    await page.locator('.nearby-panel [data-open-meituan]').click();
    const click = await page.evaluate(() => window.meituanClick);
    expect(click.trusted).toBe(true);
    if (isMobile) {
        expect(click.href).toMatch(/^imeituan:\/\/www\.meituan\.com\/search\?/);
        expect(click.target).toBe('_self');
        await expect(page.getByRole('link', { name: '使用美团网页版' })).toHaveAttribute('href', 'https://i.meituan.com/');
    } else {
        expect(click.href).toBe('https://waimai.meituan.com/');
        expect(click.target).toBe('_blank');
    }
});
