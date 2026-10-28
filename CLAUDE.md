# Project guidance

“今天吃什么” is a Chinese food decision and weekly meal planning app. The frontend uses native ES modules with no bundler. An optional Node standard-library server provides safe static hosting and map/weather APIs. Read README.md for setup and docs/architecture.md for the module map.

## Commands

- `npm start`: local app and API at http://127.0.0.1:4173; Node 22.9+.
- `npm run dev`: watch server sources and disable this app's Service Worker to expose frontend edits after reload.
- `npm ci`: install test-only dependencies.
- `npm run check`: JavaScript syntax, offline manifest, version agreement and photo references.
- `npm test`: core logic and real local HTTP tests with mocked external providers.
- `npm run test:browser`: desktop and mobile Chromium/Edge flows, accessibility and offline behavior. Uses isolated server port 4174 with no real key.
- `python -m unittest discover -s tests -p "test_*.py"`: shared image-slot reader tests.
- `npm run smoke:providers`: optional real map/weather network test using a public fixed coordinate and local `.env`; never run as part of ordinary tests.

## Architecture boundaries

- `app.js` assembles features, routes hash navigation, and owns ephemeral UI state. It is not a home for new domain logic.
- `src/core/` owns pure catalog/model/selection/backup rules and the storage adapter.
- `src/features/` owns feature views and bindings; shared cards/dialogs/icons live in `src/ui/`.
- `src/services/` isolates browser APIs, remote requests, delivery links, sharing, motion permission and PWA.
- `server/` owns HTTP/provider work. Never place `AMAP_KEY` in a browser file, browser storage, logs or a share/backup file.
- `data.js` contains food data and the one stable image order; Python asset scripts read it through `scripts/catalog_assets.py`.
- `DESIGN.md` and `.impeccable/design.json` describe the shipped visual system; avoid reverting to fixed 600px desktop layout or duplicating style tokens.

## Data invariants

Use `store.update` / `store.replace`, not direct localStorage writes or mutation of store snapshots. New data is a single versioned object under `chishenme:state:v1`; old keys stay intact for compatibility. Validate imports completely before changing data. Surface storage errors while retaining usable in-session state.

Food identity is stable and snapshots allow deleted foods to remain meaningful in history/plans. Update the active replacement menu while replacement mode is enabled. Export the actual current menu, not only appended custom items.

One preference filter governs all automatic decisions. Unknown food labels cannot pass strict no-spicy or vegetarian preferences. Do not weaken preferences to fill a result. Automatic plans exclude standalone built-in dessert/drink items, preserve locked/eaten meals, and use local calendar dates. Selection and actual consumption are separate history states.

## UI and network invariants

- Preserve a copied wheel candidate board throughout each draw. Integer turns plus the selected sector midpoint must land at the pointer. Tests include 360 source candidates.
- No inline event handlers or unescaped user-controlled HTML. Use shared rendering helpers and native controls.
- Keep keyboard focus when replacing controls or closing dialogs; guard asynchronous dialog content using its generation.
- Location and DeviceMotion permissions are only requested by explicit actions. Cancelled/stale requests must not update the active source.
- Pictures prioritize supplied photos, try alternate originals, then labeled real-food references matched to a clear dish/brand/category. Use the name card only if no suitable photo loads; never store references as actual shop photos. Keep viewport-based loading and bounded preload concurrency.
- Map data is not a guarantee of delivery-platform availability. HTTPS platform links are explicit navigation, never fake ordering or automatic coupon claims.
- Fixed provider hosts, parameter validation, timeouts, rate limits and public-file allowlists must remain.

## Release checks

Before a release, update the package version, `APP_VERSION` in `src/core/model.js`, version in `sw-assets.js`, and entry script/stylesheet query versions in `index.html`. Add every new browser module to `APP_ASSETS`; run the documented checks. The Service Worker preserves a coherent versioned shell and only deletes this app path's caches. Do not revert to deleting every same-origin cache.

Static hosting uses relative asset paths, including a GitHub Pages project subdirectory. Separate APIs use a public `config.js` URL and exact server `ALLOWED_ORIGIN`. `.env` and local TLS keys remain ignored. Local work does not automatically publish or push changes.
