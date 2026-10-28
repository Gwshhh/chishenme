import { makeNameCard } from '../core/images.js';
import { safeImage } from '../core/model.js';
import { displayPhotoCandidates } from '../core/photos.js';
import { icon } from './icons.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
export const attr = escapeHtml;
const loadedImages = new Set();
const failedImages = new Map();
const resolvedImages = new Map();
const photoKey = candidates => JSON.stringify(candidates.map(candidate => candidate.src));
const isFailed = src => (failedImages.get(src) || 0) > Date.now();

function initialPhoto(candidates) {
    const remembered = resolvedImages.get(photoKey(candidates));
    if (remembered && !isFailed(remembered.src)) return remembered;
    return candidates.find(candidate => loadedImages.has(candidate.src) && !isFailed(candidate.src))
        || candidates.find(candidate => candidate.src.startsWith('images_food/') && !isFailed(candidate.src));
}

export function foodImage(food, { className = '', eager = false, variant = 'card', sizes, priority = 'auto' } = {}) {
    const candidates = displayPhotoCandidates(food, { variant, sizes }), initial = initialPhoto(candidates);
    const label = initial?.label || '';
    const responsive = initial?.srcset ? ` srcset="${attr(initial.srcset)}" sizes="${attr(initial.sizes)}"` : '';
    const remote = candidates.some(candidate => !candidate.src.startsWith('images_food/'));
    return `<span class="food-photo" data-photo-kind="${initial?.kind || 'placeholder'}"><img class="food-image ${className}" src="${attr(initial?.src || makeNameCard(food.name))}"${responsive} data-photo-candidates="${attr(JSON.stringify(candidates))}" ${remote ? 'data-photo-pending="true"' : ''} data-fallback-name="${attr(food.name)}" alt="${attr(food.name + (label ? `（${label}）` : ''))}" width="400" height="300" loading="${eager ? 'eager' : 'lazy'}" fetchpriority="${priority}" decoding="async" referrerpolicy="no-referrer"><span class="photo-credit" title="${attr(label ? `${label}，不代表该店实际出品` : '')}" aria-hidden="true" ${label ? '' : 'hidden'}>${label ? '参考图' : ''}</span></span>`;
}

export function initImageFallback() {
    const pending = new Map(), queue = [], attempts = new WeakMap();
    let active = 0;
    const pump = () => {
        while (active < 6 && queue.length) { active++; queue.shift()(); }
    };
    const preload = url => {
        if (isFailed(url)) return Promise.resolve(false);
        if (loadedImages.has(url)) return Promise.resolve(true);
        if (!pending.has(url)) {
            const promise = new Promise(resolve => {
                queue.push(() => {
                    const image = new Image();
                    let done = false;
                    const finish = success => {
                        if (done) return; done = true; clearTimeout(timer);
                        image.onload = image.onerror = null;
                        if (success) {
                            loadedImages.add(url); failedImages.delete(url);
                            if (loadedImages.size > 1000) loadedImages.delete(loadedImages.values().next().value);
                        } else {
                            failedImages.set(url, Date.now() + 30000);
                            if (failedImages.size > 500) failedImages.delete(failedImages.keys().next().value);
                            image.src = 'data:,';
                        }
                        resolve(success); active--; pump();
                    };
                    const timer = setTimeout(() => finish(false), 8000);
                    image.referrerPolicy = 'no-referrer';
                    image.onload = () => finish(true); image.onerror = () => finish(false); image.src = url;
                });
            });
            pending.set(url, promise);
            promise.finally(() => pending.delete(url));
            pump();
        }
        return pending.get(url);
    };
    const candidatesFor = image => {
        try {
            const parsed = JSON.parse(image.dataset.photoCandidates || '[]');
            return Array.isArray(parsed) ? parsed.filter(candidate => candidate && safeImage(candidate.src)).slice(0, 12) : [];
        } catch { return []; }
    };
    const applyPhoto = (image, candidate) => {
        const label = candidate?.kind === 'reference' ? candidate.label : '';
        const src = candidate?.src || makeNameCard(image.dataset.fallbackName);
        image.referrerPolicy = 'no-referrer';
        if (candidate?.srcset) {
            image.sizes = candidate.sizes;
            image.srcset = candidate.srcset;
        } else {
            image.removeAttribute('srcset'); image.removeAttribute('sizes');
        }
        if (image.getAttribute('src') !== src) image.src = src;
        image.alt = image.dataset.fallbackName + (label ? `（${label}）` : '');
        const wrapper = image.closest('.food-photo');
        if (wrapper) {
            wrapper.dataset.photoKind = candidate?.kind || 'placeholder';
            const credit = wrapper.querySelector('.photo-credit');
            if (credit) { credit.textContent = label ? '参考图' : ''; credit.hidden = !label; credit.title = label ? `${label}，不代表该店实际出品` : ''; }
        }
    };
    const hydrate = async image => {
        if (image.dataset.loading || !image.isConnected) return;
        const candidates = candidatesFor(image);
        if (!candidates.length) return;
        const token = {};
        attempts.set(image, token);
        delete image.dataset.photoPending;
        image.dataset.loading = 'true';
        try {
            for (const candidate of candidates) {
                if (isFailed(candidate.src)) continue;
                // Let the browser prioritize, lazy-load and decode local
                // responsive images once. Only untrusted remote originals
                // need a background probe before replacing a ready reference.
                if (candidate.src.startsWith('images_food/')) {
                    applyPhoto(image, candidate);
                    return;
                }
                const loaded = await preload(candidate.src);
                if (!image.isConnected || attempts.get(image) !== token) return;
                if (loaded) {
                    resolvedImages.set(photoKey(candidates), candidate);
                    if (resolvedImages.size > 500) resolvedImages.delete(resolvedImages.keys().next().value);
                    applyPhoto(image, candidate);
                    return;
                }
            }
            applyPhoto(image, null);
        } finally { if (attempts.get(image) === token) delete image.dataset.loading; }
    };
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); hydrate(entry.target); }
    }, { rootMargin: '160px' }) : null;
    const observe = root => {
        if (!(root instanceof Element)) return;
        const images = [...(root.matches('img[data-photo-pending]') ? [root] : []), ...root.querySelectorAll('img[data-photo-pending]')];
        for (const image of images) observer ? observer.observe(image) : hydrate(image);
    };
    new MutationObserver(records => {
        for (const record of records) {
            for (const node of record.addedNodes) observe(node);
            if (observer) for (const node of record.removedNodes) {
                if (!(node instanceof Element)) continue;
                if (node.matches('img')) observer.unobserve(node);
                node.querySelectorAll('img').forEach(image => observer.unobserve(image));
            }
        }
    }).observe(document.body, { childList: true, subtree: true });
    observe(document.body);
    window.addEventListener('online', () => {
        failedImages.clear();
        document.querySelectorAll('img[data-photo-candidates]').forEach(image => {
            if (image.closest('.food-photo')?.dataset.photoKind !== 'original') {
                image.dataset.photoPending = 'true';
                observer ? observer.observe(image) : hydrate(image);
            }
        });
    });
    document.addEventListener('error', event => {
        const image = event.target;
        if (image instanceof HTMLImageElement && image.dataset.fallbackName) {
            const src = image.getAttribute('src');
            if (!safeImage(src)) return;
            loadedImages.delete(src); failedImages.set(src, Date.now() + 30000);
            const candidates = candidatesFor(image);
            resolvedImages.delete(photoKey(candidates));
            applyPhoto(image, initialPhoto(candidates));
            hydrate(image);
        }
    }, true);
}

export function syncFavoriteButtons(root, favorites) {
    const ids = new Set(favorites.map(food => food.id));
    root.querySelectorAll('button[data-food-action="favorite"][aria-label]').forEach(button => {
        const selected = ids.has(button.dataset.foodId);
        button.classList.toggle('is-favorite', selected);
        button.setAttribute('aria-pressed', String(selected));
        const name = button.getAttribute('aria-label').replace(/^(取消收藏|收藏)/, '');
        button.setAttribute('aria-label', `${selected ? '取消收藏' : '收藏'}${name}`);
    });
}

let toastTimer;
export function toast(message) {
    const openDialog = $('dialog[open]');
    let target = $('#toast');
    if (openDialog) {
        target = $('.dialog-toast', openDialog);
        if (!target) {
            target = document.createElement('div');
            target.className = 'dialog-toast'; target.setAttribute('role', 'status');
            openDialog.append(target);
        }
    }
    clearTimeout(toastTimer);
    target.textContent = message;
    target.classList.add('visible');
    toastTimer = setTimeout(() => { if (target.classList.contains('dialog-toast')) target.remove(); else target.classList.remove('visible'); }, 3800);
}

export function emptyState(title, description, action = '') {
    return `<div class="empty-state">${icon('bowl')}<h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${action}</div>`;
}

export function setBusy(button, busy, text) {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
    if (text) button.textContent = text;
}

export function on(root, type, selector, handler) {
    root.addEventListener(type, event => {
        const target = event.target.closest?.(selector);
        if (target && root.contains(target)) handler(event, target);
    });
}

export async function copyText(text) {
    if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(text); return; } catch { /* Try a local selection fallback. */ } }
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.top = '-9999px';
    document.body.append(input);
    input.select();
    const success = document.execCommand('copy');
    input.remove();
    if (!success) throw new Error('复制失败，请手动复制');
}

export function downloadFile(content, filename, type = 'application/json') {
    const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function formatDate(timestamp) {
    return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp);
}
