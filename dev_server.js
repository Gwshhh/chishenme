// Compatibility entry for the original local HTTPS command.
// Production and ordinary local use: npm start. Live development: npm run dev.
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
process.env.PORT = process.env.DEV_HTTPS_PORT || '8443';
process.env.HOST ||= '127.0.0.1';
process.env.HTTPS_KEY ||= '_dev_key.pem';
process.env.HTTPS_CERT ||= '_dev_cert.pem';
await import('./server/index.js');