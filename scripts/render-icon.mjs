// Build-time renderer only. The browser is the SVG renderer used by the app itself.
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const source = await readFile(new URL('../assets/brand/app-icon-master.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
});
try {
    const page = await browser.newPage();
    const result = await page.evaluate(async svg => {
        async function render(text) {
            const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
            try {
                const image = new Image();
                image.src = url;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 1024;
                canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024);
                return canvas.toDataURL('image/png').split(',')[1];
            } finally { URL.revokeObjectURL(url); }
        }
        const rounded = svg.replace('id="tile-shape" width="512" height="512" rx="0"', 'id="tile-shape" width="512" height="512" rx="112"');
        const foreground = svg.replace('id="background"', 'id="background" opacity="0"');
        return { native: await render(svg), rounded: await render(rounded), foreground: await render(foreground) };
    }, source);
    process.stdout.write(JSON.stringify(result));
} finally {
    await browser.close();
}
