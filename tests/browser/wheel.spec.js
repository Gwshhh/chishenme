import { test, expect } from '@playwright/test';
import { defaultData, normalizeFood } from '../../src/core/model.js';

const key = 'chishenme:state:v1';

test('the keyboard hub draws one result and lands its upright photo at the pointer', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-28T12:00:00+08:00'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.locator('#wheel-hub').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#wheel-hub')).toBeDisabled();
    await expect(page.locator('#spin-btn')).toBeDisabled();
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
    const history = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).history, key);
    expect(history).toHaveLength(1);
    const selected = page.locator('.wheel-photo-slot.is-selected');
    await expect(selected).toHaveAttribute('data-wheel-food', history[0].food.id);
    await expect(selected.locator('.wheel-food-label')).toHaveText(history[0].food.name);
    const geometry = await selected.evaluate(element => {
        const stage = document.querySelector('.wheel-stage').getBoundingClientRect();
        const slot = element.getBoundingClientRect();
        const parentTransform = new DOMMatrix(getComputedStyle(element.parentElement).transform);
        const ownTransform = new DOMMatrix(getComputedStyle(element).transform);
        const final = parentTransform.multiply(ownTransform);
        return { offset: Math.abs(slot.x + slot.width / 2 - stage.x - stage.width / 2), aboveCenter: slot.y + slot.height / 2 < stage.y + stage.height / 2, rotation: Math.atan2(final.b, final.a) };
    });
    expect(geometry.offset).toBeLessThan(1);
    expect(geometry.aboveCenter).toBe(true);
    expect(Math.abs(geometry.rotation)).toBeLessThan(.001);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#wheel-hub')).toBeEnabled();
    await expect(page.locator('#spin-btn')).toBeEnabled();
});

test('changing the theme on another route updates the landed wheel without another draw', async ({ page }) => {
    await page.goto('/');
    await page.locator('#spin-btn').click();
    const selected = await page.locator('.wheel-photo-slot.is-selected').getAttribute('data-wheel-food');
    const light = await page.locator('#wheel-canvas').evaluate(canvas => canvas.toDataURL());
    await page.getByRole('link', { name: '偏好与设置', exact: true }).click();
    await page.locator('#theme-mode').selectOption('dark');
    await page.getByRole('button', { name: '青瓷', exact: true }).click();
    await page.locator('[data-route="wheel"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(page.locator('.wheel-photo-slot.is-selected')).toHaveAttribute('data-wheel-food', selected);
    expect(await page.locator('#wheel-canvas').evaluate(canvas => canvas.toDataURL())).not.toEqual(light);
    const history = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).history, key);
    expect(history).toHaveLength(1);
});

test('a compact wheel keeps long shop names, photo references and missing images usable', async ({ page }) => {
    const data = defaultData();
    data.settings.meal = 'all';
    data.menuOverride = [
        normalizeFood({ name: '塔斯汀中国汉堡', category: '快餐便当', isCustom: true }),
        normalizeFood({ name: '小巷里一家值得专程绕路去吃而且名字特别特别长的私房小馆', category: '私房', isCustom: true }),
    ];
    await page.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data });
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto('/');
    const reference = page.locator('.wheel-photo-slot').filter({ hasText: '塔斯汀中国汉堡' });
    await expect(reference.locator('.food-photo')).toHaveAttribute('data-photo-kind', 'reference');
    await expect(reference.locator('.photo-credit')).toBeVisible();
    const unknown = page.locator('.wheel-photo-slot').filter({ hasText: '小巷里一家' });
    await expect(unknown.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.route('**/images_food/**', route => route.abort());
    await page.reload();
    await expect(reference.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
    await page.locator('#wheel-hub').click();
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
    await expect(page.locator('.wheel-photo-slot.is-selected')).toHaveCount(1);
});
