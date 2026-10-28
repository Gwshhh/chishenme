import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const KEY = 'chishenme:state:v1';
const date = new Date('2026-10-27T12:00:00+08:00');
const state = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
const navigate = (page, route) => page.locator(`[data-route="${route}"]`).click();
const settings = page => page.getByRole('link', { name: '偏好与设置', exact: true }).click();

test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(date);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.__errors = errors;
});
test.afterEach(async ({ page }) => { expect(page.__errors).toEqual([]); });

test('draw, favorite, reroll and restore after reload without requesting location', async ({ page }) => {
    await page.addInitScript(() => {
        window.locationRequests = 0;
        navigator.geolocation.getCurrentPosition = () => { window.locationRequests++; };
    });
    await page.goto('/');
    await expect(page.locator('#spin-btn')).toBeEnabled();
    expect(await page.evaluate(() => window.locationRequests)).toBe(0);
    await page.locator('#spin-btn').click();
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
    const first = await page.locator('#recommendation h3').textContent();
    await page.locator('#recommendation [data-food-action="favorite"]').click();
    await expect(page.locator('#favorite-count')).toHaveText('1');
    await page.locator('#spin-again').click();
    await expect(page.locator('#recommendation h3')).not.toHaveText(first);
    expect((await state(page)).history).toHaveLength(2);
    await page.reload();
    await navigate(page, 'favorites');
    await expect(page.locator('#favorites-grid')).toContainText(first);
    await navigate(page, 'history');
    await expect(page.locator('.history-row')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('search, keyboard dialog, safe custom food names and menu management', async ({ page }) => {
    await page.goto('/#list');
    await page.locator('[data-category="米粉面馆"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-category="米粉面馆"]')).toBeFocused();
    await page.locator('[data-category=""]').click();
    await page.getByRole('searchbox', { name: '搜索美食' }).fill('黄焖鸡');
    await expect(page.locator('#menu-grid .food-card')).toHaveCount(1);
    const card = page.locator('#menu-grid .food-card-main');
    await card.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('button', { name: '添加美食', exact: true }).click();
    await page.getByLabel('美食名称').fill('<img src=x onerror=alert(1)>');
    await page.getByLabel('分类', { exact: true }).fill('私藏');
    await page.getByLabel('口味', { exact: true }).selectOption('mild');
    await page.getByRole('button', { name: '加入菜单', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜索美食' }).fill('onerror');
    await expect(page.locator('#menu-grid .food-card')).toHaveCount(1);
    expect(await page.locator('#menu-grid img[onerror]').count()).toBe(0);
    await page.reload();
    await page.getByRole('searchbox', { name: '搜索美食' }).fill('onerror');
    await expect(page.locator('#menu-grid')).toContainText('<img src=x onerror=alert(1)>');
});

test('replacement menu import, additions, edits, exports and restoration are consistent', async ({ page }) => {
    await page.goto('/#list');
    await page.getByRole('button', { name: '管理菜单', exact: true }).click();
    await page.getByRole('button', { name: '导入菜单', exact: true }).click();
    await page.getByLabel('或粘贴菜单 JSON').fill(JSON.stringify([{ name: '食堂一号饭', category: '食堂', meals: ['breakfast', 'lunch', 'dinner'], tags: ['mild'] }, { name: '食堂二号面', category: '食堂' }]));
    await page.getByRole('radio', { name: /整套替换/ }).check();
    await page.getByRole('button', { name: '检查菜单', exact: true }).click();
    await expect(page.locator('#import-preview')).toContainText('2 道菜品');
    await page.getByRole('button', { name: '确认替换菜单' }).click();
    await expect(page.locator('#menu-grid .food-card')).toHaveCount(2);
    await page.getByRole('button', { name: '添加美食', exact: true }).click();
    await page.getByLabel('美食名称').fill('食堂三号粥');
    await page.getByRole('button', { name: '加入菜单', exact: true }).click();
    await page.reload();
    await expect(page.locator('#menu-grid .food-card')).toHaveCount(3);
    await page.getByRole('button', { name: '管理菜单', exact: true }).click();
    await page.getByRole('button', { name: '编辑', exact: true }).last().click();
    await page.getByLabel('美食名称').fill('食堂三号鲜粥');
    await page.getByRole('button', { name: '保存修改' }).click();
    await page.getByRole('button', { name: '管理菜单', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出当前菜单' }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(exported.foods.map(food => food.name)).toEqual(['食堂一号饭', '食堂二号面', '食堂三号鲜粥']);
    await page.getByRole('button', { name: '恢复内置菜单', exact: true }).click();
    await page.locator('#confirm-action').click();
    await expect(page.locator('#menu-count')).toContainText('91');
});

test('preferences apply to draw, discovery, favorites and automatic meal planning', async ({ page }) => {
    await page.goto('/');
    await settings(page);
    await page.getByRole('switch', { name: '不吃辣', exact: true }).check();
    await page.getByLabel('不想吃的关键词', { exact: true }).fill('黄焖鸡，羊肉');
    await page.getByRole('button', { name: '保存关键词' }).click();
    await navigate(page, 'wheel');
    await page.locator('#spin-btn').click();
    const data = await state(page);
    expect(data.history[0].food.tags).toContain('mild');
    expect(data.history[0].food.name).not.toMatch(/黄焖鸡|羊肉/);
    await navigate(page, 'plan');
    await page.getByRole('button', { name: '一键安排空位' }).click();
    await expect(page.locator('#plan-summary')).toContainText('21');
    const planned = Object.values((await state(page)).plan).flatMap(day => Object.values(day));
    expect(planned).toHaveLength(21);
    for (const slot of planned) { expect(slot.food.tags).toContain('mild'); expect(slot.food.name).not.toMatch(/黄焖鸡|羊肉/); }
    await settings(page);
    await page.getByLabel('不想吃的关键词', { exact: true }).fill('快餐便当,米粉面馆,麻辣烫冒菜,汉堡炸鸡,饺子包子粥,地方菜,火锅烧烤,日韩料理,西餐,粤式点心,小吃夜宵,甜品饮品,轻食简餐');
    await page.getByRole('button', { name: '保存关键词' }).click();
    await navigate(page, 'wheel');
    await expect(page.locator('#wheel-empty')).toBeVisible();
    await expect(page.locator('#spin-btn')).toBeDisabled();
});

test('weekly plan preserves locked and eaten meals through shuffle and reload', async ({ page }) => {
    await page.goto('/#plan');
    await page.getByRole('button', { name: '一键安排空位' }).click();
    await expect(page.locator('.plan-food')).toHaveCount(21);
    await page.locator('[data-plan-action="lock"]').first().click();
    const original = (await state(page)).plan['2026-10-26'].breakfast;
    await page.locator('[data-plan-action="eat"]').nth(1).click();
    const lunch = (await state(page)).plan['2026-10-26'].lunch.food.id;
    await page.getByRole('button', { name: '重排未锁定' }).click();
    await page.locator('#confirm-action').click();
    let data = await state(page);
    expect(data.plan['2026-10-26'].breakfast).toEqual(original);
    expect(data.plan['2026-10-26'].lunch.food.id).toBe(lunch);
    expect(data.plan['2026-10-26'].lunch.eaten).toBe(true);
    await page.reload();
    await expect(page.locator('.plan-food')).toHaveCount(21);
    await expect(page.locator('[data-plan-action="lock"]').first()).toHaveAttribute('aria-pressed', 'true');
    await navigate(page, 'history');
    await expect(page.locator('.history-row')).toHaveCount(1);
    await expect(page.locator('.history-row .eat-button')).toHaveAttribute('aria-pressed', 'true');
});

test('backup export and validated restore preserve the full user state', async ({ page }) => {
    await page.goto('/');
    await page.locator('#spin-btn').click();
    await page.locator('#recommendation [data-food-action="favorite"]').click();
    await navigate(page, 'plan'); await page.locator('#fill-plan').click();
    await settings(page); await page.getByRole('button', { name: '青瓷', exact: true }).click();
    const original = await state(page);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出完整备份' }).click();
    const download = await downloading;
    const content = await readFile(await download.path(), 'utf8');
    expect(JSON.parse(content).data).toEqual(original);
    await page.getByRole('switch', { name: '不吃辣', exact: true }).check();
    await page.locator('#backup-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
    await expect(page.locator('#backup-error')).toContainText('有效的 JSON');
    expect((await state(page)).preferences.avoidSpicy).toBe(true);
    await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await expect(page.locator('#backup-preview')).toContainText('1 项收藏');
    await page.getByRole('button', { name: '确认恢复备份' }).click();
    expect(await state(page)).toEqual(original);
    await page.reload(); expect(await state(page)).toEqual(original);
});

test('legacy storage migrates and unavailable storage remains usable', async ({ page }) => {
    await page.addInitScript(() => {
        if (!localStorage.getItem('seeded')) {
            localStorage.setItem('favorites', JSON.stringify([{ name: '黄焖鸡米饭', category: '快餐便当' }]));
            localStorage.setItem('history', JSON.stringify([{ name: '云吞面', timestamp: 1793060000000 }]));
            localStorage.setItem('customFoods', '{}'); localStorage.setItem('seeded', '1');
        }
    });
    await page.goto('/#favorites');
    await expect(page.locator('#favorites-grid')).toContainText('黄焖鸡米饭');
    await navigate(page, 'wheel'); await page.locator('#spin-btn').click();
    expect((await state(page)).favorites).toHaveLength(1);
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; });
    await page.locator('#spin-again').click();
    await expect(page.locator('#storage-notice')).toContainText('存储已满或不可用');
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
});

test('theme choice and empty states stay usable at 320px and 200% text scale', async ({ page }) => {
    await page.goto('/#settings');
    await page.getByLabel('明暗模式', { exact: true }).selectOption('dark');
    for (const label of ['青瓷', '靛蓝', '紫棠', '琥珀', '胭脂', '落日珊瑚']) await page.getByRole('button', { name: label, exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await page.setViewportSize({ width: 320, height: 780 });
    for (const route of ['wheel', 'list', 'plan', 'favorites', 'history']) {
        await navigate(page, route);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await navigate(page, 'wheel');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#spin-btn')).toBeVisible();
});

test('tournament finishes with a single recorded winner and share card exports PNG', async ({ page }) => {
    await page.goto('/');
    await page.locator('#tournament-btn').click();
    for (let i = 0; i < 7; i++) await page.locator('[data-duel-index="0"]').click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect((await state(page)).history).toHaveLength(1);
    expect((await state(page)).history[0].source).toBe('tournament');
    await page.locator('#recommendation [data-food-action="share"]').click();
    await expect(page.locator('.share-preview')).toBeVisible();
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: '保存图片', exact: true }).click();
    const file = await pending;
    const image = await readFile(await file.path());
    expect(image.subarray(1, 4).toString()).toBe('PNG');
    expect(image.length).toBeGreaterThan(5000);
});

test('two tabs synchronize favorites without needing a reload', async ({ page, context }) => {
    await page.goto('/#list');
    const other = await context.newPage();
    await other.goto('/#favorites');
    await page.locator('#menu-grid [data-food-action="favorite"]').first().click();
    await expect(other.locator('#favorite-count')).toHaveText('1');
    await expect(other.locator('#favorites-grid .food-card')).toHaveCount(1);
    await other.close();
});
