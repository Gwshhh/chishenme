import { readdir, readFile, access, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { APP_VERSION } from '../src/core/model.js';
import { catalog } from '../src/core/catalog.js';

async function filesIn(directory) {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const name = `${directory}/${entry.name}`;
        if (entry.isDirectory()) files.push(...await filesIn(name));
        else if (/\.(js|mjs)$/.test(entry.name)) files.push(name);
    }
    return files;
}
const browserModules = await filesIn('src');
const scripts = ['app.js', 'data.js', 'config.js', 'dev_server.js', 'sw.js', 'sw-assets.js', ...browserModules, ...await filesIn('server'), ...await filesIn('scripts'), ...await filesIn('tests')];
for (const script of scripts) {
    const result = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${script}\n${result.stderr || result.error || ''}`);
}
const context = { self: {} };
vm.runInNewContext(await readFile('sw-assets.js', 'utf8'), context);
assert.equal(context.self.APP_VERSION, APP_VERSION, 'Service Worker version must match the app');
const html = await readFile('index.html', 'utf8');
for (const file of ['app.bundle.js', 'styles.css']) assert(html.includes(`${file}?v=${APP_VERSION}`), `${file} entry version must match APP_VERSION`);
const assets = context.self.APP_ASSETS;
const built = JSON.parse(await readFile('.wrangler/build-meta.json', 'utf8'));
assert(assets.includes('./app.bundle.js'), 'Offline shell missing the production bundle');
for (const file of browserModules) assert(built.inputs[file] || assets.includes('./' + file), `Offline shell missing ${file}`);
for (const asset of assets) if (asset !== './') await access(asset);
for (const food of catalog) await access(food.image);
let thumbnailBytes = 0;
for (const food of catalog) {
    for (const width of [160, 480, 768, 960]) {
        const asset = food.image.replace(/(food_\d+)\.jpg$/, `optimized/$1-${width}.webp`);
        const info = await stat(asset);
        assert(info.size > 0, `Empty food photograph: ${asset}`);
        if (width === 160) { thumbnailBytes += info.size; assert(info.size < 18000, `Wheel thumbnail exceeds 18 kB: ${asset}`); }
        if (width === 768) assert(info.size < 90000, `Phone hero exceeds 90 kB: ${asset}`);
    }
}
assert(thumbnailBytes < 450000, 'The complete wheel thumbnail set must stay under 450 kB');
for (const script of ['app.js', 'data.js', 'config.js', ...browserModules]) {
    const text = await readFile(script, 'utf8');
    assert(!/AMAP_KEY\s*=\s*['"][a-z\d]+/i.test(text), 'Do not publish map credentials');
    assert(!/\bon(?:click|error|load|submit)\s*=\s*["']/.test(text), `Inline handler in ${script}`);
}
assert.equal(new Set(catalog.map(food => food.id)).size, catalog.length, 'Catalog ids must be unique');
console.log(`Checked ${scripts.length} scripts, ${assets.length} offline resources and ${catalog.length} food images with 4 WebP sizes (${Math.round(thumbnailBytes / 1024)} KiB of thumbnails).`);
