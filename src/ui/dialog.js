import { $, escapeHtml, on } from './dom.js';
import { icon } from './icons.js';

// Native dialogs handle focus containment, Escape, inert background and return focus.
export function createDialog() {
    const element = $('#app-dialog');
    let cleanup;
    let generation = 0;
    let opener;
    let openerSelector = '';
    const close = () => { if (element.open) element.close(); };
    element.addEventListener('close', () => {
        if (element.open) return;
        cleanup?.(); cleanup = null;
        if (document.activeElement === document.body || element.contains(document.activeElement)) {
            const target = opener?.isConnected ? opener : openerSelector ? document.querySelector(openerSelector) : null;
            if (target?.getClientRects().length) target.focus({ preventScroll: true });
        }
    });
    element.addEventListener('click', event => { if (event.target === element) { const box = element.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } });
    on(element, 'click', '[data-dialog-close]', close);
    return {
        element, close,
        get generation() { return generation; },
        open({ title, content, className = '', onMount }) {
            generation++;
            if (!element.open) {
                opener = document.activeElement;
                const identity = [...opener.attributes].filter(item => item.name === 'id' || item.name.startsWith('data-'));
                openerSelector = identity.length ? opener.tagName.toLowerCase() + identity.map(item => `[${item.name}="${CSS.escape(item.value)}"]`).join('') : '';
            }
            cleanup?.(); cleanup = null;
            element.className = `dialog ${className}`;
            element.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${escapeHtml(title)}</h2><button type="button" class="icon-btn" data-dialog-close aria-label="关闭弹窗">${icon('close')}</button></div><div class="dialog-content">${content}</div>`;
            if (!element.open) element.showModal();
            cleanup = onMount?.($('.dialog-content', element));
            element.scrollTop = 0;
            const focusTarget = $('[autofocus]', element) || $('[data-dialog-close]', element);
            focusTarget?.focus({ preventScroll: true });
            return generation;
        },
        confirm({ title, description, confirmText = '确认', danger = false, onConfirm }) {
            this.open({ title, content: `<p>${escapeHtml(description)}</p><div class="dialog-actions"><button class="button secondary" data-dialog-close>取消</button><button class="button ${danger ? 'danger' : 'primary'}" id="confirm-action">${escapeHtml(confirmText)}</button></div>`, onMount(root) {
                $('#confirm-action', root).addEventListener('click', () => { close(); onConfirm(); });
            } });
        },
    };
}
