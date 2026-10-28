import { photoCandidates } from '../core/photos.js';
import { $, copyText, downloadFile, toast } from '../ui/dom.js';

function tryImage(candidate, timeout) {
    return new Promise(resolve => {
        const image = new Image(); image.crossOrigin = 'anonymous';
        image.referrerPolicy = 'no-referrer';
        const finish = success => {
            clearTimeout(timer); image.onload = image.onerror = null;
            if (!success) image.src = 'data:,';
            resolve(success ? { image, candidate } : null);
        };
        const timer = setTimeout(() => finish(false), timeout);
        image.onload = () => finish(true); image.onerror = () => finish(false); image.src = candidate.src;
    });
}

async function loadImage(food) {
    const deadline = Date.now() + 5000;
    for (const candidate of photoCandidates(food)) {
        const local = candidate.src.startsWith('images_food/');
        if (!local && Date.now() >= deadline) continue;
        const result = await tryImage(candidate, local ? 1500 : Math.min(1800, Math.max(150, deadline - Date.now())));
        if (result) return result;
    }
    return null;
}

export async function createShareImage(food) {
    const canvas = document.createElement('canvas'); canvas.width = 750; canvas.height = 900;
    const c = canvas.getContext('2d');
    c.fillStyle = '#fbf7ef'; c.fillRect(0, 0, 750, 900);
    c.fillStyle = '#a64732'; c.font = '600 30px "Microsoft YaHei", sans-serif'; c.fillText('今天吃什么', 54, 72);
    const loaded = await loadImage(food);
    if (loaded) {
        const { image, candidate } = loaded;
        const scale = Math.max(642 / image.width, 430 / image.height);
        c.save(); c.beginPath(); c.roundRect(54, 114, 642, 430, 14); c.clip();
        c.drawImage(image, 54 + (642 - image.width * scale) / 2, 114 + (430 - image.height * scale) / 2, image.width * scale, image.height * scale); c.restore();
        if (candidate.kind === 'reference') {
            c.font = '20px "Microsoft YaHei", sans-serif';
            const width = c.measureText(candidate.label).width + 24;
            c.fillStyle = 'rgba(40,30,23,.85)'; c.fillRect(66, 492, width, 34);
            c.fillStyle = '#fff'; c.fillText(candidate.label, 78, 516);
        }
    } else {
        c.fillStyle = '#e8ddce'; c.fillRect(54, 114, 642, 430);
        c.fillStyle = '#80513e'; c.font = '600 74px "Microsoft YaHei", sans-serif'; c.fillText('这一餐，有着落了。', 82, 352, 585);
    }
    c.fillStyle = '#716358'; c.font = '24px "Microsoft YaHei", sans-serif'; c.fillText('这一餐，我选', 54, 604);
    c.fillStyle = '#2d2824'; c.font = '700 48px "Microsoft YaHei", sans-serif';
    const chars = Array.from(food.name);
    c.fillText(chars.slice(0, 13).join(''), 54, 674, 642);
    if (chars.length > 13) { c.font = '600 28px "Microsoft YaHei", sans-serif'; c.fillText(chars.slice(13, 34).join('') + (chars.length > 34 ? '…' : ''), 54, 722, 642); }
    c.fillStyle = '#716358'; c.font = '24px "Microsoft YaHei", sans-serif'; c.fillText(food.category, 54, 784, 642);
    c.strokeStyle = '#d9cfc2'; c.beginPath(); c.moveTo(54, 818); c.lineTo(696, 818); c.stroke();
    c.font = '21px "Microsoft YaHei", sans-serif'; c.fillText('好好吃每一餐', 54, 860);
    c.textAlign = 'right'; c.fillText(new Date().toLocaleDateString('zh-CN'), 696, 860);
    return new Promise((resolve, reject) => { try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片生成失败')), 'image/png'); } catch { reject(new Error('图片无法导出，请使用文字分享')); } });
}

export async function shareFood(food, dialog) {
    const text = `今天吃什么？这一餐我选「${food.name}」！`;
    const generation = dialog.open({ title: '把好选择分享出去', content: '<p role="status">正在制作分享卡片…</p>' });
    try {
        const blob = await createShareImage(food);
        if (!dialog.element.open || dialog.generation !== generation) return;
        const url = URL.createObjectURL(blob);
        dialog.open({ title: '把好选择分享出去', content: `<img class="share-preview" src="${url}" alt="${food.name.replace(/[&<>"']/g, '')}分享卡片"><div class="dialog-actions"><button class="button secondary" id="copy-share">复制文字</button><button class="button primary" id="save-share">保存图片</button></div>`, onMount(root) {
            $('#copy-share', root).addEventListener('click', () => copyText(text).then(() => toast('分享文字已复制'), error => toast(error.message)));
            $('#save-share', root).addEventListener('click', () => downloadFile(blob, '今天吃什么.png', 'image/png'));
            return () => URL.revokeObjectURL(url);
        } });
    } catch (error) {
        if (!dialog.element.open || dialog.generation !== generation) return;
        toast(error.message);
        dialog.open({ title: '分享这一餐', content: '<p>图片暂时无法生成，可以复制文字分享。</p><button class="button primary" id="copy-share">复制分享文字</button>', onMount(root) { $('#copy-share', root).addEventListener('click', () => copyText(text).then(() => toast('已复制'), failure => toast(failure.message))); } });
    }
}
