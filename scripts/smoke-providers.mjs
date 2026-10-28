import { nearbyPlaces, weatherAt } from '../server/providers.js';

// Explicit, optional network smoke check at a public test coordinate in Beijing.
// No browser geolocation or personal data is used. Never prints the credential.
const coordinates = { lat: 39.9042, lon: 116.4074 };
if (!process.env.AMAP_KEY) {
    console.error('AMAP_KEY is not configured. Copy .env.example to .env and configure the service first.');
    process.exitCode = 1;
} else {
    const results = await Promise.allSettled([
        nearbyPlaces({ ...coordinates, level: 1, amapKey: process.env.AMAP_KEY, signal: AbortSignal.timeout(25000) }),
        weatherAt({ ...coordinates, signal: AbortSignal.timeout(10000) }),
    ]);
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') console.log(i === 0 ? `Map provider OK: ${result.value.places.length} restaurants; partial=${result.value.partial}` : `Weather provider OK: ${result.value.tempC} C`);
        else { console.error(`${i === 0 ? 'Map' : 'Weather'} provider unavailable: ${result.reason.message}`); process.exitCode = 1; }
    }
}
