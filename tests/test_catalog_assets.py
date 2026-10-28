import tempfile
from pathlib import Path
import unittest

from scripts.catalog_assets import load_image_order


class CatalogAssetsTest(unittest.TestCase):
    def test_current_catalog_keeps_retired_slot_and_existing_image_alignment(self):
        order = load_image_order()
        self.assertEqual(len(order), 92)
        self.assertEqual(order[0], "黄焖鸡米饭")
        self.assertEqual(order[22], "呷哺呷哺")
        self.assertEqual(order[-1], "手抓饼")

    def test_comments_trailing_comma_and_duplicate_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "data.js"
            source.write_text('export const IMAGE_ORDER = ["rice", // comment\n"noodle",];', encoding="utf-8")
            self.assertEqual(load_image_order(source), ["rice", "noodle"])
            source.write_text('export const IMAGE_ORDER = ["rice", "rice"];', encoding="utf-8")
            with self.assertRaises(ValueError):
                load_image_order(source)


if __name__ == "__main__":
    unittest.main()
