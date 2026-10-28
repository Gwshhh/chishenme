import { $, attr, escapeHtml, on, toast, downloadFile } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createBackup, parseBackup } from '../core/backup.js';
import { cleanText, LIMITS } from '../core/model.js';
import { filterFoods } from '../core/selection.js';
import { enableShake } from '../services/feedback.js';

const preferenceFields = [
    ['avoidSpicy', '不吃辣', '只选已标注不辣的菜品；口味未知的店铺暂不参与。'],
    ['vegetarian', '蛋奶素偏好', '只选蛋奶素参考标签；实际配料仍需向商家确认。'],
    ['preferLight', '清淡优先', '提高清淡口味的推荐机会，保留其他选择。'],
    ['avoidRepeat', '避免连续重复', '有其他选择时，下一次不再抽到同一道。'],
    ['fatigueDecay', '最近选过的少抽到', '参考近 7 天的选择记录，让每一餐多点变化。'],
];
const accents = [['sunset', '落日珊瑚'], ['celadon', '青瓷'], ['indigo', '靛蓝'], ['violet', '紫棠'], ['amber', '琥珀'], ['rose', '胭脂']];

export function initSettings(app) {
    const root = $('#settings-view');
    let imported = null, fileSequence = 0, stopShake;
    root.innerHTML = `<div class="page-heading"><div><h1 id="settings-heading">让每个选择，更合你的口味。</h1><p>偏好用于转盘、推荐与自动计划，随时可以调整。</p></div><a href="#wheel" class="text-button">返回转盘${icon('arrow')}</a></div><div class="settings-layout"><div><section class="settings-section"><h2>饮食偏好</h2><p class="muted" id="preference-count"></p><div class="preference-options">${preferenceFields.map(([key, title, description]) => `<label class="preference-row"><span><strong>${title}</strong><small>${description}</small></span><input type="checkbox" data-preference="${key}" role="switch" aria-label="${title}"></label>`).join('')}</div><form id="keyword-form"><div class="field"><label for="excluded-keywords">不想吃的关键词</label><textarea id="excluded-keywords" rows="3" maxlength="2000" placeholder="例如：香菜，羊肉，咖啡" aria-describedby="keyword-hint"></textarea><small id="keyword-hint">用逗号或换行分隔，最多 50 个词；匹配菜名、分类与描述。</small></div><div class="form-inline-actions"><p id="keyword-error" class="form-error" role="alert"></p><button class="button secondary" type="submit">保存关键词</button></div></form></section><section class="settings-section"><h2>暂时不想吃</h2><p class="muted">在菜品详情里加入，不会影响收藏或删除原菜单。</p><div id="excluded-list" class="excluded-list"></div></section></div><div><section class="settings-section"><h2>喜欢的样子</h2><div class="field"><label for="theme-mode">明暗模式</label><select id="theme-mode"><option value="system">跟随系统</option><option value="light">浅色模式</option><option value="dark">深色模式</option></select></div><div class="theme-options">${accents.map(([key, label]) => `<button class="theme-option" data-accent="${key}" aria-label="${label}"><span class="theme-swatch ${key}"></span><span>${label}</span>${icon('check')}</button>`).join('')}</div><label class="preference-row"><span><strong>转盘音效</strong><small>抽取时播放轻轻的提示音。</small></span><input type="checkbox" id="settings-sound" role="switch" aria-label="转盘音效"></label><div class="preference-row"><span><strong>摇一摇抽取</strong><small>仅本次打开有效，由你主动开启。</small></span><button class="button secondary" id="enable-shake">开启摇一摇</button></div></section><section class="settings-section"><h2>数据，由你保管</h2><p class="muted">收藏、记录、菜单、计划和偏好保存在当前浏览器。换设备前，带上一份完整备份。</p><button class="button secondary full-width" id="export-backup">${icon('download')}导出完整备份</button><div class="field import-backup"><label for="backup-file">从备份恢复</label><input type="file" id="backup-file" accept=".json,application/json" aria-describedby="backup-help"><small id="backup-help">恢复会替换当前数据，建议先导出备份。文件最大 2 MB。</small></div><p class="form-error" id="backup-error" role="alert"></p><div id="backup-preview" class="backup-preview" hidden></div><button class="button primary full-width" id="restore-backup" hidden>确认恢复备份</button><p class="fine-print">只导入菜单，请到「菜单 → 管理菜单」。备份不包含定位与服务密钥。</p></section></div></div>`;
    const render = () => {
        const data = app.store.get();
        root.querySelectorAll('[data-preference]').forEach(input => { input.checked = data.preferences[input.dataset.preference]; });
        if (document.activeElement !== $('#excluded-keywords')) $('#excluded-keywords').value = data.preferences.excludedKeywords.join('，');
        $('#theme-mode').value = data.settings.theme;
        $('#settings-sound').checked = data.settings.sound;
        root.querySelectorAll('[data-accent]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.accent === data.settings.accent)); });
        const count = filterFoods(app.menu(), { preferences: data.preferences }).length;
        $('#preference-count').textContent = `当前偏好下，${app.menu().length} 道菜中有 ${count} 道可参与推荐。`;
        $('#excluded-list').innerHTML = data.preferences.excludedIds.length ? data.preferences.excludedIds.map(id => `<div class="excluded-item"><span>${escapeHtml(app.findFood(id)?.name || id.replace(/^food:/, ''))}</span><button class="text-button" data-restore-food="${attr(id)}">恢复参与</button></div>`).join('') : '<p class="muted">没有不想吃的菜品，尽情发现新的味道。</p>';
    };
    on(root, 'change', '[data-preference]', (_, input) => { app.store.update(data => { data.preferences[input.dataset.preference] = input.checked; }, 'preferences'); toast('偏好已更新'); });
    $('#keyword-form').addEventListener('submit', event => {
        event.preventDefault();
        const words = [...new Set($('#excluded-keywords').value.split(/[,，、;；\n]+/).map(word => cleanText(word, 30)).filter(Boolean))];
        if (words.length > 50) { $('#keyword-error').textContent = '最多设置 50 个关键词，请减少一些。'; return; }
        app.store.update(data => { data.preferences.excludedKeywords = words; }, 'preferences');
        $('#keyword-error').textContent = ''; toast('不想吃的关键词已保存');
    });
    on(root, 'click', '[data-restore-food]', (_, button) => { app.store.update(data => { data.preferences.excludedIds = data.preferences.excludedIds.filter(id => id !== button.dataset.restoreFood); }, 'preferences'); toast('这道菜重新参与推荐了'); });
    on(root, 'click', '[data-accent]', (_, button) => app.store.update(data => { data.settings.accent = button.dataset.accent; }, 'settings'));
    $('#theme-mode').addEventListener('change', event => app.store.update(data => { data.settings.theme = event.target.value; }, 'settings'));
    $('#settings-sound').addEventListener('change', event => app.store.update(data => { data.settings.sound = event.target.checked; }, 'settings'));
    $('#enable-shake').addEventListener('click', async event => {
        const button = event.currentTarget;
        if (stopShake) { stopShake(); stopShake = null; button.textContent = '开启摇一摇'; toast('摇一摇已关闭'); return; }
        button.disabled = true;
        try { stopShake = await enableShake(() => { if (app.ui.route === 'wheel') app.features.wheel.spin(); }); button.textContent = '关闭摇一摇'; toast('已开启，返回转盘后摇动手机即可抽取'); }
        catch (error) { toast(error.message); }
        finally { button.disabled = false; }
    });
    $('#export-backup').addEventListener('click', () => { downloadFile(createBackup(app.store.get()), `今天吃什么-备份-${new Date().toISOString().slice(0, 10)}.json`); toast('完整备份已导出'); });
    $('#backup-file').addEventListener('change', async event => {
        const sequence = ++fileSequence, file = event.target.files[0];
        imported = null; $('#backup-preview').hidden = true; $('#restore-backup').hidden = true; $('#backup-error').textContent = '';
        if (!file) return;
        try {
            if (file.size > LIMITS.fileBytes) throw new Error('备份文件不能超过 2 MB');
            const data = parseBackup(await file.text());
            if (sequence !== fileSequence) return;
            imported = data;
            $('#backup-preview').textContent = `文件已检查：${data.favorites.length} 项收藏、${data.history.length} 条记录、${Object.keys(data.plan).length} 天计划、${(data.menuOverride ?? data.customFoods).length} 道自定义菜品。点击确认后替换当前数据。`;
            $('#backup-preview').hidden = false; $('#restore-backup').hidden = false;
        } catch (error) { if (sequence === fileSequence) $('#backup-error').textContent = error.message; }
    });
    $('#restore-backup').addEventListener('click', () => {
        if (!imported) return;
        try {
            app.store.replace(imported, 'restore'); imported = null;
            $('#backup-file').value = ''; $('#backup-preview').hidden = true; $('#restore-backup').hidden = true;
            toast('备份已恢复，所有功能已同步更新');
        } catch (error) { $('#backup-error').textContent = error.message; }
    });
    return { render };
}
