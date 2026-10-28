"""Read the shared image slots without executing JavaScript or duplicating food names."""
import json
from pathlib import Path
import re


def load_image_order(source_path=None):
    source_path = Path(source_path) if source_path else Path(__file__).resolve().parents[1] / "data.js"
    source = source_path.read_text(encoding="utf-8-sig")
    match = re.search(r"(?:export\s+)?const\s+IMAGE_ORDER\s*=\s*(\[[\s\S]*?\]);", source)
    if not match:
        raise ValueError("IMAGE_ORDER was not found in data.js")
    value = re.sub(r"//[^\n]*", "", match.group(1))
    order = json.loads(re.sub(r",\s*]", "]", value))
    if not isinstance(order, list) or not order or any(not isinstance(name, str) or not name.strip() for name in order):
        raise ValueError("IMAGE_ORDER must be a nonempty list of food names")
    if len(order) != len(set(order)):
        raise ValueError("IMAGE_ORDER contains duplicate food names")
    return order
