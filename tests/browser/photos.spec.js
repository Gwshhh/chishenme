import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaultData, normalizeFood } from '../../src/core/model.js';

const key = 'chishenme:state:v1';
const first = 'https://photos.example.test/one.jpg';
const second = 'https://photos.example.test/two.jpg';
const burger = { id: 'amap:tastien-test', name: '塔斯汀中国汉堡', category: '快餐便当', isNearby: true };
const image = page => page.locator('#favorites-grid .food-image').first();
const kind = page => page.locator('#favorites-grid .food-photo').first();
const photoBody = await readFile(new URL('../../images_food/food_32.jpg', import.meta.url));

async function setup(page, fields = burger) {
    const data = defaultData(); data.favorites = [normalizeFood(fields)];
    await page.addInitScript(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data });
    await page.goto('/#favorites');
    await expect(image(page)).toBeVisible();
}

test('missing shop photos use matching real food in favorites, detail, plans and share', async ({ page }) => {
    await setup(page);
    await expect(image(page)).toHaveAttribute('src', 'images_food/food_32.jpg');
    await expect(image(page)).toHaveAttribute('alt', /汉堡参考图/);
    await expect(kind(page).locator('.photo-credit')).toBeVisible();
    await page.locator('#favorites-grid [data-food-action="detail"]').click();
    await expect(page.locator('#app-dialog img')).toHaveAttribute('src', 'images_food/food_32.jpg');
    await page.locator('#app-dialog [data-food-action="plan"]').click();
    await expect(page.locator('#app-dialog img')).toHaveAttribute('src', 'images_food/food_32.jpg');
    await page.locator('#add-plan-form button[type="submit"]').click();
    await page.locator('[data-route="plan"]').click();
    await expect(page.locator('.plan-food img')).toHaveAttribute('src', 'images_food/food_32.jpg');
    await page.locator('.plan-food').click();
    await page.locator('#app-dialog [data-food-action="share"]').click();
    await expect(page.locator('.share-preview')).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#save-share').click();
    const download = await downloadPromise;
    expect((await readFile(await download.path())).length).toBeGreaterThan(50000);
});

test('a failed first shop image does not discard a working second image', async ({ page }) => {
    let secondRequested = false;
    await page.route(first, route => route.abort());
    await page.route(second, route => { secondRequested = true; return route.fulfill({ contentType: 'image/jpeg', body: photoBody }); });
    await setup(page, { ...burger, image: first, imageCandidates: [first, second] });
    await expect(image(page)).toHaveAttribute('src', second);
    await expect(kind(page)).toHaveAttribute('data-photo-kind', 'original');
    await expect(kind(page).locator('.photo-credit')).toBeHidden();
    expect(secondRequested).toBe(true);
});

test('a reference is upgraded to the supplied photo and its reference label disappears', async ({ page }) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(first, async route => { await gate; await route.fulfill({ contentType: 'image/jpeg', body: photoBody }); });
    await setup(page, { ...burger, image: first });
    await expect(kind(page)).toHaveAttribute('data-photo-kind', 'reference');
    release();
    await expect(image(page)).toHaveAttribute('src', first);
    await expect(kind(page)).toHaveAttribute('data-photo-kind', 'original');
    await expect(image(page)).toHaveAttribute('alt', '塔斯汀中国汉堡');
});

test('failed originals retain a real reference and reconnecting retries the original', async ({ page }) => {
    let available = false;
    await page.route(first, route => available ? route.fulfill({ contentType: 'image/jpeg', body: photoBody }) : route.abort());
    await setup(page, { ...burger, image: first });
    await expect(image(page)).not.toHaveAttribute('data-loading', 'true');
    await expect(image(page)).toHaveAttribute('src', 'images_food/food_32.jpg');
    available = true;
    await page.evaluate(() => dispatchEvent(new Event('online')));
    await expect(image(page)).toHaveAttribute('src', first);
    await expect(kind(page).locator('.photo-credit')).toBeHidden();
});

test('when every photograph fails, the card still has a readable name and no retry loop', async ({ page }) => {
    let requests = 0;
    await page.route(first, route => { requests++; return route.abort(); });
    await page.route('**/images_food/**', route => route.abort());
    await setup(page, { ...burger, image: first });
    await expect(image(page)).toHaveAttribute('src', /^data:image\/svg\+xml/);
    await expect(kind(page)).toHaveAttribute('data-photo-kind', 'placeholder');
    await expect(kind(page).locator('.photo-credit')).toBeHidden();
    expect(await image(page).evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(requests).toBe(1);
});

test('an unknown shop retains its own name instead of an unrelated dish photo', async ({ page }) => {
    await setup(page, { name: '某某私房菜', category: '中餐', isNearby: true });
    await expect(image(page)).toHaveAttribute('src', /^data:image\/svg\+xml/);
    await expect(image(page)).toHaveAttribute('alt', '某某私房菜');
    await expect(kind(page).locator('.photo-credit')).toBeHidden();
});
