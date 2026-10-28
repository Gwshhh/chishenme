from PIL import Image, ImageDraw, ImageFont
import os
import sys

# Windows 控制台默认 GBK，输出 ✓ 等字符会崩溃；强制 UTF-8 输出
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# 美食列表
from scripts.catalog_assets import load_image_order

PALETTE = ['#8b4936', '#426357', '#536578', '#795e40', '#7b4e64', '#5e6647']
foods = [(name, PALETTE[index % len(PALETTE)]) for index, name in enumerate(load_image_order())]

# 创建图片目录
os.makedirs("images_new", exist_ok=True)

print("正在生成美食占位图...")

for idx, (name, color) in enumerate(foods):
    # 创建 400x300 的图片
    img = Image.new('RGB', (400, 300), color)
    draw = ImageDraw.Draw(img)
    
    # 尝试使用中文字体，如果失败则使用默认字体
    try:
        # Windows 中文字体
        font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 40)
        font_small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 20)
    except:
        font = ImageFont.load_default()
        font_small = ImageFont.load_default()
    
    # 绘制美食名称（居中）
    bbox = draw.textbbox((0, 0), name, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (400 - text_width) / 2
    y = (300 - text_height) / 2
    
    # 添加半透明背景
    draw.rectangle([x-10, y-10, x+text_width+10, y+text_height+10], fill=(0,0,0,128))
    draw.text((x, y), name, fill='white', font=font)
    
    # 添加提示文字
    hint = "🍜 美食图片"
    bbox2 = draw.textbbox((0, 0), hint, font=font_small)
    hint_width = bbox2[2] - bbox2[0]
    draw.text(((400-hint_width)/2, y+60), hint, fill='white', font=font_small)
    
    # 保存
    filename = f"images_new/food_{idx+1:02d}.jpg"
    img.save(filename, quality=85)
    
    if (idx + 1) % 10 == 0:
        print(f"已生成 {idx+1}/{len(foods)} 张图片")

print(f"\n✓ 完成！共生成 {len(foods)} 张图片")
print("图片保存在 images_new/ 目录")
