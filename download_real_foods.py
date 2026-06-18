import os
import urllib.request
import time

# 精选的真实中国美食图片URL（来自免费图片库）
# 按照美食大类准备
food_images = {
    # 中式米饭类
    "rice": [
        "https://images.pexels.com/photos/1907244/pexels-photo-1907244.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/1907227/pexels-photo-1907227.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/1907228/pexels-photo-1907228.jpeg?auto=compress&cs=tinysrgb&w=400",
    ],
    # 面条类
    "noodles": [
        "https://images.pexels.com/photos/1410235/pexels-photo-1410235.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/2347311/pexels-photo-2347311.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/2664216/pexels-photo-2664216.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/4518607/pexels-photo-4518607.jpeg?auto=compress&cs=tinysrgb&w=400",
    ],
    # 饺子/小笼包
    "dumplings": [
        "https://images.pexels.com/photos/4518658/pexels-photo-4518658.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/6941024/pexels-photo-6941024.jpeg?auto=compress&cs=tinysrgb&w=400",
    ],
    # 火锅
    "hotpot": [
        "https://images.pexels.com/photos/3738088/pexels-photo-3738088.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/2233729/pexels-photo-2233729.jpeg?auto=compress&cs=tinysrgb&w=400",
    ],
    # 烧烤
    "bbq": [
        "https://images.pexels.com/photos/1251198/pexels-photo-1251198.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/5410400/pexels-photo-5410400.jpeg?auto=compress&cs=tinysrgb&w=400",
    ],
    # 炒菜
    "stirfry": [
        "https://images.pexels.com/photos/1640772/pexels-photo-1640772.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?auto=compress&cs=tinysrgb&w=400",
    ],
    # 西餐
    "western": [
        "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?auto=compress&cs=tinysrgb&w=400",  # 牛排
        "https://images.pexels.com/photos/1653877/pexels-photo-1653877.jpeg?auto=compress&cs=tinysrgb&w=400",  # 汉堡
        "https://images.pexels.com/photos/845811/pexels-photo-845811.jpeg?auto=compress&cs=tinysrgb&w=400",  # 披萨
        "https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?auto=compress&cs=tinysrgb&w=400",  # 意面
    ],
    # 日料
    "japanese": [
        "https://images.pexels.com/photos/2098085/pexels-photo-2098085.jpeg?auto=compress&cs=tinysrgb&w=400",  # 寿司
        "https://images.pexels.com/photos/884600/pexels-photo-884600.jpeg?auto=compress&cs=tinysrgb&w=400",  # 拉面
    ],
    # 甜品
    "dessert": [
        "https://images.pexels.com/photos/291528/pexels-photo-291528.jpeg?auto=compress&cs=tinysrgb&w=400",  # 蛋糕
        "https://images.pexels.com/photos/1352278/pexels-photo-1352278.jpeg?auto=compress&cs=tinysrgb&w=400",  # 冰淇淋
    ],
    # 饮品
    "drinks": [
        "https://images.pexels.com/photos/312418/pexels-photo-312312418.jpeg?auto=compress&cs=tinysrgb&w=400",  # 咖啡
        "https://images.pexels.com/photos/1262302/pexels-photo-1262302.jpeg?auto=compress&cs=tinysrgb&w=400",  # 奶茶
    ],
    # 轻食
    "salad": [
        "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=400",
        "https://images.pexels.com/photos/1059905/pexels-photo-1059905.jpeg?auto=compress&cs=tinysrgb&w=400",
    ],
}

os.makedirs("images_real", exist_ok=True)
print("开始下载真实美食照片...")

count = 0
for category, urls in food_images.items():
    for idx, url in enumerate(urls):
        try:
            filename = f"images_real/{category}_{idx+1}.jpg"
            urllib.request.urlretrieve(url, filename)
            count += 1
            print(f"✓ 下载 {count}: {category}_{idx+1}.jpg")
            time.sleep(0.5)  # 避免请求过快
        except Exception as e:
            print(f"✗ 失败: {category}_{idx+1}.jpg - {e}")

print(f"\n完成！共下载 {count} 张真实美食照片")
