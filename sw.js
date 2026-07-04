// Service Worker：让应用可安装、可离线。
// 策略：核心文件(HTML/CSS/JS)网络优先(保证代码永远最新，断网才用缓存兜底)；
//       菜品图片缓存优先(加载过一次就离线可用)。
const CACHE = 'chishenme-v23';
const CORE = [
    './',
    './index.html',
    './styles.css?v=23',
    './app.js?v=23',
    './data.js?v=23',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== location.origin) return;   // 跨域(高德/天气等)不掺和

    // 菜品图片：缓存优先，首次取回即存
    if (url.pathname.includes('/images_food/')) {
        e.respondWith(
            caches.match(req).then(hit => hit || fetch(req).then(resp => {
                if (resp.ok) {
                    const copy = resp.clone();
                    caches.open(CACHE).then(c => c.put(req, copy));
                }
                return resp;
            }))
        );
        return;
    }

    // 核心资源与页面：网络优先，失败回退缓存（支持离线打开）
    e.respondWith(
        fetch(req).then(resp => {
            if (resp.ok) {
                const copy = resp.clone();
                caches.open(CACHE).then(c => c.put(req, copy));
            }
            return resp;
        }).catch(() =>
            caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
        )
    );
});
