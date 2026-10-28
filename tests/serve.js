import http from 'node:http';
import { createApp } from '../server/app.js';
// Test service deliberately does not load .env or contact real providers.
const app = createApp();
const server = http.createServer((req, res) => {
    if (req.url.startsWith('/chishenme/')) {
        req.url = req.url.slice('/chishenme'.length);
        if (req.url === '/runtime-config.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"apiBase":""}'); return; }
    }
    return app(req, res);
});
server.listen(4174, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
