# -*- coding: utf-8 -*-
"""
从维基百科下载每道菜的真实成品照片到 images_food/。
词条主图（pageimage）即该菜做好的成品照，准确、可热链来源、下载后离线可用。

用法：
    python fetch_real_images.py

说明：
- 文件名 images_food/food_XX.jpg 的序号 XX 与 data.js 的 IMAGE_ORDER 下标+1 严格对应。
- 品牌/连锁名（海底捞、呷哺呷哺等）已替换为对应菜品（火锅），避免抓到店面 logo。
- 个别没有合适词条的菜（如健身餐）标记为 None，跳过下载，前端会自动回退到带菜名的标签卡。
- 下载失败的菜同样回退标签卡，不影响页面运行。
"""

import os
import json
import time
import sys
import urllib.parse
import urllib.request
import urllib.error

# Windows 控制台默认 GBK，print ✓/✗ 等字符会抛 UnicodeEncodeError 中断下载；强制 UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# 必须与 data.js 的 IMAGE_ORDER 顺序完全一致（决定 food_XX.jpg 的编号）
ORDER = [
    "黄焖鸡米饭", "兰州拉面", "重庆小面", "麻辣烫", "麻辣香锅", "沙县小吃", "盖浇饭",
    "扬州炒饭", "煲仔饭", "东北饺子", "云吞面", "刀削面", "热干面", "酸辣粉", "烤鱼",
    "水煮鱼", "红烧肉", "宫保鸡丁", "回锅肉", "鱼香肉丝", "重庆火锅", "海底捞", "呷哺呷哺",
    "潮汕牛肉火锅", "烧烤", "羊肉串", "烤鸡翅", "烤茄子", "牛排", "意大利面", "披萨",
    "汉堡", "炸鸡", "薯条", "寿司", "拉面", "天妇罗", "烤肉", "石锅拌饭", "韩式炸鸡",
    "部队锅", "早茶", "虾饺", "烧鹅", "白切鸡", "肠粉", "奶茶", "咖啡", "鲜榨果汁",
    "蛋糕", "冰淇淋", "双皮奶", "杨枝甘露", "肉夹馍", "凉皮", "煎饼果子", "生煎包",
    "小笼包", "糖葫芦", "臭豆腐", "章鱼小丸子", "沙拉", "三明治", "健身餐", "粥品",
    # 新增菜品（槽位 66-77），顺序需与 data.js 的 IMAGE_ORDER 一致
    "螺蛳粉", "羊肉泡馍", "酸菜鱼", "麻婆豆腐", "北京烤鸭", "大盘鸡",
    "蛋挞", "春卷", "提拉米苏", "冬阴功", "越南河粉", "寿喜烧",
    # 第三批新增（槽位 78-92），顺序需与 data.js 的 IMAGE_ORDER 一致
    "卤肉饭", "照烧鸡饭", "炒面", "过桥米线", "干炒牛河", "冒菜", "鸡蛋灌饼",
    "梅菜扣肉", "鸡公煲", "小龙虾", "蛋包饭", "咖喱饭", "烤冷面", "关东煮", "手抓饼",
]

# 菜名 -> 维基百科词条标题（取其主图）。品牌名替换为对应菜品，确保拿到成品照而非店面。
TITLES = {
    "兰州拉面": "兰州牛肉面", "重庆小面": "重庆小面", "刀削面": "刀削面", "热干面": "热干面",
    "云吞面": "云吞面", "东北饺子": "饺子", "拉面": None, "意大利面": None,
    "黄焖鸡米饭": "黄焖鸡米饭", "盖浇饭": "盖浇饭", "扬州炒饭": "扬州炒饭", "煲仔饭": "煲仔饭",
    "沙县小吃": "馄饨", "麻辣烫": "麻辣烫", "麻辣香锅": "麻辣香锅", "酸辣粉": "酸辣粉",
    "肉夹馍": "肉夹馍", "凉皮": "凉皮", "煎饼果子": "煎饼馃子", "生煎包": "生煎馒头",
    "小笼包": "小笼包", "糖葫芦": "冰糖葫芦", "臭豆腐": "臭豆腐", "章鱼小丸子": "章鱼烧",
    "烤鱼": "烤鱼", "水煮鱼": "水煮鱼", "红烧肉": "红烧肉", "宫保鸡丁": "宫保鸡丁",
    "回锅肉": "回锅肉", "鱼香肉丝": "鱼香肉丝",
    "重庆火锅": "麻辣火锅", "海底捞": "四川火锅", "呷哺呷哺": "火锅", "潮汕牛肉火锅": "牛肉火锅",
    "烧烤": "烧烤", "羊肉串": "羊肉串", "烤鸡翅": "可乐鸡翅", "烤茄子": "鱼香茄子",
    "牛排": "牛排", "披萨": "比萨饼", "汉堡": "汉堡包", "炸鸡": "炸鸡", "薯条": "炸薯条",
    "寿司": "寿司", "天妇罗": "天妇罗", "烤肉": "韩国烧烤", "石锅拌饭": "拌饭",
    "韩式炸鸡": "韩式炸鸡", "部队锅": "部队锅",
    "早茶": "点心", "虾饺": "虾饺", "烧鹅": "烧鹅", "白切鸡": "白切鸡", "肠粉": "肠粉",
    "奶茶": "珍珠奶茶", "咖啡": "咖啡", "鲜榨果汁": "果汁", "蛋糕": "蛋糕", "冰淇淋": "冰淇淋",
    "双皮奶": "双皮奶", "杨枝甘露": "杨枝甘露",
    "沙拉": "沙拉", "三明治": "三明治", "健身餐": None, "粥品": "粥",
    # 新增菜品
    "螺蛳粉": "螺蛳粉", "羊肉泡馍": "羊肉泡馍", "酸菜鱼": "酸菜鱼", "麻婆豆腐": "麻婆豆腐",
    "北京烤鸭": "北京烤鸭", "大盘鸡": "大盘鸡", "蛋挞": "蛋挞", "春卷": "春卷",
    "提拉米苏": "提拉米苏", "冬阴功": "冬阴功", "越南河粉": "越南河粉", "寿喜烧": "寿喜烧",
    # 第三批新增
    "卤肉饭": "卤肉饭", "照烧鸡饭": None, "炒面": "炒面", "过桥米线": "过桥米线",
    "干炒牛河": "干炒牛河", "冒菜": "冒菜", "鸡蛋灌饼": "鸡蛋灌饼", "梅菜扣肉": "梅菜扣肉",
    "鸡公煲": "三杯鸡", "小龙虾": None, "蛋包饭": "蛋包饭", "咖喱饭": "日式咖喱",
    "烤冷面": "烤冷面", "关东煮": "关东煮", "手抓饼": "葱油饼",
}

# 中文词条无主图时，改从英文维基取图（英文词条多数有主图）。仅给需要的菜配。
EN_TITLES = {
    "麻辣香锅": "Mala xiang guo", "扬州炒饭": "Yangzhou fried rice", "烤鱼": "Ikan bakar",
    "红烧肉": "Red braised pork belly", "海底捞": "Hot pot", "潮汕牛肉火锅": "Shabu-shabu",
    "炸鸡": "Fried chicken", "薯条": "French fries", "石锅拌饭": "Bibimbap",
    "韩式炸鸡": "Korean fried chicken", "早茶": "Dim sum", "杨枝甘露": "Mango pomelo sago",
    "重庆火锅": "Sichuan hot pot", "健身餐": "Buddha bowl",
    "拉面": "Ramen", "意大利面": "Carbonara",
    "烤鸡翅": "Buffalo wing", "烤茄子": "Baba ghanoush",
    # 新增菜品的英文兜底
    "螺蛳粉": "Luosifen", "酸菜鱼": "Suancaiyu", "麻婆豆腐": "Mapo tofu",
    "北京烤鸭": "Peking duck", "大盘鸡": "Big plate chicken", "蛋挞": "Egg tart",
    "春卷": "Spring roll", "提拉米苏": "Tiramisu", "冬阴功": "Tom yum",
    "越南河粉": "Pho", "寿喜烧": "Sukiyaki", "羊肉泡馍": "Paomo",
    # 第三批新增的英文兜底
    "卤肉饭": "Minced pork rice", "照烧鸡饭": "Teriyaki", "炒面": "Chow mein",
    "干炒牛河": "Beef chow fun", "小龙虾": "Crawfish boil", "关东煮": "Oden",
    "蛋包饭": "Omurice", "咖喱饭": "Japanese curry",
}

# 强制重下清单：这些菜之前下到了错误/重复的图，重跑时忽略"已存在"强制覆盖。
FORCE = {"拉面", "意大利面", "潮汕牛肉火锅", "烤茄子", "烤鸡翅"}

API = "https://zh.wikipedia.org/w/api.php"
EN_API = "https://en.wikipedia.org/w/api.php"
HEADERS = {
    # 用浏览器 UA，规避部分基于 UA 的 403
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/124.0 Safari/537.36"),
    "Accept": "application/json, image/*, */*",
}
OUT_DIR = "images_food"

# 维基百科在部分网络环境（如中国大陆）被屏蔽。若浏览器能开维基但本脚本报错，
# 多半是命令行未走代理。可在运行前设置代理环境变量，例如（按你的代理端口改）：
#   Windows CMD:        set HTTPS_PROXY=http://127.0.0.1:7890
#   Windows PowerShell: $env:HTTPS_PROXY="http://127.0.0.1:7890"
#   Git Bash:           export HTTPS_PROXY=http://127.0.0.1:7890
# urllib 会自动读取 HTTP_PROXY / HTTPS_PROXY 环境变量。


def urlopen_retry(req, timeout, tries=5):
    """带退避重试的 urlopen：遇到 429/5xx 或网络错误时等待后重试。"""
    delay = 4
    last = None
    for attempt in range(tries):
        try:
            return urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503, 504):
                wait = delay
                ra = e.headers.get("Retry-After") if e.headers else None
                if ra and ra.isdigit():
                    wait = max(wait, int(ra))
                print(f"    ⏳ {e.code}，等待 {wait}s 后重试（{attempt + 1}/{tries}）")
                time.sleep(wait)
                delay = min(delay * 2, 60)
                continue
            raise
        except urllib.error.URLError as e:
            last = e
            print(f"    ⏳ 网络波动，等待 {delay}s 后重试（{attempt + 1}/{tries}）")
            time.sleep(delay)
            delay = min(delay * 2, 60)
    raise last


def _thumb(api, title):
    """向指定维基 API 查询词条主图，返回缩略图 URL 或 None。"""
    params = {
        "action": "query", "format": "json", "prop": "pageimages",
        "piprop": "thumbnail", "pithumbsize": "600", "redirects": "1",
        "titles": title,
    }
    url = api + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urlopen_retry(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    pages = data.get("query", {}).get("pages", {})
    for _, page in pages.items():
        thumb = page.get("thumbnail", {}).get("source")
        if thumb:
            return thumb
    return None


def get_image_url(zh_title, en_title=None):
    """先查中文维基；无主图（或无中文词条）则退回英文维基。"""
    if zh_title:
        thumb = _thumb(API, zh_title)
        if thumb:
            return thumb
    if en_title:
        return _thumb(EN_API, en_title)
    return None


def download(url, path):
    req = urllib.request.Request(url, headers=HEADERS)
    with urlopen_retry(req, timeout=30) as resp:
        data = resp.read()
    with open(path, "wb") as f:
        f.write(data)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ok, skipped, failed, done = 0, [], [], 0

    for idx, name in enumerate(ORDER):
        nn = f"{idx + 1:02d}"
        out = os.path.join(OUT_DIR, f"food_{nn}.jpg")
        title = TITLES.get(name)
        en_title = EN_TITLES.get(name)

        # 断点续传：已下载且非空则跳过；但 FORCE 清单里的强制重下
        if name not in FORCE and os.path.exists(out) and os.path.getsize(out) > 1024:
            done += 1
            print(f"= {nn} {name} 已存在，跳过")
            continue

        if not title and not en_title:
            skipped.append(name)
            print(f"- 跳过 {nn} {name}（无合适词条，保留标签卡）")
            continue

        try:
            img_url = get_image_url(title, en_title)
            if not img_url:
                failed.append(f"{name}（无主图）")
                print(f"✗ {nn} {name} 无主图")
                # 强制重下却找不到真实图：删掉旧的错图，回退标签卡，绝不留错图
                if name in FORCE and os.path.exists(out):
                    os.remove(out)
                    print(f"    🗑 已删除 {name} 的旧图，将显示标签卡")
                continue
            download(img_url, out)
            ok += 1
            print(f"✓ {nn} {name} <- {title}")
            time.sleep(1.5)  # 礼貌限速，降低 429 概率
        except Exception as e:
            failed.append(f"{name}（{e}）")
            print(f"✗ {nn} {name} 下载失败：{e}")

    print("\n========== 完成 ==========")
    print(f"本次新下载：{ok} 张；之前已存在：{done} 张  ->  {OUT_DIR}/")
    if skipped:
        print(f"主动跳过（用标签卡）：{len(skipped)} 道 — {'、'.join(skipped)}")
    if failed:
        print(f"本次失败（用标签卡，可重跑本脚本补齐）：{len(failed)} 道")
        for f in failed:
            print(f"   · {f}")
        print("\n👉 大多是限流(429)。直接再次运行本脚本即可继续补齐（已下载的会自动跳过）。")
    print("\n刷新页面（Ctrl+F5）即可看到真实菜品图；失败/跳过的会自动显示带菜名的标签卡。")


if __name__ == "__main__":
    main()
