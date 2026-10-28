"""Build the committed, same-origin food thumbnails (requires Pillow with WebP).

The original JPEGs stay intact for backups, shares and image-error recovery.
Run from any directory: python scripts/optimize_images.py
"""

import json
from pathlib import Path

from PIL import Image, ImageOps, features

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "images_food"
OUTPUT = SOURCE / "optimized"
WIDTHS = ((160, 74), (480, 79), (960, 81))


def main():
    if not features.check("webp"):
        raise SystemExit("Pillow needs WebP support to build the food assets.")
    OUTPUT.mkdir(exist_ok=True)
    originals = sorted(SOURCE.glob("food_*.jpg"))
    sizes = {str(width): 0 for width, _ in WIDTHS}
    for source in originals:
        with Image.open(source) as raw:
            photo = ImageOps.exif_transpose(raw).convert("RGB")
            for width, quality in WIDTHS:
                # The UI already crops food to a centered photo window. Baking
                # that crop avoids transferring/decompressing hidden pixels.
                resized = ImageOps.fit(photo, (width, width * 3 // 4), Image.Resampling.LANCZOS)
                target = OUTPUT / f"{source.stem}-{width}.webp"
                resized.save(target, "WEBP", quality=quality, method=6)
                sizes[str(width)] += target.stat().st_size
    report = {
        "count": len(originals),
        "originalBytes": sum(p.stat().st_size for p in originals),
        "variantBytes": sizes,
        "format": "WebP",
        "crop": "centered 4:3",
        "widths": [width for width, _ in WIDTHS],
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
