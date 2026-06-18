from PIL import Image, ImageDraw, ImageFont
import os
import sys

# Windows 控制台默认 GBK，输出 ✓ 等字符会崩溃；强制 UTF-8 输出
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# 美食列表
foods = [
    ("黄焖鸡米饭", "#FF6B6B"),
    ("兰州拉面", "#4ECDC4"),
    ("重庆小面", "#45B7D1"),
    ("麻辣烫", "#FFA07A"),
    ("麻辣香锅", "#98D8C8"),
    ("沙县小吃", "#F7DC6F"),
    ("盖浇饭", "#BB8FCE"),
    ("扬州炒饭", "#85C1E2"),
    ("煲仔饭", "#F8B88B"),
    ("东北饺子", "#FAD390"),
    ("云吞面", "#6C5CE7"),
    ("刀削面", "#A29BFE"),
    ("热干面", "#FD79A8"),
    ("酸辣粉", "#FDCB6E"),
    ("烤鱼", "#E17055"),
    ("水煮鱼", "#74B9FF"),
    ("红烧肉", "#55EFC4"),
    ("宫保鸡丁", "#DFE6E9"),
    ("回锅肉", "#FF7675"),
    ("鱼香肉丝", "#6C5CE7"),
    ("重庆火锅", "#FF6B6B"),
    ("海底捞", "#FF6B6B"),
    ("呷哺呷哺", "#FF6B6B"),
    ("潮汕牛肉火锅", "#FF6B6B"),
    ("烧烤", "#E17055"),
    ("羊肉串", "#E17055"),
    ("烤鸡翅", "#E17055"),
    ("烤茄子", "#E17055"),
    ("牛排", "#8B4513"),
    ("意大利面", "#FFD700"),
    ("披萨", "#FF6347"),
    ("汉堡", "#FFA500"),
    ("炸鸡", "#FFD700"),
    ("薯条", "#FFD700"),
    ("寿司", "#FF69B4"),
    ("拉面", "#F5DEB3"),
    ("天妇罗", "#FFE4B5"),
    ("烤肉", "#8B4513"),
    ("石锅拌饭", "#FF6347"),
    ("韩式炸鸡", "#FFD700"),
    ("部队锅", "#FF6347"),
    ("早茶", "#F5DEB3"),
    ("虾饺", "#FFB6C1"),
    ("烧鹅", "#8B4513"),
    ("白切鸡", "#F5DEB3"),
    ("肠粉", "#FFF8DC"),
    ("奶茶", "#D2691E"),
    ("咖啡", "#8B4513"),
    ("鲜榨果汁", "#FF8C00"),
    ("蛋糕", "#FFB6C1"),
    ("冰淇淋", "#FFE4E1"),
    ("双皮奶", "#FFF8DC"),
    ("杨枝甘露", "#FF8C00"),
    ("肉夹馍", "#D2691E"),
    ("凉皮", "#F5F5DC"),
    ("煎饼果子", "#FFD700"),
    ("生煎包", "#F5DEB3"),
    ("小笼包", "#FFF8DC"),
    ("糖葫芦", "#FF0000"),
    ("臭豆腐", "#8B4513"),
    ("章鱼小丸子", "#FFB6C1"),
    ("沙拉", "#90EE90"),
    ("三明治", "#F5DEB3"),
    ("健身餐", "#90EE90"),
    ("粥品", "#FFF8DC"),
    # 新增菜品（槽位 66-77），顺序需与 data.js 的 IMAGE_ORDER 一致
    ("螺蛳粉", "#F8B88B"),
    ("羊肉泡馍", "#FAD390"),
    ("酸菜鱼", "#85C1E2"),
    ("麻婆豆腐", "#FF6B6B"),
    ("北京烤鸭", "#D2691E"),
    ("大盘鸡", "#E17055"),
    ("蛋挞", "#FFD700"),
    ("春卷", "#FFA500"),
    ("提拉米苏", "#8B4513"),
    ("冬阴功", "#FF6347"),
    ("越南河粉", "#74B9FF"),
    ("寿喜烧", "#FF7675"),
    # 第三批新增（槽位 78-92），顺序需与 data.js 的 IMAGE_ORDER 一致
    ("卤肉饭", "#D2691E"),
    ("照烧鸡饭", "#E17055"),
    ("炒面", "#FAD390"),
    ("过桥米线", "#85C1E2"),
    ("干炒牛河", "#A29BFE"),
    ("冒菜", "#FF6B6B"),
    ("鸡蛋灌饼", "#F7DC6F"),
    ("梅菜扣肉", "#8B4513"),
    ("鸡公煲", "#E17055"),
    ("小龙虾", "#FF4757"),
    ("蛋包饭", "#FFD700"),
    ("咖喱饭", "#FFA500"),
    ("烤冷面", "#FD79A8"),
    ("关东煮", "#74B9FF"),
    ("手抓饼", "#FAD390"),
]

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
