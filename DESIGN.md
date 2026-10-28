---
name: 今天吃什么
description: 好好吃每一餐
colors:
  primary: "#a64732"
  primary-hover: "#8c3927"
  primary-soft: "#f5e6df"
  page: "#f8f5f0"
  surface: "#fffdf9"
  subtle: "#f0ebe3"
  text: "#302922"
  muted: "#74665b"
  line: "#e5ddd2"
  success: "#37624e"
  danger: "#ae3735"
  wheel-slice: "#f1e5d5"
  wheel-alternate: "#faf4e9"
typography:
  headline:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans CJK SC, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  title:
    fontSize: "1.15rem"
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontSize: "13px"
    fontWeight: 550
rounded:
  control: "10px"
  surface: "16px"
  dialog: "16px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  food-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
---

# Design System: 今天吃什么

## Overview

**Creative North Star: "好好吃每一餐"**

以现有产品文案「好好吃每一餐」作为记录名称，延续暖色美食身份。界面服务于日常选择任务，照片承载食物内容，转盘是主要动效。v3.1.0 按用户要求精修为奶油色盘面、陶土色强调和正向实物缩略图，保持原有功能和中文内容。

**Key Characteristics:**
- 温暖中性色
- 真实菜品图
- 清楚的操作状态
- 移动端底部导航

## Colors

默认强调色用于主要按钮、选中状态和品牌碗形标志。页面、卡片、内嵌控件使用三层暖中性色。所有语义颜色由 styles.css 的变量管理。

深色由 `html[data-mode="dark"]` 覆盖同一组 token。六种强调色由 `data-accent` 指定：sunset、celadon、indigo、violet、amber、rose；每种均有对应深色值。不要在页面模块里重复固定配色。

**The Semantic State Rule.** 强调、成功和错误颜色分别由同名 token 管理。

## Typography

使用项目现有中文系统字体栈，保持控件与内容同一语言。主标题为 2rem / 700，手机为 1.6rem；次标题 1.15rem / 650，推荐菜名为 26px（手机 24px）。正文基准为 15px / 1.65；控件与正文采用 12–18px，品牌名 19px、手机 17–18px。辅助说明 10–13px，菜品分类 10–11px。盘面菜名 12px，370px 以下为 11px，最多两行；盘面参考图角标为 8px，其余缩略图角标 9–10px，并有完整 alt/title。字号依职责和断点，不随视口连续缩放。

## Layout

主容器最大 1248px，桌面左右内边距 32px。桌面决策区域两列比例 1.18:1，间距 28px；菜单为四列，间距 22px。760px 以下切换单列任务布局、双列菜品与底部五项导航，主容器内边距 18px。1080px 调整密度，370px 进一步压缩边距。转盘桌面最大 388px，中间尺寸 340px，手机 300px；旋转层裁切在盘面区域，允许指针 4px 外延。

计划使用日期与三餐的内容结构；桌面 7 列，手机日期分组内仍保持三餐并列。手机分类条使用原生横向滚动。

## Elevation & Depth

普通内容使用一像素边框或分隔线。阴影仅用于弹窗与浮动提示；弹窗 token 为 `0 18px 60px rgba(43,29,18,.18)`。背景保持实色。盘面以原生 Canvas 绘制暖色扇区和细线外圈，不模拟纹理。菜单照片内缩 8px、推荐照片内缩 16px，保留内容间的呼吸空间。

## Shapes

普通控件圆角 10px，主要内容表面和弹窗 16px；主抽取按钮 12px。紧凑标签 4–5px，嵌套的小图片 6–10px，分段按钮 8px、分类/导航项 9px，分段容器 11px、顶部导航容器 13px，品牌标志 14px。收藏按钮、照片缩略图、中心按钮和配色圆点保留圆形。偏好开关为 42×25px 的原生 checkbox，保持 switch 语义和键盘焦点。图标为统一 24 单位、1.7 描边的 SVG。

## Components

- 主按钮最小高度 44px，主抽取按钮 52px。次按钮使用表面色和边框。所有控件保留键盘聚焦样式。
- 分类与餐次使用真实 button 和 `aria-pressed`；菜单筛选不承担导航职责。
- 菜品卡使用固定图片比例，优先原图并尝试多张候选；缺图时展示匹配菜名/品类的实物参考图，角落明确标注“参考图”。全部照片不可用时才显示名称卡，未知品类不随意配图。
- 表单有可见 label；错误文字与输入区域关联呈现。偏好开关使用原生 checkbox。
- 弹窗使用原生 dialog，提供关闭按钮、Escape、焦点约束；异步内容按 generation 防止覆盖其他弹窗。
- 转盘离屏缓存，最多展示 8 项；选中项来自全部合格候选。照片复用共享加载器，随盘面转动并反向旋转保持正向；中心「开饭」与下方抽取按钮共同锁定。落定后高亮照片边框、名称和对应扇区，保持指针一致。减少动态效果时立即落定同一结果，不改变算法。
- 转盘动画为 2600ms 四次 ease-out；控件反馈约 180–200ms。抽取结果轻移 8px / 360ms，弹窗轻移 8px / 200ms，不安排页面入场序列。所有效果遵守减少动态设置。
- 深色盘面使用 `#40372f` 与 `#302a24`；六种强调色同时驱动中心、指针、当前候选和按钮，从设置返回时刷新 Canvas 缓存。

## Do's and Don'ts

- Do 使用语义 token、真实按钮与统一 SVG 图标；保持照片、结果和计划的阅读顺序。
- Do 明确标注未知口味、空候选、离线、加载失败与存储失败的恢复方式。
- Don't 用页面装饰动画延迟操作，也不要把图片失败变成空白区域。
- Don't 将抽取记录自动等同于实际吃过，或把参考标签当作食材保证。
