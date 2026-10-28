import { test, expect } from '@playwright/test';
import { catalog } from '../../src/core/catalog.js';

test('the first screen uses small local photos and small actions preserve the visible images', async ({ page }) => {
    const originals = [];
    page.on('request', request => { if (/\/images_food\/food_\d+\.jpg$/.test(request.url())) originals.push(request.url()); });
    await page.goto('/');
    const hero = page.locator('#recommendation img');
    await expect(hero).toHaveAttribute('fetchpriority', 'high');
    await expect.poll(() => hero.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('#wheel-photos img')).toHaveCount(8);
    for (const image of await page.locator('#wheel-photos img').all()) await expect(image).toHaveAttribute('src', /optimized\/food_\d+-160\.webp$/);
    await page.evaluate(() => { window.keptHero = document.querySelector('#recommendation img'); window.keptWheel = document.querySelector('#wheel-photos img'); window.keptDiscovery = document.querySelector('#discovery-grid img'); });
    await page.locator('#recommendation [data-food-action="favorite"]').click();
    await page.locator('#theme-toggle').click();
    expect(await page.evaluate(() => window.keptHero === document.querySelector('#recommendation img') && window.keptWheel === document.querySelector('#wheel-photos img') && window.keptDiscovery === document.querySelector('#discovery-grid img'))).toBe(true);
    expect(originals).toEqual([]);
});

test('changing an inspiration is instant, does not repeat and only a confirmed choice enters history', async ({ page }) => {
    await page.goto('/');
    const previous = await page.locator('#recommendation h3').textContent();
    await page.locator('#shuffle-daily').click();
    await expect(page.locator('#recommendation h3')).not.toHaveText(previous);
    const chosen = await page.locator('#recommendation h3').textContent();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chishenme:state:v1'))?.history.length ?? 0)).toBe(0);
    await page.locator('#choose-daily').click();
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('chishenme:state:v1')).history);
    expect(history).toHaveLength(1);
    expect(history[0].food.name).toBe(chosen);
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
});

test('a real spin is composited instead of redrawing the canvas on every frame', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.evaluate(() => {
        window.canvasPaints = 0;
        const draw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (...args) { window.canvasPaints++; return draw.apply(this, args); };
    });
    await page.locator('#spin-btn').click();
    await expect(page.locator('#spin-btn')).toBeDisabled();
    await expect(page.locator('#choose-daily')).toBeDisabled();
    await expect.poll(() => page.locator('#wheel-canvas').evaluate(canvas => canvas.getAnimations().length)).toBe(1);
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
    expect(await page.evaluate(() => window.canvasPaints)).toBeLessThanOrEqual(4);
    await expect(page.locator('.wheel-photo-slot.is-selected')).toHaveCount(1);
});

test('the menu renders in manageable batches while search still covers the whole catalog', async ({ page }) => {
    await page.goto('/#list');
    await expect(page.locator('#menu-grid .food-card')).toHaveCount(24);
    await page.evaluate(() => { window.keptMenuPhoto = document.querySelector('#menu-grid img'); });
    await page.locator('#menu-grid [data-food-action="favorite"]').first().click();
    expect(await page.evaluate(() => window.keptMenuPhoto === document.querySelector('#menu-grid img'))).toBe(true);
    await page.locator('#more-foods').click();
    await expect(page.locator('#menu-grid .food-card')).toHaveCount(48);
    const food = catalog.at(-1);
    await page.locator('#menu-search').fill(food.name);
    await expect(page.locator('#menu-grid .food-card')).toHaveCount(1);
    await expect(page.locator('#menu-grid .food-card strong')).toHaveText(food.name);
    await expect(page.locator('#more-foods')).toHaveCount(0);
});

test('an unavailable WebP recovers to the original JPEG without losing the food', async ({ page }) => {
    await page.route('**/optimized/*.webp', route => route.abort());
    await page.goto('/');
    const image = page.locator('#recommendation img');
    await expect(image).toHaveAttribute('src', /^images_food\/food_\d+\.jpg$/);
    await expect(image).not.toHaveAttribute('srcset');
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.locator('#choose-daily').click();
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
});

test('the 320px primary choice remains one line and above the bottom navigation', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.clock.setFixedTime(new Date('2026-10-28T12:00:00+08:00'));
    await page.goto('/');
    const choice = page.locator('#choose-daily');
    await expect(choice).toBeEnabled();
    const button = await choice.boundingBox();
    const navigation = await page.locator('.main-nav').boundingBox();
    expect(button.height).toBeLessThanOrEqual(50);
    expect(button.y + button.height).toBeLessThan(navigation.y - 4);
    await choice.click();
    await expect(page.locator('#result-title')).toHaveText('这一餐，就它了。');
});
