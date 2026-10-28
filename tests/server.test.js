import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/app.js';
import { toGCJ02, normalizePlaces, normalizeWeather, fetchJson, nearbyPlaces } from '../server/providers.js';

async function withServer(options, run) {
    const server = http.createServer(createApp(options));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try { await run(base); }
    finally { await new Promise(resolve => server.close(resolve)); }
}

function rawRequest(base, pathname) {
    return new Promise((resolve, reject) => {
        const request = http.get(base + pathname, response => {
            let text = '';
            response.on('data', chunk => { text += chunk; });
            response.on('end', () => resolve({ status: response.statusCode, text }));
        });
        request.on('error', reject);
    });
}

test('server serves the app with correct MIME, HEAD and conditional caching', async () => {
    await withServer({}, async base => {
        const home = await fetch(base);
        assert.equal(home.status, 200); assert.match(await home.text(), /id="wheel-view"/);
        const module = await fetch(base + '/src/core/model.js');
        assert.match(module.headers.get('content-type'), /javascript/);
        const head = await fetch(base + '/src/core/model.js', { method: 'HEAD' });
        assert.equal(head.status, 200); assert.equal(await head.text(), '');
        const cached = await fetch(base + '/src/core/model.js', { headers: { 'If-None-Match': module.headers.get('etag') } });
        assert.equal(cached.status, 304);
        const thumbnail = await fetch(base + '/images_food/optimized/food_01-160.webp');
        assert.equal(thumbnail.status, 200);
        assert.equal(thumbnail.headers.get('content-type'), 'image/webp');
        assert((await thumbnail.arrayBuffer()).byteLength < 18000);
        assert.equal((await fetch(base + '/images_food/optimized/food_01-999.webp')).status, 404);
        const runtime = await fetch(base + '/runtime-config.json');
        assert.deepEqual(await runtime.json(), { apiBase: '/api/', development: false });
    });
});

test('server never serves credentials, dotfiles, traversal paths or nonpublic source', async () => {
    await withServer({}, async base => {
        for (const pathname of ['/.env', '/_dev_key.pem', '/.git/config', '/server/app.js', '/package.json', '/src/core/../../.env', '/%2e%2e/.env', '/%5c..%5c.env', '/%00', '/%E0%A4%A']) {
            const response = await rawRequest(base, pathname);
            assert([400, 403, 404].includes(response.status), `${pathname}: ${response.status}`);
            assert(!response.text.includes('AMAP_KEY='));
        }
        assert.equal((await fetch(base + '/app.js', { method: 'POST' })).status, 405);
    });
});

test('API rejects invalid coordinates/origins and reports unconfigured nearby accurately', async () => {
    await withServer({}, async base => {
        assert.equal((await fetch(base + '/api/config')).status, 200);
        const config = await (await fetch(base + '/api/config')).json();
        assert.equal(config.nearby, false); assert(!('amapKey' in config));
        for (const query of ['', '?lat=90&lon=181', '?lat=NaN&lon=1', '?lat=1&lat=2&lon=3', '?lat=&lon=3', '?lat=1&lon=3&level=7']) assert.equal((await fetch(base + '/api/nearby' + query)).status, 400);
        assert.equal((await fetch(base + '/api/nearby?lat=30&lon=120')).status, 503);
        assert.equal((await fetch(base + '/api/config', { headers: { Origin: 'https://unapproved.test' } })).status, 403);
    });
});

test('configured CORS allows only the exact static-site origin', async () => {
    await withServer({ allowedOrigin: 'https://food.example' }, async base => {
        const allowed = await fetch(base + '/api/config', { headers: { Origin: 'https://food.example' } });
        assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://food.example');
        const denied = await fetch(base + '/api/config', { headers: { Origin: 'https://food.example.evil.test' } });
        assert.equal(denied.status, 403);
    });
});

test('nearby proxy normalizes real POIs and caches/coalesces identical reads', async () => {
    let calls = 0;
    const fetchImpl = async url => {
        calls++; assert.equal(url.origin, 'https://restapi.amap.com'); assert.equal(url.searchParams.get('key'), 'fixture-key');
        if (url.pathname.includes('regeo')) return Response.json({ status: '1', regeocode: { addressComponent: { city: [], province: '北京市', district: '海淀区' } } });
        return Response.json({ status: '1', pois: [{ id: 'one', name: '测试面馆', type: '餐饮服务;快餐;面馆', address: '测试路', location: '116.3,39.9', distance: '120', photos: [] }] });
    };
    await withServer({ amapKey: 'fixture-key', fetchImpl, pageDelay: 0 }, async base => {
        const url = base + '/api/nearby?lat=39.9&lon=116.3';
        const results = await Promise.all([fetch(url).then(result => result.json()), fetch(url).then(result => result.json())]);
        assert.equal(calls, 2); assert.equal(results[0].places[0].id, 'amap:one');
        assert.equal(results[0].places[0].distance, 120); assert.equal(results[0].city, '北京市 · 海淀区');
        assert(!JSON.stringify(results).includes('fixture-key'));
        await fetch(url); assert.equal(calls, 2);
    });
});

test('provider errors are redacted; later-page failures preserve partial results', async () => {
    const failed = async () => Response.json({ status: '0', info: 'private-provider-detail' });
    await assert.rejects(() => nearbyPlaces({ lat: 30, lon: 120, level: 1, amapKey: 'secret', fetchImpl: failed, pageDelay: 0 }), error => error.status === 502 && !error.message.includes('private'));
    const partial = await nearbyPlaces({ lat: 30, lon: 120, level: 2, amapKey: 'secret', pageDelay: 0, fetchImpl: async url => {
        if (url.searchParams.get('page') === '1') return Response.json({ status: '1', pois: Array.from({ length: 25 }, (_, index) => ({ id: String(index), name: `饭店${index}`, distance: String(index) })) });
        return Response.json({ status: '0' });
    } });
    assert.equal(partial.places.length, 25); assert.equal(partial.partial, true);
});

test('providers enforce request timeouts and response size bounds', async () => {
    await assert.rejects(() => fetchJson(new URL('https://example.test'), { timeout: 10, fetchImpl: async (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) }), error => error.status === 504);
    await assert.rejects(() => fetchJson(new URL('https://example.test'), { fetchImpl: async () => new Response('x'.repeat(1024 * 1024 + 1)) }), error => error.status === 502);
});

test('rate limiting bounds abusive uncached API requests', async () => {
    await withServer({}, async base => {
        let response;
        for (let i = 0; i < 41; i++) response = await fetch(base + '/api/nearby?lat=30&lon=120');
        assert.equal(response.status, 429);
    });
});

test('coordinate conversion and weather/POI normalization are defensively bounded', () => {
    assert.deepEqual(toGCJ02(51.5, -0.1), [-0.1, 51.5]);
    const [lon, lat] = toGCJ02(39.9, 116.3);
    assert(lon > 116.3 && lon < 116.31); assert(lat > 39.9 && lat < 39.91);
    assert.equal(normalizeWeather({ current: { temperature_2m: 34, weather_code: 0 } }).kind, 'hot');
    assert.equal(normalizeWeather({ current: { temperature_2m: 8, weather_code: 61 } }).kind, 'rain');
    assert.throws(() => normalizeWeather({ current: {} }));
    const places = normalizePlaces([null, { id: '1', name: '面馆', photos: [{ url: 'javascript:alert(1)' }] }, { id: '1', name: '面馆' }]);
    assert.equal(places.length, 1); assert.equal(places[0].image, '');
});
