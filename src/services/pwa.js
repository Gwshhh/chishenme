import { $, toast } from '../ui/dom.js';

export async function initPwa(api) {
    let installEvent, registration, applying = false;
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installEvent = event; $('#install-btn').hidden = false; });
    $('#install-btn').addEventListener('click', async () => {
        if (!installEvent) return;
        await installEvent.prompt(); const choice = await installEvent.userChoice;
        if (choice.outcome === 'accepted') toast('已添加到桌面');
        installEvent = null; $('#install-btn').hidden = true;
    });
    window.addEventListener('appinstalled', () => { $('#install-btn').hidden = true; });
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    await api?.ready;
    if (api?.development) {
        const scope = new URL('../../', import.meta.url).href;
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.filter(item => item.scope === scope).map(item => item.unregister()));
        if (navigator.serviceWorker.controller && registrations.some(item => item.scope === scope)) location.reload();
        return;
    }
    $('#update-btn').addEventListener('click', () => { if (registration?.waiting) { applying = true; registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' }); } });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (applying) location.reload(); });
    try {
        registration = await navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url), { updateViaCache: 'none' });
        if (registration.waiting) $('#update-btn').hidden = false;
        registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) $('#update-btn').hidden = false; });
        });
    } catch { /* Non-PWA environments still get the complete local application. */ }
}
