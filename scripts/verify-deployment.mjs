import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_VERSION } from '../src/core/model.js';

const publicTestLocation = 'lat=39.9042&lon=116.4074&level=1';

export async function verifyNearbyApi(apiBase, { origin = 'https://gwshhh.github.io' } = {}) {
    const base = new URL(apiBase);
    assert(base.protocol === 'https:' || ['127.0.0.1', 'localhost'].includes(base.hostname), 'API must use HTTPS');
    const read = async route => {
        const response = await fetch(new URL(route, base), { headers: { Origin: origin }, signal: AbortSignal.timeout(35000) });
        assert.equal(response.status, 200, `API ${route.split('?')[0]} failed (${response.status})`);
        assert.equal(response.headers.get('access-control-allow-origin'), origin, 'API does not allow the site origin');
        assert.equal(response.headers.get('cache-control'), 'no-store', 'API responses must not be publicly cached');
        return response.json();
    };
    const config = await read('config');
    assert.equal(config.version, APP_VERSION, 'API version is not the release being published');
    assert.equal(config.nearby, true, 'Nearby API is not enabled');
    const nearby = await read('nearby?' + publicTestLocation);
    assert(Array.isArray(nearby.places) && nearby.places.length > 0, 'API returned no real restaurants at the fixed public test location');
    assert.equal(nearby.source, '高德地图');
    assert(nearby.places.every(place => place.id.startsWith('amap:') && place.name && place.isNearby));
    const denied = await fetch(new URL('config', base), { headers: { Origin: 'https://unapproved.example' }, signal: AbortSignal.timeout(15000) });
    assert.equal(denied.status, 403, 'Unexpected origin was accepted');
    return { apiBase: base.href, version: config.version, restaurants: nearby.places.length, partial: nearby.partial, source: nearby.source };
}

export async function verifyDeployment(site = 'https://gwshhh.github.io/chishenme/') {
    const base = new URL(site);
    const response = await fetch(new URL('runtime-config.json', base), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, 'Runtime configuration unavailable');
    const config = await response.json();
    assert(typeof config.apiBase === 'string' && config.apiBase.trim(), 'Published runtime-config.json has an empty API address');
    const api = await verifyNearbyApi(new URL(config.apiBase, base), { origin: base.origin });
    const htmlResponse = await fetch(base, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text();
    assert(html.includes(`app.js?v=${APP_VERSION}`), 'Published page is not the current release');
    return { site: base.href, ...api, verifiedAt: new Date().toISOString(), testLocation: '固定公开测试地点（北京），未使用用户定位' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try { console.log(JSON.stringify(await verifyDeployment(process.argv[2]), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
