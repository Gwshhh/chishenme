import { $ } from './dom.js';
import { icon } from './icons.js';

export function weatherScene(weather) {
    if (!weather) return 'idle';
    const scenes = ['clear', 'partly-cloudy', 'cloudy', 'fog', 'rain', 'snow', 'storm'];
    const fallback = /雷/.test(weather.description) ? 'storm' : /雪/.test(weather.description) ? 'snow' : /雨/.test(weather.description) ? 'rain' : /雾/.test(weather.description) ? 'fog' : /晴/.test(weather.description) ? 'clear' : 'cloudy';
    const scene = scenes.includes(weather.condition) ? weather.condition : fallback;
    return weather.isDay === false && ['clear', 'partly-cloudy'].includes(scene) ? 'night' : scene;
}

function weatherArtwork(scene) {
    if (scene === 'idle') return icon('pin');
    const sun = '<circle cx="83" cy="37" r="24" fill="url(#weather-sun)"/>';
    const moon = '<path d="M105 12a29 29 0 1 0 27 40 30 30 0 0 1-27-40Z" fill="#fff3cc"/>';
    const cloud = '<path d="M35 82a19 19 0 0 1-1-38 29 29 0 0 1 55-9 23 23 0 0 1 29 24 12 12 0 0 1-1 23Z" fill="url(#weather-cloud)"/>';
    const rain = '<path d="m43 91-5 10m29-10-5 10m29-10-5 10" stroke="#c8e5ff" stroke-width="4" stroke-linecap="round"/>';
    const snow = '<g fill="#fff"><circle cx="42" cy="95" r="3"/><circle cx="65" cy="102" r="3"/><circle cx="88" cy="94" r="3"/></g>';
    const fog = '<path d="M26 91h82m-69 9h56" stroke="#e1edf6" stroke-width="3" stroke-linecap="round"/>';
    const storm = '<path d="m72 71-14 20h13l-6 17 26-29H77l6-8Z" fill="#ffe28f"/>';
    const shape = scene === 'clear' ? sun : scene === 'night' ? moon + '<circle cx="57" cy="23" r="2" fill="#fff"/><circle cx="138" cy="19" r="1.5" fill="#fff"/>' : (scene === 'partly-cloudy' ? sun : '') + cloud + ({ rain, snow, fog, storm }[scene] || '');
    return `<svg viewBox="0 0 160 116" fill="none" aria-hidden="true"><defs><radialGradient id="weather-sun"><stop stop-color="#ffedb0"/><stop offset="1" stop-color="#ffc65b"/></radialGradient><linearGradient id="weather-cloud" x1="40" y1="34" x2="89" y2="85" gradientUnits="userSpaceOnUse"><stop stop-color="#fff" stop-opacity=".96"/><stop offset="1" stop-color="#e2ecf6" stop-opacity=".7"/></linearGradient></defs>${shape}</svg>`;
}

export function renderWeather({ city = '', weather = null, state = 'idle' } = {}) {
    const root = $('#weather-status');
    const parts = city.split(' · ').map(part => part.trim()).filter(Boolean);
    const scene = weatherScene(weather);
    root.dataset.scene = scene;
    root.dataset.state = state;
    const title = parts[0] || (state === 'idle' || state === 'connecting' ? '身边的天气' : '我的位置');
    const district = parts.slice(1).join(' · ') || ({ idle: '定位后，看看此刻的天空', connecting: '正在连接附近服务', locating: '等待浏览器获取位置', loading: '正在更新当地天气', error: '天气暂时无法更新' }[state] || '当前位置');
    $('#weather-city').textContent = title;
    $('#weather-city').title = title;
    $('#weather-district').textContent = district;
    $('#weather-temperature').textContent = Number.isFinite(weather?.tempC) ? String(weather.tempC) : '--';
    const description = weather ? `${weather.description}${state === 'stale' ? ' · 上次天气' : ''}` : ({ idle: '天气随你所在', connecting: '连接中…', locating: '定位中…', loading: '获取天气中…', error: '稍后重试' }[state] || '暂无天气');
    $('#weather-description').textContent = description;
    const range = Number.isFinite(weather?.highC) && Number.isFinite(weather?.lowC) ? `最高 ${weather.highC}° · 最低 ${weather.lowC}°` : weather ? '实时天气' : '找一家店，好好吃饭';
    $('#weather-range').textContent = range;
    if ($('#weather-art').dataset.scene !== scene) {
        $('#weather-art').innerHTML = weatherArtwork(scene);
        $('#weather-art').dataset.scene = scene;
    }
    root.setAttribute('aria-label', `${title}，${district}，${description}${weather ? `，${weather.tempC}摄氏度，${range}` : ''}`);
}
