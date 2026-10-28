import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/services/api.js';

const config = { apiBase: 'https://nearby.example/api/' };

test('a failed capability check can recover on the next explicit nearby attempt', async () => {
    let checks = 0;
    const api = createApi({ config, fetchImpl: async url => {
        if (url.pathname.endsWith('/config')) {
            if (++checks === 1) throw new TypeError('network interrupted');
            return Response.json({ nearby: true, weather: false });
        }
        assert.equal(url.origin, 'https://nearby.example');
        assert.equal(url.searchParams.get('lat'), '39.9');
        return Response.json({ places: [{ id: 'amap:test', name: '测试餐馆', isNearby: true }] });
    } });
    assert.equal((await api.ready).nearby, false);
    assert.match(api.connectionError, /连接不上/);
    const result = await api.nearby({ latitude: 39.9, longitude: 116.4 }, { level: 1 });
    assert.equal(result.places[0].id, 'amap:test');
    assert.equal(checks, 2); assert.equal(api.connectionError, '');
    assert.equal(api.capabilities.nearby, true);
});

test('concurrent discovery calls share work and successful discovery is reused', async () => {
    let checks = 0;
    const api = createApi({ config, fetchImpl: async () => { checks++; return Response.json({ nearby: true, weather: true }); } });
    await Promise.all([api.ready, api.ensureReady({ retry: true }), api.ensureReady({ retry: true })]);
    await api.ensureReady({ retry: true });
    assert.equal(checks, 1);
});

test('an intentionally unconfigured static deployment makes no API request', async () => {
    const paths = [];
    const api = createApi({ config: { apiBase: '' }, fetchImpl: async url => { paths.push(url.pathname); return Response.json({ apiBase: '' }); } });
    assert.equal((await api.ready).nearby, false);
    await assert.rejects(() => api.nearby({ latitude: 30, longitude: 120 }), /尚未启用/);
    assert(paths.every(path => path.endsWith('/runtime-config.json')));
    assert.equal(api.connectionError, '');
});

test('runtime configuration connects a static subdirectory to the HTTPS edge API', async () => {
    const urls = [];
    const api = createApi({ config: { apiBase: '' }, fetchImpl: async (url, options) => {
        assert.equal(options.cache, 'no-store', 'Runtime configuration must not reuse the previously empty HTTP cache entry');
        urls.push(url.href);
        return Response.json(url.pathname.endsWith('/runtime-config.json') ? { apiBase: config.apiBase } : { nearby: true, weather: true });
    } });
    assert.equal((await api.ready).nearby, true);
    assert.equal(urls[1], 'https://nearby.example/api/config');
});

test('bad API addresses and invalid responses produce a retryable public error', async () => {
    const unsafe = createApi({ config: { apiBase: 'javascript:alert(1)' }, fetchImpl: () => { throw new Error('must not fetch'); } });
    assert.equal((await unsafe.ready).nearby, false);
    assert.match(unsafe.connectionError, /连接不上/);
    const broken = createApi({ config, fetchImpl: async () => new Response('<html>private error page</html>', { status: 502 }) });
    await broken.ready;
    assert.match(broken.connectionError, /连接不上/);
    assert(!broken.connectionError.includes('private'));
});
