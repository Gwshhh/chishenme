import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium, devices } from '@playwright/test';

// A controlled before/after comparison; this does not measure a real carrier's
// path to GitHub or Cloudflare. No user position or saved browser data is used.
const revision = process.argv[2] || 'e25651ad9181c1be3cf987fba70ba60ecbcdb4ff';
if (!/^[a-f0-9]{7,40}$/.test(revision)) throw new Error('Pass a git commit hash');
const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
const files = (await run('git', ['ls-tree', '-r', '--name-only', revision, '--', 'src', 'index.html', 'styles.css', 'app.js', 'data.js', 'config.js'], { cwd: root, windowsHide: true })).stdout.trim().split(/\r?\n/);
const baseline = new Map();
for (const file of files) {
    if (!/^[a-zA-Z0-9/.-]+$/.test(file)) throw new Error('Unexpected baseline path');
    baseline.set(file, Buffer.from((await run('git', ['show', `${revision}:${file}`], { cwd: root, windowsHide: true, maxBuffer: 2 * 1024 * 1024 })).stdout));
}
const publicFile = /^(?:index\.html|app\.bundle\.js|styles\.css|manifest\.json|icon\.svg|favicon[^/]*|apple-touch-icon\.png|src\/ui\/theme-bootstrap\.js|images_food\/(?:food_\d+\.jpg|optimized\/food_\d+-(?:160|480|768|960)\.webp))$/;
const server = http.createServer(async (request, response) => {
    try {
        const [mode, ...path] = new URL(request.url, 'http://localhost').pathname.slice(1).split('/');
        if (!['before', 'after'].includes(mode)) { response.writeHead(404).end(); return; }
        const file = path.join('/') || 'index.html';
        if (file === 'runtime-config.json') { response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"apiBase":""}'); return; }
        let body;
        if (mode === 'before' && baseline.has(file)) body = baseline.get(file);
        else if (publicFile.test(file)) body = await readFile(new URL(file, new URL('../', import.meta.url)));
        else { response.writeHead(404).end(); return; }
        const text = /\.(?:html|js|css|json|svg)$/.test(file);
        const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.webp') ? 'image/webp' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
        if (text) body = gzipSync(body);
        response.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'public, max-age=3600', ...(text ? { 'Content-Encoding': 'gzip' } : {}) });
        response.end(body);
    } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
const results = [];
try {
    for (let round = 0; round < 3; round++) for (const version of ['before', 'after']) {
        const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750, connectionType: 'cellular4g' });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.addInitScript(() => {
            // Only freeze the calendar. Playwright's virtual clock replaces the
            // Performance object, hiding native resource timings from a benchmark.
            const NativeDate = Date, fixed = NativeDate.parse('2026-10-29T12:00:00+08:00');
            window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
            window.startupProbe = { lcp: 0, cls: 0, ready: 0, hero: 0 };
            new PerformanceObserver(list => { for (const entry of list.getEntries()) window.startupProbe.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
            new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.startupProbe.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
            const observer = new MutationObserver(() => {
                if (document.querySelector('#choose-daily:not(:disabled)')) { window.startupProbe.ready = performance.now(); observer.disconnect(); }
            });
            observer.observe(document, { childList: true, subtree: true });
            document.addEventListener('load', event => { if (!window.startupProbe.hero && event.target.matches?.('#recommendation img')) window.startupProbe.hero = performance.now(); }, true);
        });
        await page.goto(`${base}/${version}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelector('#recommendation img')?.complete && document.querySelector('#recommendation img')?.naturalWidth > 0 && document.querySelector('#choose-daily:not(:disabled)'), null, { timeout: 20000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const measured = await page.evaluate(() => {
            const resources = performance.getEntriesByType('resource');
            const scripts = resources.filter(entry => /\.js(?:\?|$)/.test(entry.name));
            return { ...window.startupProbe, scripts: scripts.length, scriptTransferBytes: scripts.reduce((sum, entry) => sum + entry.transferSize, 0), firstPhotos: resources.filter(entry => /images_food/.test(entry.name)).map(entry => ({ url: entry.name.split('/images_food/')[1], bytes: entry.transferSize })) };
        });
        const interactionMs = await page.evaluate(() => {
            const start = performance.now(); document.querySelector('#shuffle-daily').click();
            return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start))));
        });
        results.push({ version, round: round + 1, ...measured, interactionMs });
        console.log(JSON.stringify({ version, round: round + 1, readyMs: Math.round(measured.ready), heroMs: Math.round(measured.hero), lcpMs: Math.round(measured.lcp), scripts: measured.scripts }));
        await context.close();
    }
    const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const summary = Object.fromEntries(['before', 'after'].map(version => [version, Object.fromEntries(['ready', 'hero', 'lcp', 'cls', 'scripts', 'scriptTransferBytes', 'interactionMs'].map(key => [key, median(results.filter(result => result.version === version).map(result => result[key]))]))]));
    await mkdir(new URL('../.playwright-mcp/', import.meta.url), { recursive: true });
    await writeFile(new URL('../.playwright-mcp/performance-v324.json', import.meta.url), JSON.stringify({ baselineRevision: revision, scenario: 'Fresh iPhone-sized Chromium contexts, local gzip server, 150ms RTT, 1.6Mbps down, 4x CPU slowdown; not a real carrier benchmark', summary, results }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
