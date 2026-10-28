import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { dirname, resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { catalog } from '../src/core/catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const bundle = await build({
    absWorkingDir: root, entryPoints: ['app.js'], outfile: 'app.bundle.js',
    bundle: true, minify: true, charset: 'utf8', legalComments: 'none',
    format: 'esm', platform: 'browser', target: ['es2022', 'safari15'], metafile: true, write: false,
});
const compiled = bundle.outputFiles[0].contents;
await writeFile(join(root, 'app.bundle.js'), compiled);
await mkdir(join(root, '.wrangler'), { recursive: true });
await writeFile(join(root, '.wrangler/build-meta.json'), JSON.stringify(bundle.metafile));

// Delete only this build's resolved output directory, never the project itself.
assert.equal(dirname(output), resolve(root));
assert.equal(output, resolve(root, 'dist'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const shell = [
    'index.html', 'app.bundle.js', 'sw.js', 'sw-assets.js', 'manifest.json',
    'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.ico', 'favicon-32.png',
    'src/ui/theme-bootstrap.js',
];
const photos = catalog.flatMap(food => [food.image, ...[160, 480, 768, 960].map(width => food.image.replace(/(food_\d+)\.jpg$/, `optimized/$1-${width}.webp`))]);
// A fixed public allowlist keeps .env, deployment credentials and source maps
// outside the uploaded asset directory.
for (const file of new Set([...shell, ...photos])) {
    const target = resolve(output, file);
    assert(target.startsWith(output + sep));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, file), target);
}
const css = await transform(await readFile(join(root, 'styles.css'), 'utf8'), { loader: 'css', minify: true, target: 'safari15' });
await writeFile(join(output, 'styles.css'), css.code);
await writeFile(join(output, 'runtime-config.json'), '{"apiBase":"/api/"}\n');
await writeFile(join(output, '_headers'), [
    '/images_food/*', '  Cache-Control: public, max-age=604800, stale-while-revalidate=86400',
    '/app.bundle.js', '  Cache-Control: public, max-age=0, must-revalidate',
    '/styles.css', '  Cache-Control: public, max-age=0, must-revalidate',
    '/sw.js', '  Cache-Control: no-cache', '  Service-Worker-Allowed: /',
    '/*', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: strict-origin-when-cross-origin', '',
].join('\n'));
console.log(`Built ${Object.keys(bundle.metafile.inputs).length} modules into one ${Math.round(compiled.length / 1024)} KiB bundle (${Math.round(gzipSync(compiled).length / 1024)} KiB gzip); ${new Set(photos).size} public photo assets.`);
