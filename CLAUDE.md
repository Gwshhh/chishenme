# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"今天吃什么" (What to Eat Today) is a single-page web application that helps users decide what to eat through a spinning wheel interface. It's a pure frontend app with no build process—just open `index.html` in a browser.

## Architecture

### Core Files
- **index.html** - Single page with all UI elements (tabs, wheel, lists, forms)
- **app.js** - Main application logic (~1700 lines)
- **data.js** - Food database (~91 items, organized by Meituan-style delivery channels; one retired slot) and configuration
- **styles.css** - All styling, design-token based: colors/shadows/radii are CSS variables on `:root`; dark mode only re-defines those tokens on `body.dark-mode`
- **images_food/** - Real finished-dish photos downloaded from Wikipedia by `fetch_real_images.py`. The image fallback is an inline SVG name card generated at runtime (`makeNameCard()` in data.js) — the old `images_new/` directory no longer exists

### Application State
Global `state` object in `app.js` manages:
- Current tab selection
- Category filters for wheel
- Favorites (persisted to localStorage)
- History (persisted to localStorage)
- Spinning animation state

### Key Components

**1. Wheel Drawing (Canvas)**
- `drawWheel(rotation)` renders the wheel at a specific rotation angle
- The full wheel (dark rim, light dots, sectors, labels, shading) is pre-rendered ONCE into an offscreen canvas by `buildWheelCache()`; each animation frame only clears, rotates and blits that bitmap, then `drawWheelHub()` draws the static center button. Cache key = food-name list + devicePixelRatio
- Canvas backing store is `300 × devicePixelRatio` px for crisp mobile rendering; sector labels are skipped above 80 sectors and separator lines above 60 (nearby mode can have 360 stores)
- **Critical**: Must use integer number of spins to ensure pointer alignment
- Color array `wheelColors` in data.js provides sector colors (16 curated mid-tone colors, all readable with white text — do not add light/pastel colors)

**2. Spin Animation**
- `spinWheel()` calculates target rotation using: `finalRotation = spins * 2π + (2π - targetAngle)`
- `spins` MUST be an integer (not float) or pointer won't align with result
- Animation uses cubic ease-out: `1 - (1-progress)³`
- **Bug fix history**: Previous version used float spins causing misalignment

**3. Tab System**
- Four tabs: wheel, list, favorites, history
- `switchTab(tabName)` toggles visibility and updates state
- Each tab has its own init function called on DOMContentLoaded

**4. Data Structure**
Each food item in `foodData`:
```javascript
{
    name: "黄焖鸡米饭",
    category: "中式快餐",
    description: "鸡肉软烂，汤汁浓郁"
    // image (real photo URL) + imageFallback (local card) are assigned automatically
    // from KEYWORDS and IMAGE_ORDER — see "Image strategy" below
}
```

## Development Commands

**No build process required** - this is vanilla HTML/CSS/JS.

**To run:**
```bash
# Windows
start index.html

# Mac/Linux
open index.html
```

**To regenerate food images:**
```bash
python generate_images.py
```
This creates 65 labeled placeholder images in `images_new/` directory. Each image displays the food name in Chinese on a colored background using PIL/Pillow.

## Critical Implementation Details

### Nearby Food / Location (附近美食)
`initNearby()` in `app.js` powers the location card on the wheel tab. Important constraint: this is a static frontend with **no backend and no Meituan API access** — Meituan does not expose a public, CORS-enabled "restaurants by coordinates" endpoint, so the app CANNOT pull Meituan's store list into this page. Do not attempt to scrape or proxy it. Instead the flow is: browser Geolocation → reverse-geocode the city/district via OpenStreetMap Nominatim (keyless, CORS-OK, best-effort with a 6s AbortController timeout) → display it → open Meituan外卖's "附近" H5 (`i.waimai.meituan.com` on mobile, `waimai.meituan.com` on desktop) where Meituan's own geolocation lists nearby stores. `openDelivery()` and `openNearbyMeituan()` pick mobile vs desktop URLs via `isMobile()`. Location is cached in `localStorage['location']` to avoid re-prompting. Geolocation requires HTTPS or localhost — under `file://` it's disabled, and the code shows a hint instead of failing silently. GPS returns WGS-84; we never feed raw coordinates to Chinese map services (which expect GCJ-02), sidestepping the coordinate-offset problem entirely.

### Wheel Pointer Alignment
The pointer is fixed at top center (angle = -π/2). To ensure accurate results:
1. Calculate target angle: `selectedIndex * arcAngle + arcAngle/2`
2. Calculate rotation: `spins * 2π + (2π - targetAngle)` where `spins = Math.floor(5 + Math.random() * 4)`
3. **Never use float for spins** - causes pointer to land between sectors

### Canvas Clearing
Must reset transform before clearing:
```javascript
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.clearRect(0, 0, canvas.width, canvas.height);
```
Otherwise, rotated coordinate system causes ghosting artifacts.

### Mobile Shake Detection
`initShakeDetection()` uses DeviceMotion API:
- Requires HTTPS or localhost
- Speed threshold: 3000 (tuned to avoid false triggers)
- Only triggers when on wheel tab and not already spinning

## Data Management

**Adding new foods:**
1. Add an entry `{ name, category, description }` to `foodData` in `data.js` (do NOT set `image` — it is assigned automatically)
2. Append the same `name` to `IMAGE_ORDER` (in `data.js`), to `ORDER` in `fetch_real_images.py`, and to the `foods` list in `generate_images.py` — all three MUST stay in the SAME order (the order decides the `food_XX.jpg` number)
3. Add a `TITLES[name]` entry in `fetch_real_images.py` mapping the dish to a Wikipedia article title whose lead image is the finished dish (use a concrete dish title for brand/chain names, or `None` to skip)
4. Run `python fetch_real_images.py` (downloads the real photo) and `python generate_images.py` (regenerates the fallback label card)

**Image strategy (real photos + one-to-one + never broken):** Each food gets `image = images_food/food_XX.jpg` (a real finished-dish photo downloaded from the dish's Wikipedia lead image by `fetch_real_images.py`) and `imageFallback = <inline SVG data URI>` (a zero-network name card generated by `makeNameCard()` in data.js). `XX` is the food's `IMAGE_ORDER` index + 1, shared with the Python scripts. Rendering is progressive: `<img src>` starts as the SVG card (instant, never blank), the real photo URL sits in `data-real` and `hydrateImages()` preloads it in the background with an 8s timeout, swapping it in only on success — so slow/blocked networks still always show a labeled card, and nothing is ever mismatched. Brand/chain dish names (海底捞…) are mapped to generic dish titles in `TITLES` to avoid pulling storefront/logo images. (`generate_images.py` and the `images_new/` cards it produced are legacy — no longer referenced by the app.)

**Categories are auto-generated** from unique category values in foodData.

## localStorage Schema

**Favorites:** Array of food objects (same structure as foodData)
**History:** Array of food objects with added `timestamp` property (Date.now())

Both are serialized JSON strings under keys 'favorites' and 'history'.

## Image Generation

The `generate_images.py` script:
- Requires PIL/Pillow
- Creates 400×300 px images with food names
- Uses Windows Chinese font: `C:/Windows/Fonts/msyh.ttc`
- Each food gets unique background color from predefined list
- Images are labeled placeholder cards, not actual food photos (intentional design after real photos proved unreliable)
