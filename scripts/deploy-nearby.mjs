import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNearbyApi } from './verify-deployment.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const wranglerPackage = require.resolve('wrangler/package.json');
const wranglerInfo = JSON.parse(await readFile(wranglerPackage, 'utf8'));
const wrangler = join(dirname(wranglerPackage), typeof wranglerInfo.bin === 'string' ? wranglerInfo.bin : wranglerInfo.bin.wrangler);
const amapKey = process.env.AMAP_KEY || '';
const redact = value => amapKey ? value.replaceAll(amapKey, '[redacted]') : value;

async function run(args) {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const cancel = () => child.kill();
    process.once('SIGINT', cancel);
    try {
        const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
        const safe = redact(output);
        process.stdout.write(safe);
        if (code !== 0) throw new Error('Wrangler 未完成部署；请先确认 Cloudflare 登录有效。');
        return safe;
    } finally { process.removeListener('SIGINT', cancel); }
}

try {
    if (process.argv.includes('--dry-run')) {
        await run(['deploy', '--dry-run', '--outdir', '.wrangler/dry-run']);
    } else {
        if (!amapKey.trim()) throw new Error('本地未配置 AMAP_KEY，无法启用附近店铺。');
        const temporaryRoot = join(root, '.wrangler');
        await mkdir(temporaryRoot, { recursive: true });
        const directory = await mkdtemp(join(temporaryRoot, 'nearby-secrets-'));
        const secretFile = join(directory, 'secrets.json');
        let output;
        try {
            // Upload only this app's map credential, never the whole local .env.
            await writeFile(secretFile, JSON.stringify({ AMAP_KEY: amapKey }), { mode: 0o600, flag: 'wx' });
            output = await run(['deploy', '--secrets-file', secretFile]);
        } finally {
            await unlink(secretFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
            await rmdir(directory);
        }
        const endpoint = output.match(/https:\/\/chishenme-api\.[a-z0-9-]+\.workers\.dev\b/i)?.[0];
        if (!endpoint) throw new Error('接口已上传，但未取得公开地址；线上配置保持原值。');
        const apiBase = endpoint + '/api/';
        const report = await verifyNearbyApi(apiBase);
        // Switch the static frontend only after the real deployed API has passed.
        await writeFile(join(root, 'runtime-config.json'), JSON.stringify({ apiBase }, null, 2) + '\n');
        console.log(JSON.stringify({ ...report, runtimeConfigUpdated: true }, null, 2));
    }
} catch (error) {
    console.error(redact(error.message));
    process.exitCode = 1;
}
