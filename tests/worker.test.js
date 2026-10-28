import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../server/worker.js';

const origin = 'https://gwshhh.github.io';
const env = { AMAP_KEY: 'fixture-only-key', ALLOWED_ORIGIN: origin };
const request = (path, init = {}) => new Request('https://nearby.example' + path, { ...init, headers: { Origin: origin, 'CF-Connecting-IP': '192.0.2.1', ...init.headers } });
const provider = async url => {
    assert.equal(url.origin, 'https://restapi.amap.com');
    assert.equal(url.searchParams.get('key'), env.AMAP_KEY);
    if (url.pathname.endsWith('/regeo')) return Response.json({ status: '1', regeocode: { addressComponent: { province: '测试市', city: [], district: '测试区' } } });
    return Response.json({ status: '1', pois: [{ id: 'edge-test', name: '测试面馆', type: '餐饮服务;面馆', distance: '120', location: '116.4,39.9', photos: [] }] });
};

test('edge API exposes capabilities without credentials and restricts the exact Pages origin', async () => {
    const worker = createWorker();
    const response = await worker(request('/api/config'), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.equal(data.nearby, true); assert.equal(data.weather, true);
    assert(!JSON.stringify(data).includes(env.AMAP_KEY));
    const disabled = await worker(request('/api/config'), { ALLOWED_ORIGIN: origin });
    assert.equal((await disabled.json()).nearby, false);
    const denied = await worker(request('/api/config', { headers: { Origin: origin + '.evil.test' } }), env);
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    const preflight = await worker(request('/api/nearby', { method: 'OPTIONS' }), env);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
});

test('edge API rejects invalid routes, methods and coordinates before contacting Amap', async () => {
    let calls = 0;
    const worker = createWorker({ fetchImpl: () => { calls++; throw new Error('must not fetch'); } });
    for (const query of ['', '?lat=1&lon=181', '?lat=NaN&lon=1', '?lat=&lon=3', '?lat=1&lat=2&lon=3', '?lat=1&lon=3&level=4', '?lat=1&lon=3&level=1&level=2']) {
        assert.equal((await worker(request('/api/nearby' + query), env)).status, 400, query);
    }
    assert.equal((await worker(request('/api/nearby?lat=1&lon=3'), { ALLOWED_ORIGIN: origin })).status, 503);
    assert.equal((await worker(request('/api/config', { method: 'POST' }), env)).status, 405);
    assert.equal((await worker(request('/api/unknown'), env)).status, 404);
    assert.equal((await worker(request('/.env'), env)).status, 404);
    const head = await worker(request('/api/health', { method: 'HEAD' }), env);
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    assert.equal(calls, 0);
});

test('edge queries reuse provider normalization, merge concurrent requests and expire their cache', async () => {
    let calls = 0, clock = 0;
    const worker = createWorker({ now: () => clock, pageDelay: 0, fetchImpl: async url => { calls++; return provider(url); } });
    const run = () => worker(request('/api/nearby?lat=39.9042&lon=116.4074&level=1'), env);
    const replies = await Promise.all([run(), run()]);
    const data = await replies[0].json();
    assert.equal(data.source, '高德地图');
    assert.equal(data.places[0].id, 'amap:edge-test');
    assert.equal(data.places[0].distance, 120);
    assert.equal(data.city, '测试市 · 测试区');
    assert.equal(calls, 2);
    await run(); assert.equal(calls, 2);
    clock = 300001;
    await run(); assert.equal(calls, 4);
});

test('edge limiter returns a readable retry response with CORS and no upstream call', async () => {
    let calls = 0, key;
    const worker = createWorker({ fetchImpl: () => { calls++; } });
    const response = await worker(request('/api/nearby?lat=39&lon=116'), {
        ...env, NEARBY_LIMITER: { limit: async options => { key = options.key; return { success: false }; } },
    });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '60');
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(key, '192.0.2.1'); assert.equal(calls, 0);
});

test('edge fallback rate limit remains bounded without the platform binding', async () => {
    const worker = createWorker({ pageDelay: 0, fetchImpl: provider });
    for (let i = 0; i < 40; i++) assert.equal((await worker(request('/api/nearby?lat=39&lon=116'), env)).status, 200);
    assert.equal((await worker(request('/api/nearby?lat=39&lon=116'), env)).status, 429);
});

test('edge upstream failures are redacted and unsuccessful requests can be retried', async () => {
    let fail = true;
    const worker = createWorker({ pageDelay: 0, fetchImpl: url => fail ? Promise.resolve(Response.json({ status: '0', info: 'private-provider-data' })) : provider(url) });
    const failed = await worker(request('/api/nearby?lat=39&lon=116'), env);
    assert.equal(failed.status, 502);
    const body = await failed.text();
    assert(!body.includes(env.AMAP_KEY)); assert(!body.includes('private-provider-data'));
    fail = false;
    assert.equal((await worker(request('/api/nearby?lat=39&lon=116'), env)).status, 200);
});

test('edge limits concurrent upstream work while allowing a coalesced request', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const worker = createWorker({ pageDelay: 0, fetchImpl: async url => { await gate; return provider(url); } });
    const first = worker(request('/api/nearby?lat=39&lon=116'), env);
    const same = worker(request('/api/nearby?lat=39&lon=116'), env);
    const second = worker(request('/api/nearby?lat=40&lon=116'), env);
    const busy = await worker(request('/api/nearby?lat=41&lon=116'), env);
    assert.equal(busy.status, 503);
    release();
    for (const response of await Promise.all([first, same, second])) assert.equal(response.status, 200);
});
