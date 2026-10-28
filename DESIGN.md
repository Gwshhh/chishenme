---
name: 今天吃什么
description: 实物照片与轻快选择
colors:
  primary: "#b74428"
  primary-hover: "#97361e"
  primary-soft: "#f8e9e2"
  page: "#f6f7f3"
  surface: "#ffffff"
  subtle: "#edf1e8"
  feature: "#eaf0e4"
  text: "#27352c"
  muted: "#626e65"
  line: "#dde4d9"
  success: "#37624e"
  danger: "#ae3735"
  wheel-slice: "#e1e9d9"
  wheel-alternate: "#f3f6ee"
  dark-page: "#1b231e"
  dark-surface: "#242f28"
  dark-subtle: "#303e33"
  dark-feature: "#2a382d"
  dark-text: "#eff3eb"
  dark-muted: "#b4c0b3"
  dark-line: "#405044"
typography:
  headline:
    fontFamily: "PingFang SC, Microsoft YaHei, Noto Sans CJK SC, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 750
    lineHeight: 1.4
    letterSpacing: "-0.03em"
  mobile-headline:
    fontSize: "1.625rem"
    fontWeight: 750
    lineHeight: 1.4
  section:
    fontSize: "1.2rem"
    fontWeight: 650
    lineHeight: 1.4
  heading-small:
    fontSize: "1rem"
    fontWeight: 700
  dish:
    fontSize: "30px"
    fontWeight: 700
    letterSpacing: "-0.025em"
  mobile-dish:
    fontSize: "27px"
    fontWeight: 700
  card-title:
    fontSize: "17px"
    fontWeight: 650
  brand:
    fontSize: "18px"
    fontWeight: 750
  body:
    fontSize: "15px"
    lineHeight: 1.65
    fontWeight: 400
  control:
    fontSize: "14px"
    fontWeight: 600
  supporting:
    fontSize: "13px"
    lineHeight: 1.65
  label:
    fontSize: "12px"
    fontWeight: 550
  caption:
    fontSize: "11px"
    lineHeight: 1.65
  credit:
    fontSize: "10px"
    lineHeight: 1.5
  small-credit:
    fontSize: "9px"
    lineHeight: 1.5
  wheel-credit:
    fontSize: "8px"
    lineHeight: 1.5
rounded:
  credit: "4px"
  tag: "5px"
  tiny-photo: "6px"
  plan-photo: "7px"
  segment: "8px"
  chip: "9px"
  control: "10px"
  photo: "12px"
  surface: "16px"
  switch: "20px"
  circle: "50%"
spacing:
  xs: "4px"
  small: "8px"
  control: "12px"
  medium: "16px"
  inset: "20px"
  large: "24px"
  section: "36px"
  shell: "44px"
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
    height: "44px"
  button-choice:
    backgroundColor: "{colors.text}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "48px"
  navigation-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    padding: "12px 15px"
  feature-surface:
    backgroundColor: "{colors.feature}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.photo}"
    height: "48px"
---

# Design System: 今天吃什么

## Overview

**Creative North Star: "鲜食菜单"**

v3.2.0 的视觉系统围绕真实食物和明确选择建立。白色内容区、植物色中性背景与珊瑚色交互强调形成层次，照片承担主要视觉内容。中文任务界面使用本机字体，保持快速加载与可读性。

**Key Characteristics:**

- 菜品照片与直接选择动作相邻。
- 页面依靠留白、背景和少量分隔线组织内容。
- 主次操作、选中与等待状态可辨认。
- 桌面、手机及深色模式保持同一套组件语言。

## Colors

前面的颜色 token 对应 styles.css 的实际默认值。primary 用于转盘、导航选中、主要功能按钮与焦点；首页「就选这道」使用 text 与 surface 的强对比。feature 用于转盘与用餐计划提示，普通内容区使用 surface，背景使用 page。

六种强调色继续由 data-accent 指定：sunset、celadon、indigo、violet、amber、rose。data-mode="dark" 替换中性色与强调色；深色按钮文字使用专用 on-accent 值，不能假定主按钮始终白字。照片上的收藏浮钮与参考标注保持可读的固定底色。

**The Semantic State Rule.** 强调、成功和错误分别使用对应语义 token，不能只靠颜色表达状态。

## Typography

使用中文系统界面字体栈，无外部字体下载。主标题、菜名、正文与辅助信息通过字号和字重区分；这不是装饰性展示字体系统。字号按前面的职责定义，保持控件与正文的中文语言一致。

主标题桌面为 headline、手机为 mobile-headline；推荐菜名为 dish / mobile-dish，菜单标题为 card-title。正文一般为 15px，内容说明和控件为 12–14px。参考图标记在小照片上缩小，同时保留完整 alt/title；盘面菜名 12px，370px 以下 11px，最多两行。长名称允许换行，主选择按钮保持单行。

## Layout

桌面外壳最大 1536px，208px 侧栏，内容间隔和右侧边距均为 44px。侧栏固定在可见窗口内，页面内容正常滚动。1159px 以下变为顶部导航与 28px 内边距；760px 以下使用 18px 内边距及固定五项底部导航；370px 以下为 12px 内边距。

首页大图与辅助转盘并列，比例 1.6:1、间距 24px；手机按推荐、转盘、灵感菜单、计划与附近入口排列。推荐图桌面比例 1.8，手机 1.65，极窄屏恢复 1.8，使主动作完整出现在导航上方。低于 840px 的桌面降低图片上限与盘面尺寸。

菜单桌面四列、手机两列；照片直接组成列表，不叠加外层卡片边框。菜单每次显示 24 道，搜索仍覆盖全部内容。周计划桌面七列，手机按日期分组，每组三餐并列。

首屏在 HTML 中预留照片、正文、图标和餐次控件尺寸，内容就绪时保持布局稳定。

## Elevation & Depth

普通界面通过背景层次和一像素分隔线区分；弹窗、分类浮层使用 shadow token（0 20px 70px rgba(27,45,33,.16)），提示条使用较小阴影。照片与普通内容区不使用漂浮阴影。

## Shapes

主要区域与弹窗使用 surface 圆角，菜单照片使用 photo 圆角，按钮使用 control 圆角。标签与参考标记更紧凑。收藏按钮、盘面照片和中心按钮保持圆形；开关使用胶囊形状。

v3.2.1 品牌标志采用暖珊瑚色方形底、奶油白餐碗与问号形蒸汽，源文件为 assets/brand/app-icon-master.svg。浏览器与网页品牌使用圆角 SVG，桌面品牌 42px、手机 38px；颜色固定，不随界面强调色或明暗模式变化。安装用 PNG 全出血、不预裁圆角，主体置于中央 80% 安全圆内。普通导航和功能图标继续使用原有线性图标。导出规格与预览见 docs/app-icon.md。

## Components

- **主动作：** 普通按钮至少 44px，首页选择与抽取按钮 48px；点击提供短促缩放反馈，保留清楚的 focus-visible 轮廓。极窄屏移除「换一道」的次要图标，保留文字与点击区域。
- **导航：** 桌面显示图标和中文名称；手机底栏图标与文字上下排列，选中项带强调背景。保留真实链接和 aria-current。
- **筛选：** 餐次使用分段按钮，分类在定位浮层中展开，手机分类列表使用原生横向滚动。按钮提供 aria-pressed 和键盘焦点。
- **照片：** 共用响应式图片组件；转盘使用 160px，卡片/计划按显示大小选择 160/480px，推荐和详情可选 960px。图片固定比例，失败按顺序回退，参考图明确标注且不写回原图字段。
- **转盘：** 最大 318px，手机最大 300px；几何扇区与正向实物照片、菜名同时呈现。静态 Canvas 缓存通过 Web Animations 合成层旋转，1750ms、cubic-bezier(.12,.76,.18,1)。照片节点按菜品复用。结果与指针一致；减少动态时立即落定。
- **轻量更新：** 收藏、配色保留已显示照片；页面首次访问时初始化。搜索合并短时间输入，支持中文输入法。
- **表单与弹窗：** 可见标签、原生输入和 dialog，错误与恢复方式靠近操作；开关有 switch 语义。异步内容不得覆盖后来打开的弹窗。

## Do's and Don'ts

- Do 让照片、菜名和选择动作保持直接的阅读顺序。
- Do 以共享语义 token 维护明暗与六色主题。
- Do 同时保留键盘、减少动态效果、长名称和图片失败状态。
- Do 把派生图片与原图一起发布，并检查缩略图大小预算。
- Don't 将店铺参考图表达成本店实拍，或把口味标签当作食材保证。
- Don't 在动画每一帧重建图片、重绘盘面或更新整页。
- Don't 为背景装饰引入持续动画和额外网络依赖。
