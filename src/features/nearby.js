import { $, toast } from '../ui/dom.js';
import { locate } from '../services/api.js';

export function initNearby(app) {
    let controller, sequence = 0, position;
    const button = $('#locate-btn'), level = $('#nearby-level'), status = $('#nearby-status'), cancel = $('#cancel-nearby');
    level.value = String(app.store.get().settings.nearbyLevel);
    const load = async (reuse = false) => {
        const token = ++sequence;
        controller?.abort(); controller = new AbortController();
        button.disabled = true; cancel.hidden = false;
        const signal = controller.signal;
        status.textContent = reuse && position ? '正在寻找附近的真实店铺…' : '正在获取位置，请留意浏览器权限提示…';
        try {
            const capabilities = await app.api.ready;
            if (!capabilities.nearby) throw new Error('附近店铺服务尚未启用，可点击下方入口去美团看看');
            const acquired = !reuse || !position ? await locate() : position;
            if (signal.aborted || token !== sequence) return;
            position = acquired;
            status.textContent = '正在搜索附近店铺，范围较大时可能需要稍等…';
            app.api.weather(position, { signal }).then(weather => {
                if (signal.aborted || token !== sequence) return;
                app.ui.weather = weather;
                $('#weather-status').hidden = false;
                $('#weather-status').textContent = `${weather.description} · ${weather.tempC}℃${weather.kind !== 'mild' ? ' · 推荐会参考当前天气' : ''}`;
            }).catch(() => {});
            const result = await app.api.nearby(position, { level: Number(level.value), signal });
            if (signal.aborted || token !== sequence) return;
            if (!result.places.length) { status.textContent = '这个范围暂未找到收录的店铺，可以扩大范围再试。'; return; }
            app.ui.nearby = result.places; app.ui.useNearby = true; app.ui.categories = [];
            status.textContent = `${result.city ? result.city + ' · ' : ''}找到 ${result.places.length} 家店${result.partial ? '（部分结果，可重试）' : ''}，已加入转盘。`;
            app.features.wheel.render('nearby');
            if (app.ui.route === 'list') app.features.list.render();
            toast(`附近 ${result.places.length} 家店已就位`);
        } catch (error) { if (!signal.aborted && token === sequence) status.textContent = error.message; }
        finally { if (token === sequence) { button.disabled = false; button.textContent = position ? '重新找店' : '定位找店'; cancel.hidden = true; } }
    };
    button.addEventListener('click', () => load(false));
    const cancelSearch = () => { sequence++; controller?.abort(); button.disabled = false; cancel.hidden = true; status.textContent = '已取消搜索，当前菜单保持不变。'; };
    cancel.addEventListener('click', cancelSearch);
    level.addEventListener('change', () => { app.store.update(data => { data.settings.nearbyLevel = Number(level.value); }, 'nearby-setting'); if (position || controller && button.disabled) load(true); });
    app.api.ready.then(capabilities => { if (!capabilities.nearby && !position) status.textContent = '当前可使用美食菜单，也可以直接去外卖平台发现附近。'; });
    return { cancel: cancelSearch, refresh() { level.value = String(app.store.get().settings.nearbyLevel); } };
}
