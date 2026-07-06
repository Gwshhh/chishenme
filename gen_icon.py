# -*- coding: utf-8 -*-
"""生成 PWA / iOS 所需的 PNG 图标。

iOS 的 apple-touch-icon 不支持 SVG，必须提供 PNG，否则"添加到主屏幕"
会显示网页截图。本脚本用 PIL 重绘 icon.svg 的品牌图（对角渐变 + 白线碗），
输出三个尺寸。改动品牌色后重跑一次即可：python gen_icon.py
"""
from PIL import Image, ImageDraw

S = 1024
C1, C2, C3 = (255, 138, 76), (240, 67, 90), (217, 38, 103)  # 与 CSS --brand-grad 一致


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


img = Image.new('RGB', (S, S), C2)
dr = ImageDraw.Draw(img)

# 135° 对角渐变：沿 (x+y) 方向逐对角线着色（58% 处过渡，与 CSS 渐变一致）
N = 2 * S - 1
for d in range(N):
    t = d / (N - 1)
    col = lerp(C1, C2, t / 0.58) if t < 0.58 else lerp(C2, C3, (t - 0.58) / 0.42)
    dr.line([(0, d), (d, 0)], fill=col, width=2)

# 白线碗（下半圆 + 碗口横线，端点补圆头）+ 两缕蒸汽
W = 52
WHITE = (255, 255, 255)
cx, cy, r = 512, 540, 290
dr.arc([cx - r, cy - r, cx + r, cy + r], start=0, end=180, fill=WHITE, width=W)
dr.line([(cx - r, cy), (cx + r, cy)], fill=WHITE, width=W)
for px in (cx - r, cx + r):
    dr.ellipse([px - W // 2, cy - W // 2, px + W // 2, cy + W // 2], fill=WHITE)
dr.arc([420 - 58, 205, 420 + 58, 335], start=300, end=60, fill=WHITE, width=44)
dr.arc([604 - 58, 205, 604 + 58, 335], start=300, end=60, fill=WHITE, width=44)

# 全出血方形（不做圆角）：iOS/安卓启动器会自己套圆角/遮罩，
# 透明圆角反而会让 iOS 垫黑底。碗体已控制在中央安全区内。
for size, name in [(180, 'apple-touch-icon.png'), (192, 'icon-192.png'), (512, 'icon-512.png')]:
    img.resize((size, size), Image.LANCZOS).save(name)
    print('OK', name)

print('完成：三个 PNG 图标已生成')
