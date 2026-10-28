# -*- coding: utf-8 -*-
"""Export every app icon from assets/brand/app-icon-master.svg.

Run: python gen_icon.py
Build dependencies: Pillow, npm ci, and a Playwright browser (Edge on Windows).
PNG app icons are opaque and full bleed; the OS supplies its own corner mask.
SVG / ICO / favicon PNG use the same artwork with browser-friendly corners.
No image-generation API or production dependency is needed.
"""
import base64
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "assets/brand/app-icon-master.svg"


def decoded_image(data):
    return Image.open(io.BytesIO(base64.b64decode(data))).convert("RGBA")


def main():
    try:
        result = subprocess.run(
            ["node", "scripts/render-icon.mjs"], cwd=ROOT, check=True,
            capture_output=True, text=True, encoding="utf-8",
        )
    except subprocess.CalledProcessError as error:
        sys.stderr.write(error.stderr or str(error))
        raise SystemExit(error.returncode) from error
    rendered = json.loads(result.stdout)
    native = decoded_image(rendered["native"])
    rounded = decoded_image(rendered["rounded"])
    foreground = decoded_image(rendered["foreground"])
    assert native.getchannel("A").getextrema() == (255, 255), "App icons must be opaque"
    # All essential foreground pixels must fit the central 80% safe-area circle.
    alpha = foreground.getchannel("A")
    for y in range(1024):
        for x in range(1024):
            if alpha.getpixel((x, y)) >= 128:
                assert (x - 511.5) ** 2 + (y - 511.5) ** 2 <= 409.6 ** 2, "Artwork exceeds maskable safe area"
    source = SOURCE.read_text(encoding="utf-8")
    browser_svg = source.replace('width="1024" height="1024"', 'width="512" height="512"', 1)
    browser_svg = browser_svg.replace('id="tile-shape" width="512" height="512" rx="0"', 'id="tile-shape" width="512" height="512" rx="112"')
    (ROOT / "icon.svg").write_text(browser_svg, encoding="utf-8", newline="\n")
    for size, name in [
        (1024, "icon-1024.png"), (512, "icon-512.png"),
        (192, "icon-192.png"), (180, "apple-touch-icon.png"),
    ]:
        output = native.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
        if size < 1024:
            output = output.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        output.save(ROOT / name, optimize=True)
        print(f"OK {name}: {size} x {size}, opaque, {(ROOT / name).stat().st_size:,} bytes")
    rounded.resize((32, 32), Image.Resampling.LANCZOS).save(ROOT / "favicon-32.png", optimize=True)
    rounded.save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("OK icon.svg, favicon-32.png, favicon.ico (16 / 32 / 48)")
    print("PASS: foreground fits Android maskable safe area; all native icons are opaque")


if __name__ == "__main__":
    main()
