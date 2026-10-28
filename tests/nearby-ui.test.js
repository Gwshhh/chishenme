import test from 'node:test';
import assert from 'node:assert/strict';
import { meituanDestination } from '../src/services/delivery.js';
import { weatherScene } from '../src/ui/weather.js';
import { normalizeWeather } from '../server/providers.js';

test('iPhone and touch iPad links open Meituan search with an encoded food name', () => {
    for (const device of [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X)' }, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5 }]) {
        const link = meituanDestination({ ...device, keyword: '面馆 & 粥#早餐' });
        assert.equal(link.mobile, true);
        const url = new URL(link.href);
        assert.equal(url.protocol, 'imeituan:');
        assert.equal(url.hostname, 'www.meituan.com');
        assert.equal(url.pathname, '/search');
        assert.equal(url.searchParams.get('q'), '面馆 & 粥#早餐');
        assert.equal(url.hash, '');
        assert.equal(link.web, 'https://i.meituan.com/');
    }
});

test('Android has a verified package and web fallback; desktop remains a normal website link', () => {
    const android = meituanDestination({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/123' });
    assert.match(android.href, /^intent:\/\/www\.meituan\.com\/search\?/);
    assert(android.href.includes('package=com.sankuai.meituan;'));
    assert(android.href.includes('S.browser_fallback_url=' + encodeURIComponent(android.web)));
    const desktop = meituanDestination({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/123' });
    assert.equal(desktop.mobile, false);
    assert.equal(desktop.href, 'https://waimai.meituan.com/');
});

test('embedded iPhone browsers expose a web route instead of an unsupported scheme', () => {
    const link = meituanDestination({ userAgent: 'Mozilla/5.0 (iPhone) MicroMessenger/8.0' });
    assert.equal(link.embedded, true);
    assert.equal(link.href, link.web);
});

test('weather reports real daily extremes and keeps snow and day/night semantics', () => {
    const sunny = normalizeWeather({ current: { temperature_2m: 29.6, weather_code: 0, is_day: 1, time: '2026-10-29T14:15' }, daily: { temperature_2m_max: [32.4], temperature_2m_min: [22.8] } });
    assert.equal(sunny.highC, 32); assert.equal(sunny.lowC, 23);
    assert.equal(sunny.tempC, 30); assert.equal(sunny.updatedTime, '14:15');
    assert.equal(weatherScene(sunny), 'clear');
    assert.equal(weatherScene({ ...sunny, isDay: false }), 'night');
    const snow = normalizeWeather({ current: { temperature_2m: 0, weather_code: 71 } });
    assert.equal(snow.description, '雪'); assert.equal(snow.kind, 'cold');
    assert.equal(snow.highC, null); assert.equal(snow.lowC, null);
    assert.equal(weatherScene(snow), 'snow');
    assert.equal(weatherScene(null), 'idle');
    assert.equal(weatherScene({ description: '雷雨', condition: '<invalid>' }), 'storm');
});
