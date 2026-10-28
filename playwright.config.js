import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    timeout: 30000,
    expect: { timeout: 5000 },
    fullyParallel: false,
    workers: 2,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:4174',
        channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
        headless: true,
        timezoneId: 'Asia/Shanghai',
        locale: 'zh-CN',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'desktop', use: { viewport: { width: 1365, height: 900 } } },
        { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', browserName: 'chromium' } },
    ],
    webServer: { command: 'node tests/serve.js', url: 'http://127.0.0.1:4174/api/health', reuseExistingServer: false, timeout: 10000 },
});
