(() => {
    try {
        const stored = JSON.parse(localStorage.getItem('chishenme:state:v1') || 'null');
        const theme = stored?.settings?.theme || localStorage.getItem('theme') || 'system';
        const accent = stored?.settings?.accent || localStorage.getItem('colorTheme') || 'sunset';
        document.documentElement.dataset.mode = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        if (['sunset', 'celadon', 'indigo', 'violet', 'amber', 'rose'].includes(accent)) document.documentElement.dataset.accent = accent;
    } catch { /* Browser storage is optional. */ }
})();
