// 美食数据
// 图片策略：每道菜显示一张本地真实成品照片 images_food/food_XX.jpg
//（由 fetch_real_images.py 从维基百科下载，词条主图即该菜真实成品，准确、离线可用、无防盗链）；
// 若真实图缺失或尚未下载，app.js 的 onerror 自动回退到带菜名的本地标签卡 images_new/food_XX.jpg，
// 保证「图片 ⇄ 食物」一一对应、绝不裂图、绝不张冠李戴。

const foodData = [
    // === 快餐便当 ===
    { name: "黄焖鸡米饭", category: "快餐便当", description: "鸡肉软烂，汤汁浓郁" },
    { name: "盖浇饭", category: "快餐便当", description: "一碗饭解决一餐" },
    { name: "扬州炒饭", category: "快餐便当", description: "粒粒分明，咸香适口" },
    { name: "煲仔饭", category: "快餐便当", description: "锅巴香脆，饭菜合一" },
    { name: "沙县小吃", category: "快餐便当", description: "国民快餐，经典美味" },
    { name: "石锅拌饭", category: "快餐便当", description: "营养丰富，锅巴香脆" },
    { name: "卤肉饭", category: "快餐便当", description: "台式经典，肥瘦浇饭" },
    { name: "照烧鸡饭", category: "快餐便当", description: "照烧酱香，鸡肉滑嫩" },

    // === 米粉面馆 ===
    { name: "兰州拉面", category: "米粉面馆", description: "一清二白三红四绿五黄" },
    { name: "重庆小面", category: "米粉面馆", description: "麻辣鲜香，回味无穷" },
    { name: "刀削面", category: "米粉面馆", description: "内虚外筋，柔中有硬" },
    { name: "热干面", category: "米粉面馆", description: "武汉特色，芝麻酱浓郁" },
    { name: "云吞面", category: "米粉面馆", description: "皮薄馅大，汤鲜味美" },
    { name: "酸辣粉", category: "米粉面馆", description: "酸辣开胃，粉滑爽口" },
    { name: "螺蛳粉", category: "米粉面馆", description: "酸辣鲜香，闻臭吃香" },
    { name: "羊肉泡馍", category: "米粉面馆", description: "汤鲜馍筋，西北一绝" },
    { name: "越南河粉", category: "米粉面馆", description: "清汤米粉，鲜香爽口" },
    { name: "炒面", category: "米粉面馆", description: "镬气十足，咸香爽口" },
    { name: "过桥米线", category: "米粉面馆", description: "汤鲜料足，云南风味" },
    { name: "干炒牛河", category: "米粉面馆", description: "镬气河粉，滑嫩牛肉" },

    // === 麻辣烫·冒菜 ===
    { name: "麻辣烫", category: "麻辣烫冒菜", description: "想吃什么自己选" },
    { name: "麻辣香锅", category: "麻辣烫冒菜", description: "麻辣鲜香一锅端" },
    { name: "冒菜", category: "麻辣烫冒菜", description: "一人份小火锅，麻辣过瘾" },

    // === 汉堡·炸鸡 ===
    { name: "汉堡", category: "汉堡炸鸡", description: "肉饼厚实，酱料丰富" },
    { name: "炸鸡", category: "汉堡炸鸡", description: "外酥里嫩，香气诱人" },
    { name: "薯条", category: "汉堡炸鸡", description: "金黄酥脆，经典搭配" },
    { name: "韩式炸鸡", category: "汉堡炸鸡", description: "酱汁特别，酥脆多汁" },

    // === 饺子·包子·粥 ===
    { name: "东北饺子", category: "饺子包子粥", description: "好吃不如饺子" },
    { name: "小笼包", category: "饺子包子粥", description: "皮薄汁多，鲜美无比" },
    { name: "生煎包", category: "饺子包子粥", description: "上海名点，底酥馅香" },
    { name: "煎饼果子", category: "饺子包子粥", description: "天津特色，外酥里嫩" },
    { name: "鸡蛋灌饼", category: "饺子包子粥", description: "外酥里嫩，营养早餐" },
    { name: "粥品", category: "饺子包子粥", description: "温暖养胃，营养丰富" },

    // === 地方菜·下饭 ===
    { name: "红烧肉", category: "地方菜", description: "色泽红亮，肥而不腻" },
    { name: "宫保鸡丁", category: "地方菜", description: "酸甜微辣，鸡肉鲜嫩" },
    { name: "回锅肉", category: "地方菜", description: "川菜之首，香气四溢" },
    { name: "鱼香肉丝", category: "地方菜", description: "色香味俱全，咸甜酸辣" },
    { name: "麻婆豆腐", category: "地方菜", description: "麻辣鲜香，下饭神器" },
    { name: "酸菜鱼", category: "地方菜", description: "酸辣开胃，鱼肉嫩滑" },
    { name: "水煮鱼", category: "地方菜", description: "麻辣鲜香，鱼肉滑嫩" },
    { name: "大盘鸡", category: "地方菜", description: "鸡香土豆糯，分量十足" },
    { name: "烤鱼", category: "地方菜", description: "外焦里嫩，香辣可口" },
    { name: "北京烤鸭", category: "地方菜", description: "皮酥肉嫩，蘸酱卷饼" },
    { name: "梅菜扣肉", category: "地方菜", description: "咸香软糯，肥而不腻" },
    { name: "鸡公煲", category: "地方菜", description: "香辣浓郁，越煮越香" },

    // === 火锅·烧烤 ===
    { name: "重庆火锅", category: "火锅烧烤", description: "麻辣鲜香，越吃越爽" },
    { name: "海底捞", category: "火锅烧烤", description: "服务一流，锅底丰富" },
    { name: "潮汕牛肉火锅", category: "火锅烧烤", description: "鲜切牛肉，清汤见底" },
    { name: "烧烤", category: "火锅烧烤", description: "烟火气息，深夜食堂" },
    { name: "羊肉串", category: "火锅烧烤", description: "孜然飘香，外焦里嫩" },
    { name: "烤鸡翅", category: "火锅烧烤", description: "金黄酥脆，肉质鲜嫩" },
    { name: "烤茄子", category: "火锅烧烤", description: "软糯香甜，蒜香四溢" },
    { name: "小龙虾", category: "火锅烧烤", description: "麻辣鲜香，夏夜必点" },

    // === 日韩料理 ===
    { name: "拉面", category: "日韩料理", description: "汤头浓郁，面条劲道" },
    { name: "寿司", category: "日韩料理", description: "新鲜食材，精致美味" },
    { name: "天妇罗", category: "日韩料理", description: "外皮酥脆，内里鲜嫩" },
    { name: "烤肉", category: "日韩料理", description: "现烤现吃，肉质鲜美" },
    { name: "部队锅", category: "日韩料理", description: "一锅多料，丰富美味" },
    { name: "寿喜烧", category: "日韩料理", description: "甜咸锅物，肉嫩入味" },
    { name: "蛋包饭", category: "日韩料理", description: "滑蛋裹饭，番茄酱香" },
    { name: "咖喱饭", category: "日韩料理", description: "浓郁咖喱，开胃下饭" },

    // === 西餐 ===
    { name: "牛排", category: "西餐", description: "鲜嫩多汁，品质优选" },
    { name: "披萨", category: "西餐", description: "芝士拉丝，料足味香" },
    { name: "意大利面", category: "西餐", description: "酱汁浓郁，面条劲道" },

    // === 粤式点心 ===
    { name: "早茶", category: "粤式点心", description: "一盅两件，悠闲时光" },
    { name: "虾饺", category: "粤式点心", description: "皮薄馅大，鲜嫩美味" },
    { name: "烧鹅", category: "粤式点心", description: "皮脆肉嫩，色泽金黄" },
    { name: "白切鸡", category: "粤式点心", description: "肉质鲜嫩，原汁原味" },
    { name: "肠粉", category: "粤式点心", description: "滑嫩爽口，酱汁香浓" },

    // === 小吃·夜宵 ===
    { name: "肉夹馍", category: "小吃夜宵", description: "陕西特色，肉香馍酥" },
    { name: "凉皮", category: "小吃夜宵", description: "爽滑筋道，酸辣可口" },
    { name: "臭豆腐", category: "小吃夜宵", description: "闻着臭吃着香" },
    { name: "章鱼小丸子", category: "小吃夜宵", description: "外酥内软，章鱼Q弹" },
    { name: "春卷", category: "小吃夜宵", description: "金黄酥脆，馅料丰富" },
    { name: "冬阴功", category: "小吃夜宵", description: "酸辣浓郁，泰式风情" },
    { name: "烤冷面", category: "小吃夜宵", description: "东北街头，酸甜筋道" },
    { name: "关东煮", category: "小吃夜宵", description: "暖胃汤物，丸串萝卜" },
    { name: "手抓饼", category: "小吃夜宵", description: "千层酥脆，街头小吃" },

    // === 甜品·饮品 ===
    { name: "奶茶", category: "甜品饮品", description: "香甜可口，解渴提神" },
    { name: "咖啡", category: "甜品饮品", description: "醇香浓郁，提神醒脑" },
    { name: "鲜榨果汁", category: "甜品饮品", description: "新鲜健康，营养丰富" },
    { name: "蛋糕", category: "甜品饮品", description: "松软香甜，幸福滋味" },
    { name: "冰淇淋", category: "甜品饮品", description: "冰凉香甜，消暑解馋" },
    { name: "双皮奶", category: "甜品饮品", description: "奶香浓郁，口感细腻" },
    { name: "杨枝甘露", category: "甜品饮品", description: "清甜爽口，果香四溢" },
    { name: "蛋挞", category: "甜品饮品", description: "酥皮蛋香，一口一个" },
    { name: "提拉米苏", category: "甜品饮品", description: "咖啡酒香，绵软醇厚" },
    { name: "糖葫芦", category: "甜品饮品", description: "酸甜可口，童年回忆" },

    // === 轻食简餐 ===
    { name: "沙拉", category: "轻食简餐", description: "新鲜蔬菜，健康低卡" },
    { name: "三明治", category: "轻食简餐", description: "营养均衡，方便快捷" },
    { name: "健身餐", category: "轻食简餐", description: "高蛋白低脂，健康美味" }
];

// 图片序号唯一事实来源：顺序必须与 generate_images.py / fetch_real_images.py 严格一致，
// food_XX.jpg 的 XX = 此数组下标+1。注意：「呷哺呷哺」已从菜单(foodData)移除，但其槽位
// 在此保留，以免删除后导致后续所有菜的图片序号整体前移、与已下载图片错位。
const IMAGE_ORDER = [
    "黄焖鸡米饭", "兰州拉面", "重庆小面", "麻辣烫", "麻辣香锅", "沙县小吃", "盖浇饭",
    "扬州炒饭", "煲仔饭", "东北饺子", "云吞面", "刀削面", "热干面", "酸辣粉", "烤鱼",
    "水煮鱼", "红烧肉", "宫保鸡丁", "回锅肉", "鱼香肉丝", "重庆火锅", "海底捞", "呷哺呷哺",
    "潮汕牛肉火锅", "烧烤", "羊肉串", "烤鸡翅", "烤茄子", "牛排", "意大利面", "披萨",
    "汉堡", "炸鸡", "薯条", "寿司", "拉面", "天妇罗", "烤肉", "石锅拌饭", "韩式炸鸡",
    "部队锅", "早茶", "虾饺", "烧鹅", "白切鸡", "肠粉", "奶茶", "咖啡", "鲜榨果汁",
    "蛋糕", "冰淇淋", "双皮奶", "杨枝甘露", "肉夹馍", "凉皮", "煎饼果子", "生煎包",
    "小笼包", "糖葫芦", "臭豆腐", "章鱼小丸子", "沙拉", "三明治", "健身餐", "粥品",
    // 新增菜品（槽位 66-77），顺序需与 fetch_real_images.py / generate_images.py 一致
    "螺蛳粉", "羊肉泡馍", "酸菜鱼", "麻婆豆腐", "北京烤鸭", "大盘鸡",
    "蛋挞", "春卷", "提拉米苏", "冬阴功", "越南河粉", "寿喜烧",
    // 第三批新增（槽位 78-92），顺序需与 fetch_real_images.py / generate_images.py 一致
    "卤肉饭", "照烧鸡饭", "炒面", "过桥米线", "干炒牛河", "冒菜", "鸡蛋灌饼",
    "梅菜扣肉", "鸡公煲", "小龙虾", "蛋包饭", "咖喱饭", "烤冷面", "关东煮", "手抓饼"
];

// 生成"带菜名的内联 SVG 卡片"作为兜底图。
// 关键：data URI 是零网络的，浏览器无需下载任何文件即可渲染——
// 因此即使真实照片（images_food/*.jpg）在国内手机上从 GitHub 拉不下来/超时，
// onerror 回退到这张 SVG 后，屏幕上永远立刻显示一张带菜名的彩色卡，绝不空白、绝不裂图。
const _fallbackPalette = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E2', '#F8B88B', '#FAD390', '#6C5CE7', '#A29BFE',
    '#FD79A8', '#FDCB6E', '#E17055', '#74B9FF', '#55EFC4', '#FF7675'
];
function _xmlEscape(s) {
    return String(s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function makeNameCard(name) {
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const bg = _fallbackPalette[h % _fallbackPalette.length];
    const text = _xmlEscape(name);
    const fontSize = name.length > 5 ? 44 : 56;
    // 注意：SVG 内不能出现单引号。encodeURIComponent 不编码单引号，残留的 ' 会截断
    // app.js 中 onerror="...src='<dataURI>'..." 的单引号属性，破坏回退。故字体名用双引号
    // （会被编码为 %22）且不加引号包裹字体族。
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">`
        + `<rect width="400" height="300" fill="${bg}"/>`
        + `<text x="200" y="135" font-size="56" text-anchor="middle" dominant-baseline="central">🍴</text>`
        + `<text x="200" y="215" font-size="${fontSize}" fill="#fff" font-weight="bold" `
        + `text-anchor="middle" dominant-baseline="central" `
        + `font-family="PingFang SC, Microsoft YaHei, sans-serif">${text}</text>`
        + `</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// 为每道菜绑定两层图片：
// ① food.image —— 本地真实成品照片 images_food/food_XX.jpg（由 fetch_real_images.py
//    从维基百科下载，词条主图即该菜真实成品，准确可靠、离线可用）；
// ② food.imageFallback —— 带菜名的内联 SVG 卡片（零网络，永不空白）。真实图缺失/加载失败时
//    由 app.js 的 onerror 自动回退，绝不裂图、绝不张冠李戴、国内手机也一定看得到。
foodData.forEach(food => {
    food.imageFallback = makeNameCard(food.name);
    const idx = IMAGE_ORDER.indexOf(food.name);
    if (idx === -1) {
        console.error(`[数据错误]「${food.name}」未在 IMAGE_ORDER 中登记，缺少图片。`);
        food.image = food.imageFallback;  // 没有真实图槽位，直接用名称卡
        return;
    }
    const nn = String(idx + 1).padStart(2, '0');
    food.image = `images_food/food_${nn}.jpg`;
});

// 完整性自检（仅控制台提示，不影响运行）。
(function validateFoodImages() {
    foodData.forEach(food => {
        if (IMAGE_ORDER.indexOf(food.name) === -1) {
            console.error(`[数据错误]「${food.name}」未在 IMAGE_ORDER 中登记。`);
        }
    });
    if (foodData.length > IMAGE_ORDER.length) {
        console.warn(`[数据提示] 菜品数(${foodData.length}) 超过图片登记数(${IMAGE_ORDER.length})，请补登 IMAGE_ORDER。`);
    }
})();

// 获取所有分类
const categories = [...new Set(foodData.map(food => food.category))];

// ============ 时段标签 ============
// 规则：所有菜默认适合午餐/晚餐；下面两份清单额外标注"也适合早餐"/"也适合夜宵"。
// 早餐时段转盘只出「早」清单，夜宵时段只出「夜」清单（app.js foodHasMeal）。
const MEAL_EXTRA = {
    早: [
        '粥品', '煎饼果子', '鸡蛋灌饼', '生煎包', '小笼包', '肠粉',
        '手抓饼', '早茶', '三明治', '蛋挞', '热干面', '咖啡'
    ],
    夜: [
        '烧烤', '羊肉串', '烤鸡翅', '烤茄子', '小龙虾', '麻辣烫', '冒菜',
        '麻辣香锅', '重庆火锅', '海底捞', '潮汕牛肉火锅', '鸡公煲', '烤鱼',
        '炸鸡', '韩式炸鸡', '汉堡', '薯条', '关东煮', '臭豆腐', '烤冷面',
        '螺蛳粉', '酸辣粉', '章鱼小丸子', '手抓饼', '煎饼果子', '肉夹馍',
        '东北饺子', '粥品', '奶茶'
    ]
};

// 颜色配置（用于转盘扇区）。精选 16 色：全部为中等明度、白字可读的饱和色，
// 相邻色相互相错开；不含浅灰/淡色（曾出现白字看不清的问题）。
const wheelColors = [
    '#F05D5E', '#12A5A5', '#E8960C', '#3E7CB1',
    '#D9538C', '#47A25A', '#8A64D6', '#ED7846',
    '#3193C4', '#C94277', '#7C9F3F', '#B3703E',
    '#5C6BC0', '#DB5A42', '#2FA48A', '#A85CC4'
];

// ============ 商业化配置 ============
// ① 外卖联盟返佣（CPS）：注册美团联盟(union.meituan.com)/淘宝联盟(饿了么)后，
//    把生成的 H5 推广链接填进来——用户经这些链接领券下单可获返佣。
//    留空则自动走普通链接，产品体验完全一致。
const AFFILIATE = {
    meituanCoupon: '',   // 例：美团联盟生成的外卖红包推广 H5 链接
    elemeCoupon: ''      // 例：淘宝联盟生成的饿了么吃货红包推广链接
};

// ② 本地商家推广位：谈到合作商家后填入即可在转盘页展示（自动带"推广"标识）；
//    保持 null 则完全不渲染。
const SPONSOR = null;
// 示例：
// const SPONSOR = {
//     name: '老王烤肉·大学城店',
//     desc: '到店出示本页立减 10 元',
//     cta: '去看看',
//     url: 'https://example.com/shop'
// };
