// 高德开放平台 Web服务(REST) Key —— 用于"附近美食"按坐标搜周边真实餐饮店。
// 该接口返回 Access-Control-Allow-Origin:*，纯前端可直接跨域调用，无需后端。
// 此类 Web 服务 key 本就写在前端、属公开可见，非敏感密钥。
const AMAP_KEY = 'a6efe2e85bc9027cf51d72e3a20ff9da';

// 安全读取 localStorage（数据损坏时不会导致应用崩溃白屏）
function loadStored(key) {
    try {
        return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
        console.warn(`读取 ${key} 失败，数据可能已损坏，已重置：`, e);
        localStorage.removeItem(key);
        return [];
    }
}

// 应用状态
const state = {
    currentTab: 'wheel',
    selectedCategories: [],
    favorites: loadStored('favorites'),
    history: loadStored('history'),
    isSpinning: false,
    currentResult: null,
    avoidRepeat: localStorage.getItem('avoidRepeat') === '1',
    fatigueDecay: localStorage.getItem('fatigueDecay') !== '0',  // 吃腻衰减，默认开
    mealFilter: 'all',  // 时段筛选：早/午/晚/夜/all，进入页面时按当前时间自动定
    lastResultName: null,
    soundOn: localStorage.getItem('soundOn') !== '0',  // 默认开
    weather: null,  // 天气 {tempC, kind: 'rain'|'hot'|'cold'|'mild', text}，定位后拉取
    location: null,  // 用户位置 {latitude, longitude, city}，由"附近美食"定位后填充
    nearbyPlaces: [],  // 定位后从地图拉取的真实附近餐饮店（整合进转盘/列表）
    useNearby: false,  // true=转盘/列表用"附近真实店铺"，false=用内置菜单
    nearbyLevel: parseInt(localStorage.getItem('nearbyLevel'), 10) || 1  // 附近抽取档位 1/2/3
};

// DOM 元素
let canvas, ctx, spinBtn, resultCard;

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    mergeCustomFoods();   // 先合并自定义菜单，分类筛选才能包含自定义分类
    initTabs();
    initFilters();
    initMealFilter();
    initWheel();
    initListPage();
    initFavoritesPage();
    initHistoryPage();
    initThemeToggle();
    initSoundToggle();
    initAudioUnlock();
    initTodayPick();
    initSponsor();
    initAvoidRepeat();
    initFatigueDecay();
    initTournament();
    initCustomMenu();
    initNearby();
    initShakeDetection();
    registerServiceWorker();
    updateUI();
});

// 初始化 DOM 元素
function initElements() {
    canvas = document.getElementById('wheel-canvas');
    ctx = canvas.getContext('2d');
    spinBtn = document.getElementById('spin-btn');
    resultCard = document.getElementById('result-card');
}

// 初始化标签页
function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

// 切换标签页
function switchTab(tabName) {
    state.currentTab = tabName;

    // 更新按钮状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // 更新内容区域
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });

    // 刷新对应页面
    if (tabName === 'favorites') {
        initFavoritesPage();
    } else if (tabName === 'history') {
        initHistoryPage();
    }
}

// 初始化筛选器
function initFilters() {
    renderFilterChips();

    // "全部"复选框
    const filterAll = document.getElementById('filter-all');
    filterAll.addEventListener('change', () => {
        if (filterAll.checked) {
            state.selectedCategories = [];
            document.querySelectorAll('.filter-chip input').forEach(input => {
                input.checked = false;
                input.closest('.filter-chip').classList.remove('active');
            });
            drawWheel();
            updateWheelCount();
        }
    });
}

// 渲染分类筹码（自定义菜单变化后可重复调用）
function renderFilterChips() {
    const filterChips = document.getElementById('filter-chips');
    const filterAll = document.getElementById('filter-all');
    filterChips.innerHTML = '';

    categories.forEach(category => {
        const chip = document.createElement('label');
        chip.className = 'filter-chip';
        chip.innerHTML = `
            <input type="checkbox" value="${category}" style="display: none;">
            ${category}
        `;

        chip.addEventListener('click', (e) => {
            e.preventDefault();
            const input = chip.querySelector('input');
            input.checked = !input.checked;
            chip.classList.toggle('active');

            updateSelectedCategories();
            drawWheel();
            updateWheelCount();

            // 如果有选中的分类，取消"全部"选择
            if (state.selectedCategories.length > 0) {
                filterAll.checked = false;
            }
        });

        filterChips.appendChild(chip);
    });
}

// 更新选中的分类
function updateSelectedCategories() {
    state.selectedCategories = Array.from(
        document.querySelectorAll('.filter-chip input:checked')
    ).map(input => input.value);

    // 如果没有选中任何分类，自动选中"全部"
    const filterAll = document.getElementById('filter-all');
    if (state.selectedCategories.length === 0) {
        filterAll.checked = true;
    }
}

// 当前生效的数据集：附近模式用真实店铺，否则用内置菜单
function getActiveDataset() {
    return state.useNearby ? state.nearbyPlaces : foodData;
}

// 获取筛选后的美食列表（附近模式不分类不分时段，直接返回全部附近店铺）
function getFilteredFoods() {
    if (state.useNearby) {
        return state.nearbyPlaces;
    }
    let foods = foodData;
    if (state.mealFilter && state.mealFilter !== 'all') {
        foods = foods.filter(food => foodHasMeal(food, state.mealFilter));
    }
    if (state.selectedCategories.length > 0) {
        foods = foods.filter(food => state.selectedCategories.includes(food.category));
    }
    return foods;
}

// ============ 时段感知候选池 ============
// 早上打开只出早餐、深夜只出夜宵：所有菜默认适合午/晚，
// 早餐/夜宵按 data.js 的 MEAL_EXTRA 清单收窄。可手动切换或选"不限"。
const MEAL_DEFS = [
    { key: '早', label: '早餐' },
    { key: '午', label: '午餐' },
    { key: '晚', label: '晚餐' },
    { key: '夜', label: '夜宵' },
    { key: 'all', label: '不限' }
];

function currentMealKey() {
    const h = new Date().getHours();
    if (h >= 5 && h < 10) return '早';
    if (h >= 10 && h < 16) return '午';
    if (h >= 16 && h < 21) return '晚';
    return '夜';
}

function foodHasMeal(food, meal) {
    if (meal === '午' || meal === '晚') return true;   // 全部菜默认适合正餐
    const list = typeof MEAL_EXTRA === 'object' ? MEAL_EXTRA[meal] : null;
    return Array.isArray(list) && list.includes(food.name);
}

function initMealFilter() {
    const wrap = document.getElementById('meal-chips');
    if (!wrap) return;
    state.mealFilter = currentMealKey();   // 打开页面即按当前时间智能筛选

    wrap.innerHTML = MEAL_DEFS.map(m =>
        `<button type="button" class="filter-chip meal-chip" data-meal="${m.key}">${m.label}</button>`
    ).join('');

    wrap.querySelectorAll('.meal-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            state.mealFilter = btn.dataset.meal;
            renderMealFilter();
            drawWheel();
            updateWheelCount();
        });
    });
    renderMealFilter();
}

function renderMealFilter() {
    const wrap = document.getElementById('meal-chips');
    const caption = document.getElementById('meal-caption');
    if (!wrap) return;
    wrap.querySelectorAll('.meal-chip').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.meal === state.mealFilter));
    if (caption) {
        const now = MEAL_DEFS.find(m => m.key === currentMealKey());
        const sel = MEAL_DEFS.find(m => m.key === state.mealFilter);
        caption.textContent = state.mealFilter === 'all'
            ? '时段 · 不限，全部菜品参与'
            : (state.mealFilter === currentMealKey()
                ? `时段 · 现在是${now.label}时间，已智能筛选`
                : `时段 · 手动锁定${sel.label}候选`);
    }
}

// 初始化转盘
function initWheel() {
    drawWheel();   // 画布尺寸由 drawWheel 按 devicePixelRatio 自适应

    // 绑定抽取按钮
    spinBtn.addEventListener('click', spinWheel);

    updateWheelCount();
}

// 更新"当前参与抽取的菜品数量"
function updateWheelCount() {
    const el = document.getElementById('wheel-count');
    if (!el) return;
    const n = getFilteredFoods().length;
    el.textContent = state.useNearby
        ? `附近 ${n} 家店参与抽取`
        : `当前 ${n} 道菜参与抽取`;
}

// 当前转盘上对应的美食列表（抽取时锁定，保证指针与结果一致）
let wheelFoods = [];

// ============ 转盘渲染（离屏缓存 + 高清适配）============
// 性能关键：旋转动画每帧只做「清屏 → 旋转 → 贴一张预渲染好的转盘位图」，
// 扇区/文字/装饰只在菜品列表变化时重画一次（附近模式 360 家店时收益巨大）。
// 同时按 devicePixelRatio 放大画布物理分辨率，手机上文字与边缘不再发虚。
let wheelCache = null;      // 预渲染好的转盘离屏画布
let wheelCacheKey = '';     // 缓存签名：菜品列表或 dpr 变了才重建

const WHEEL_SIZE = 300;     // 逻辑尺寸（CSS 像素），与 .wheel-wrapper 一致

function wheelDpr() {
    return Math.min(window.devicePixelRatio || 1, 3);
}

// 绘制转盘（rotation 为整体旋转角度，单位弧度）
function drawWheel(rotation = 0) {
    const foods = getFilteredFoods();
    wheelFoods = foods;
    const dpr = wheelDpr();
    const px = WHEEL_SIZE * dpr;
    if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
    }

    // 签名带上全部菜名：筛选变化/附近店铺更新都会触发重建
    const key = dpr + '|' + foods.length + '|' + foods.map(f => f.name).join('¦');
    if (!wheelCache || wheelCacheKey !== key) {
        wheelCache = buildWheelCache(foods, dpr);
        wheelCacheKey = key;
    }

    // 在未变换的坐标系中清空整个画布（避免旋转后清不干净产生重影）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);

    ctx.save();
    ctx.translate(px / 2, px / 2);
    ctx.rotate(rotation);
    ctx.drawImage(wheelCache, -px / 2, -px / 2);
    ctx.restore();

    drawWheelHub(dpr);              // 中心按钮不随转动
    drawWheelPointer(dpr, rotation); // 指针画在画布内：跨浏览器渲染一致，绝不残缺
}

// 预渲染整个转盘（深色外圈 + 灯珠 + 扇区 + 光影 + 菜名）到离屏画布
function buildWheelCache(foods, dpr) {
    const off = document.createElement('canvas');
    off.width = off.height = WHEEL_SIZE * dpr;
    const c = off.getContext('2d');
    c.scale(dpr, dpr);

    const cx = WHEEL_SIZE / 2;
    const cy = WHEEL_SIZE / 2;
    const rimR = WHEEL_SIZE / 2 - 5;   // 深色外圈半径
    const R = rimR - 13;               // 彩色扇区半径
    const n = foods.length;

    // ① 深色底盘（奖轮质感的外圈）
    c.beginPath();
    c.arc(cx, cy, rimR, 0, 2 * Math.PI);
    c.fillStyle = '#261F1A';
    c.fill();

    if (n > 0) {
        const arc = (2 * Math.PI) / n;

        // ② 彩色扇区
        foods.forEach((food, i) => {
            const start = i * arc - Math.PI / 2;
            c.beginPath();
            c.moveTo(cx, cy);
            c.arc(cx, cy, R, start, start + arc);
            c.closePath();
            c.fillStyle = wheelColors[i % wheelColors.length];
            c.fill();
        });

        // ③ 中心高光 + 边缘暗角：一次性整盘叠加出立体感（比逐扇区渐变省得多）
        const shade = c.createRadialGradient(cx, cy, 0, cx, cy, R);
        shade.addColorStop(0, 'rgba(255, 255, 255, 0.20)');
        shade.addColorStop(0.55, 'rgba(255, 255, 255, 0.05)');
        shade.addColorStop(0.85, 'rgba(0, 0, 0, 0)');
        shade.addColorStop(1, 'rgba(0, 0, 0, 0.10)');
        c.beginPath();
        c.arc(cx, cy, R, 0, 2 * Math.PI);
        c.fillStyle = shade;
        c.fill();

        // ④ 扇区分隔线（店太多时细线会糊成一片，仅 ≤60 格时绘制）
        if (n > 1 && n <= 60) {
            c.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            c.lineWidth = 1.5;
            for (let i = 0; i < n; i++) {
                const a = i * arc - Math.PI / 2;
                c.beginPath();
                c.moveTo(cx, cy);
                c.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
                c.stroke();
            }
        }

        // 扇区外描边
        c.beginPath();
        c.arc(cx, cy, R, 0, 2 * Math.PI);
        c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        c.lineWidth = 2;
        c.stroke();

        // ⑤ 菜名/店名：按格数分级排版——格越多名字越短、越贴外圈，
        //    保证任何档位都不会挤成一团噪点；>60 格只显示干净色带
        if (n <= 60) {
            let fontSize, maxChars, edge, maxW;
            if (n <= 16) {
                fontSize = 13;   maxChars = Infinity; edge = 10; maxW = R - 48;
            } else if (n <= 40) {
                fontSize = 11;   maxChars = 6;        edge = 10; maxW = 66;
            } else {
                fontSize = 9.5;  maxChars = 4;        edge = 8;  maxW = 42;
            }
            c.fillStyle = 'white';
            c.font = `bold ${fontSize}px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
            c.textAlign = 'right';
            c.textBaseline = 'middle';
            c.shadowColor = 'rgba(0, 0, 0, 0.45)';
            c.shadowBlur = 3;
            foods.forEach((food, i) => {
                let label = String(food.name);
                if (label.length > maxChars) label = label.slice(0, maxChars);
                c.save();
                c.translate(cx, cy);
                c.rotate(i * arc + arc / 2 - Math.PI / 2);
                c.fillText(label, R - edge, 0, maxW);
                c.restore();
            });
            c.shadowBlur = 0;
        }
    }

    // ⑥ 金色细环穿过灯珠 + 外圈灯珠（金白交替，奖轮氛围）
    c.beginPath();
    c.arc(cx, cy, rimR - 6.5, 0, 2 * Math.PI);
    c.strokeStyle = 'rgba(255, 213, 132, 0.28)';
    c.lineWidth = 1;
    c.stroke();
    const dots = 28;
    for (let i = 0; i < dots; i++) {
        const a = (i / dots) * 2 * Math.PI;
        c.beginPath();
        c.arc(cx + (rimR - 6.5) * Math.cos(a), cy + (rimR - 6.5) * Math.sin(a), 2.4, 0, 2 * Math.PI);
        c.fillStyle = i % 2 === 0 ? '#FFD584' : 'rgba(255, 255, 255, 0.85)';
        c.fill();
    }

    return off;
}

// 中心按钮（固定不转）：白圈 + 品牌渐变芯 + 餐具符号
function drawWheelHub(dpr) {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = WHEEL_SIZE / 2;
    const cy = WHEEL_SIZE / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, 31, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    const g = ctx.createLinearGradient(cx - 26, cy - 26, cx + 26, cy + 26);
    g.addColorStop(0, '#FF8A4C');
    g.addColorStop(1, '#D92667');
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, 2 * Math.PI);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.font = '22px -apple-system, "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍴', cx, cy + 1);
    ctx.restore();
}

// 顶部指针（画在画布内的泪滴形拨片）。
// 之前用 HTML+clip-path 叠加层，部分浏览器渲染残缺且易与上方文字相撞；
// 画进 Canvas 后跨浏览器像素一致，还能做"划过格子被踢一下"的拨片物理。
function drawWheelPointer(dpr, rotation) {
    const n = wheelFoods.length;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = WHEEL_SIZE / 2;

    // 拨片物理：转动中每划过一格边界被"踢"向行进方向，随后在 1/3 格内回正
    let tilt = 0;
    if (n > 1 && state.isSpinning) {
        const arc = (2 * Math.PI) / n;
        const phase = (((rotation % arc) + arc) % arc) / arc;   // 当前格内相位 0..1
        tilt = 0.30 * Math.max(0, 1 - phase * 3);
    }
    ctx.translate(cx, 7);
    ctx.rotate(tilt);
    ctx.translate(-cx, -7);

    // 泪滴针形：上半圆鼓包 + 收尖深入扇区
    const path = () => {
        ctx.beginPath();
        ctx.arc(cx, 15, 11.5, Math.PI * 0.78, Math.PI * 0.22, false);
        ctx.lineTo(cx, 44);
        ctx.closePath();
    };

    // ① 投影
    path();
    ctx.shadowColor = 'rgba(60, 10, 20, 0.35)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#E42A47';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // ② 暗色发丝外轮廓（把白边从浅色扇区里衬出来）
    path();
    ctx.strokeStyle = 'rgba(60, 10, 20, 0.30)';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // ③ 白描边
    path();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // ④ 渐变本体
    path();
    const g = ctx.createLinearGradient(0, 3, 0, 44);
    g.addColorStop(0, '#FF7A45');
    g.addColorStop(1, '#E01F3D');
    ctx.fillStyle = g;
    ctx.fill();

    // ⑤ 顶部高光点
    ctx.beginPath();
    ctx.arc(cx, 13.5, 3.8, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fill();

    ctx.restore();
}

// ============ 吃腻衰减：最近吃过的降权 ============
// 近 7 天抽中过的菜按"距今越近权重越低"衰减：当天仅 15% 权重，随时间
// 线性恢复，第 7 天回到 100%。只影响抽中概率，转盘外观与格子大小不变。
const FATIGUE_WINDOW = 7 * 24 * 60 * 60 * 1000;

function foodWeight(name) {
    if (!state.fatigueDecay) return 1;
    let latest = 0;
    for (const h of state.history) {
        if (h.name === name && h.timestamp > latest) latest = h.timestamp;
    }
    if (!latest) return 1;
    const age = Date.now() - latest;
    if (age >= FATIGUE_WINDOW) return 1;
    return 0.15 + 0.85 * (age / FATIGUE_WINDOW);
}

// 按权重随机挑一个下标（权重全相等时退化为均匀随机）。
// 总权重 = 吃腻衰减 × 天气加成。
function weightedPick(foods) {
    let total = 0;
    const weights = foods.map(f => {
        const w = foodWeight(f.name) * weatherBoost(f);
        total += w;
        return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
    }
    return weights.length - 1;
}

// ============ 天气联动推荐 ============
// 定位成功后从 Open-Meteo（免密钥、支持跨域）拉当前气温与天气码：
// 雨雪天热汤/火锅类权重 ×1.6，高温天(≥30℃)冷食轻食 ×1.6，寒冷天(≤8℃)炖煮热食 ×1.6。
// 只影响概率，用户无感知负担；拉不到天气就静默跳过。
const WEATHER_RULES = {
    rain: { re: /火锅|拉面|米线|泡馍|冒菜|麻辣烫|粥|汤|面馆|饺子|馄饨|煲/, label: '热汤热食↑' },
    hot:  { re: /凉皮|冷面|沙拉|寿司|冰|凉|轻食|甜品|饮品|果汁|奶茶/, label: '清爽冷食↑' },
    cold: { re: /火锅|炖|煲|汤|泡馍|冒菜|烤肉|羊肉|麻辣烫/, label: '暖身热食↑' }
};

function weatherBoost(food) {
    const w = state.weather;
    if (!w || w.kind === 'mild') return 1;
    const rule = WEATHER_RULES[w.kind];
    if (!rule) return 1;
    const text = `${food.name || ''} ${food.category || ''} ${food.sourceType || ''}`;
    return rule.re.test(text) ? 1.6 : 1;
}

// WMO 天气码 → 中文描述 + 图标键
function weatherCodeInfo(code) {
    if (code === 0) return { desc: '晴', icon: 'sun' };
    if (code === 1) return { desc: '基本晴', icon: 'sun' };
    if (code === 2) return { desc: '多云', icon: 'suncloud' };
    if (code === 3) return { desc: '阴', icon: 'cloud' };
    if (code === 45 || code === 48) return { desc: '雾', icon: 'fog' };
    if (code >= 51 && code <= 57) return { desc: '毛毛雨', icon: 'drizzle' };
    if (code >= 61 && code <= 65) return { desc: '雨', icon: 'rain' };
    if (code === 66 || code === 67) return { desc: '冻雨', icon: 'rain' };
    if (code >= 71 && code <= 77) return { desc: '雪', icon: 'snow' };
    if (code >= 80 && code <= 82) return { desc: '阵雨', icon: 'rain' };
    if (code === 85 || code === 86) return { desc: '阵雪', icon: 'snow' };
    if (code >= 95) return { desc: '雷阵雨', icon: 'thunder' };
    return { desc: '多云', icon: 'cloud' };
}

// 与整站同语言的线性天气图标（stroke 跟随文字色）
const WEATHER_ICONS = {
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/></svg>',
    suncloud: '<svg viewBox="0 0 24 24"><path d="M5.3 9.8a4 4 0 1 1 7-3.2M2.9 6.4l1.5.6M9.2 1.9l-.6 1.5"/><path d="M8 20h8.6a3.4 3.4 0 0 0 .5-6.8A5 5 0 0 0 7.5 14 3 3 0 0 0 8 20z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M6.5 19h10.1a3.9 3.9 0 0 0 .5-7.8A6 6 0 0 0 5.5 13 3 3 0 0 0 6.5 19z"/></svg>',
    fog: '<svg viewBox="0 0 24 24"><path d="M6.5 12h10.1a3.9 3.9 0 0 0 .5-7.8A6 6 0 0 0 5.5 6"/><path d="M4 16h16M6 19.5h12"/></svg>',
    drizzle: '<svg viewBox="0 0 24 24"><path d="M6.5 14h10.1a3.9 3.9 0 0 0 .5-7.8A6 6 0 0 0 5.5 8 3 3 0 0 0 6.5 14z"/><path d="M9 17.5v1.5M13 17.5v1.5M11 20.5V22"/></svg>',
    rain: '<svg viewBox="0 0 24 24"><path d="M6.5 13h10.1a3.9 3.9 0 0 0 .5-7.8A6 6 0 0 0 5.5 7 3 3 0 0 0 6.5 13z"/><path d="M8.5 16l-1 4M12.5 16l-1 4M16.5 16l-1 4"/></svg>',
    snow: '<svg viewBox="0 0 24 24"><path d="M6.5 13h10.1a3.9 3.9 0 0 0 .5-7.8A6 6 0 0 0 5.5 7 3 3 0 0 0 6.5 13z"/><path d="M8.5 17.2h.01M12 19.4h.01M15.5 17.2h.01M10 21.4h.01M14 21.4h.01"/></svg>',
    thunder: '<svg viewBox="0 0 24 24"><path d="M6.5 13h10.1a3.9 3.9 0 0 0 .5-7.8A6 6 0 0 0 5.5 7 3 3 0 0 0 6.5 13z"/><path d="M12.5 14.5L10 18.5h3l-1.8 3.8"/></svg>'
};

const ICON_PIN_SMALL = '<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.2-6.5-9.8a6.5 6.5 0 0 1 13 0C18.5 15.8 12 21 12 21z"/><circle cx="12" cy="11" r="2.4"/></svg>';

function fetchWeather(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
        + `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    fetch(url, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(d => {
            const cur = d && d.current;
            if (!cur || typeof cur.temperature_2m !== 'number') return;
            const t = cur.temperature_2m;
            const code = cur.weather_code || 0;
            const raining = (code >= 51 && code <= 67) || (code >= 71 && code <= 77)
                || (code >= 80 && code <= 86) || code >= 95;
            let kind = 'mild';
            if (raining) kind = 'rain';
            else if (t >= 30) kind = 'hot';
            else if (t <= 8) kind = 'cold';
            const info = weatherCodeInfo(code);
            state.weather = {
                tempC: Math.round(t),
                feelsC: typeof cur.apparent_temperature === 'number' ? Math.round(cur.apparent_temperature) : null,
                wind: typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : null,
                kind,
                desc: info.desc,
                icon: info.icon
            };
            renderNearbyMeta();
        })
        .catch(() => { /* 天气拉取失败不影响主流程 */ })
        .finally(() => clearTimeout(timer));
}

// "附近美食"卡的信息行：定位（城市·区域）+ 天气（图标 描述 气温 体感 风）+ 推荐加成
function renderNearbyMeta() {
    const el = document.getElementById('nearby-meta');
    if (!el) return;
    const parts = [];
    if (state.location && state.location.city) {
        parts.push(`<span class="meta-item meta-loc">${ICON_PIN_SMALL}${escapeHtml(state.location.city)}</span>`);
    }
    const w = state.weather;
    if (w) {
        const feels = (typeof w.feelsC === 'number' && Math.abs(w.feelsC - w.tempC) >= 2)
            ? `（体感 ${w.feelsC}℃）` : '';
        const wind = (typeof w.wind === 'number' && w.wind >= 12)
            ? ` · 风 ${Math.round(w.wind)}km/h` : '';
        const boost = (w.kind !== 'mild' && WEATHER_RULES[w.kind])
            ? `<span class="meta-boost">${WEATHER_RULES[w.kind].label}</span>` : '';
        parts.push(`<span class="meta-item wx-${w.icon}">${WEATHER_ICONS[w.icon] || ''}`
            + `${w.desc} ${w.tempC}℃${feels}${wind}</span>${boost}`);
    }
    el.innerHTML = parts.join('');
    el.style.display = parts.length ? 'flex' : 'none';
}

// 转盘旋转动画
function spinWheel() {
    if (state.isSpinning) return;

    const foods = getFilteredFoods();
    if (foods.length === 0) {
        showToast('当前筛选下没有可抽的菜，试试换个时段或分类');
        return;
    }

    state.isSpinning = true;
    spinBtn.disabled = true;
    spinBtn.querySelector('span').textContent = '抽取中...';
    resultCard.style.display = 'none';

    // 按吃腻衰减权重随机选择（老没吃的更容易被抽中）
    let selectedIndex = weightedPick(foods);
    // 避免连续重复：与上次结果相同则重选（多于一道菜时才有意义）
    if (state.avoidRepeat && foods.length > 1) {
        let guard = 0;
        while (foods[selectedIndex].name === state.lastResultName && guard < 20) {
            selectedIndex = weightedPick(foods);
            guard++;
        }
    }
    const selectedFood = foods[selectedIndex];

    // 指针固定在正上方（canvas 角度 -π/2）。
    // 扇形 index 中线的初始角度为 index*arcAngle + arcAngle/2 - π/2。
    // 要让选中扇形中线转到指针处，需满足：rotation ≡ 2π - targetAngle (mod 2π)
    const arcAngle = (2 * Math.PI) / foods.length;
    const targetAngle = selectedIndex * arcAngle + arcAngle / 2;

    // 关键修复：圈数必须是整数，否则落点会偏移导致指针与结果不一致
    const spins = Math.floor(5 + Math.random() * 4); // 5~8 整圈
    const finalRotation = spins * 2 * Math.PI + (2 * Math.PI - targetAngle);
    const duration = 3500;

    let startTime = null;
    let lastTickSector = -1;
    let lastTickTime = 0;

    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 缓出动画
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const rotation = finalRotation * easeOut;
        drawWheel(rotation);

        // 经过一个扇格就播一声"滴答"，并限频避免开头太密
        const sector = Math.floor(rotation / arcAngle);
        if (sector !== lastTickSector) {
            lastTickSector = sector;
            if (timestamp - lastTickTime > 45) {
                lastTickTime = timestamp;
                playTick();
            }
        }

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // 落定余震：像真实奖轮一样带一点阻尼回摆（振幅不超过 1/4 扇区，
            // 绝不会摆进邻格），结束后精确停在目标角度，确保指针对准选中扇形
            const settleAmp = Math.min(0.014, arcAngle * 0.25);
            const baseRotation = finalRotation % (2 * Math.PI);
            let settleStart = null;
            function settle(ts) {
                if (settleStart === null) settleStart = ts;
                const k = Math.min((ts - settleStart) / 300, 1);
                const wobble = Math.sin(k * Math.PI * 2.5) * (1 - k) * settleAmp;
                drawWheel(baseRotation + wobble);
                if (k < 1) {
                    requestAnimationFrame(settle);
                } else {
                    drawWheel(baseRotation);
                    finishSpin(selectedFood);
                }
            }
            requestAnimationFrame(settle);
        }
    }

    requestAnimationFrame(animate);
}

// 完成抽取
function finishSpin(food) {
    state.isSpinning = false;
    state.currentResult = food;
    state.lastResultName = food.name;
    spinBtn.disabled = false;
    spinBtn.querySelector('span').textContent = '开始抽取';

    playDing();
    celebrate();

    // 添加到历史记录
    addToHistory(food);

    // 抽中时震动反馈（支持的移动端）
    if (navigator.vibrate) {
        navigator.vibrate([60, 40, 120]);
    }

    // 显示结果（不重绘转盘，保持指针停留的位置）
    showResult(food);
}

// ============ 抽中庆祝：彩带粒子（Canvas 覆盖层，零依赖）============
let confettiCanvas = null;
let confettiCtx = null;
let confettiRAF = 0;

function celebrate() {
    // 尊重系统"减弱动态效果"设置
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if (!confettiCanvas) {
        confettiCanvas = document.createElement('canvas');
        confettiCanvas.style.cssText =
            'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:999;';
        document.body.appendChild(confettiCanvas);
        confettiCtx = confettiCanvas.getContext('2d');
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    confettiCanvas.width = window.innerWidth * dpr;
    confettiCanvas.height = window.innerHeight * dpr;
    confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 喷射源：转盘中心（可见时），否则屏幕上 1/3 处
    let ox = window.innerWidth / 2;
    let oy = window.innerHeight * 0.35;
    const wrap = document.querySelector('.wheel-wrapper');
    if (wrap && state.currentTab === 'wheel') {
        const r = wrap.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) {
            ox = r.left + r.width / 2;
            oy = r.top + r.height / 2;
        }
    }

    const colors = ['#FF8A4C', '#F0435A', '#FFD584', '#12A5A5', '#3E7CB1', '#D9538C', '#47A25A', '#FFFFFF'];
    const parts = [];
    for (let i = 0; i < 80; i++) {
        const ang = Math.random() * 2 * Math.PI;
        const speed = 4 + Math.random() * 7;
        parts.push({
            x: ox, y: oy,
            vx: Math.cos(ang) * speed,
            vy: Math.sin(ang) * speed - 3,     // 整体略向上抛
            w: 5 + Math.random() * 5,
            h: 3 + Math.random() * 4,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.3,
            color: colors[i % colors.length],
            life: 0,
            ttl: 70 + Math.random() * 40
        });
    }

    cancelAnimationFrame(confettiRAF);
    function tick() {
        confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        let alive = false;
        parts.forEach(p => {
            if (p.life >= p.ttl) return;
            alive = true;
            p.life++;
            p.vy += 0.18;                       // 重力
            p.vx *= 0.985;
            p.vy *= 0.985;
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vr;
            confettiCtx.save();
            confettiCtx.translate(p.x, p.y);
            confettiCtx.rotate(p.rot);
            confettiCtx.globalAlpha = 1 - p.life / p.ttl;
            confettiCtx.fillStyle = p.color;
            confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            confettiCtx.restore();
        });
        if (alive) {
            confettiRAF = requestAnimationFrame(tick);
        } else {
            confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        }
    }
    confettiRAF = requestAnimationFrame(tick);
}

// 显示结果
function showResult(food) {
    // 结果图同样"先卡片、后台升级真照"：手机上立刻有内容，绝不空白
    const img = document.getElementById('result-image');
    let card = food.imageFallback || '';
    if (!card.startsWith('data:') && typeof makeNameCard === 'function') card = makeNameCard(food.name);
    img.onerror = null;
    img.src = card;
    if (food.image && food.image !== card) {
        const pre = new Image();
        const timer = setTimeout(() => { pre.onload = pre.onerror = null; }, 8000);
        pre.onload = () => { clearTimeout(timer); img.src = food.image; };
        pre.onerror = () => { clearTimeout(timer); };
        pre.src = food.image;
    }
    document.getElementById('result-name').textContent = food.name;
    document.getElementById('result-category').textContent = food.category;
    document.getElementById('result-description').textContent = food.description || '';

    resultCard.style.display = 'block';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // 更新收藏按钮状态
    const favBtn = document.getElementById('add-favorite-btn');
    const isFavorite = state.favorites.some(f => f.name === food.name);
    favBtn.textContent = isFavorite ? '💖 已收藏' : '⭐ 收藏';
    favBtn.onclick = () => toggleFavorite(food);

    // 再抽一次按钮
    document.getElementById('spin-again-btn').onclick = spinWheel;

    // 分享/复制结果
    document.getElementById('share-btn').onclick = () => shareResult(food);

    // 去外卖平台下单。附近店额外给「换词」和「美团附近」兜底，避免店名搜不到后卡住。
    setupDeliveryActions(food);
}

// 把文字复制到剪贴板，返回 Promise
function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); resolve(); } catch (e) { reject(e); }
        document.body.removeChild(ta);
    });
}

// ============ 结果分享卡片（Canvas 合成图片，可存相册/发群） ============
// 生成 750×980 的品牌分享图：渐变底 + 白卡 + 菜品大图 + 菜名 + 日期 + 站点署名。
// 跨域店铺照片若不支持 CORS 会污染画布导致导出失败，因此加载失败/超时一律
// 回退到零网络的 SVG 名片（data URI 不污染画布），保证任何情况都能出图。
function loadCardImage(food) {
    return new Promise(resolve => {
        const fallback = () => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = (food.imageFallback && food.imageFallback.startsWith('data:'))
                ? food.imageFallback : makeNameCard(food.name);
        };
        const src = food.image || '';
        if (!src || src.startsWith('data:')) { fallback(); return; }
        const img = new Image();
        if (/^https?:/i.test(src) && src.indexOf(location.origin) !== 0) {
            img.crossOrigin = 'anonymous';   // 跨域照片必须 CORS 加载才能导出
        }
        const timer = setTimeout(() => { img.onload = img.onerror = null; fallback(); }, 6000);
        img.onload = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); fallback(); };
        img.src = src;
    });
}

function roundedPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

function buildShareCard(food, img) {
    const W = 750, H = 980;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const FONT = "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";

    // 渐变底
    const bg = c.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#FF8A4C');
    bg.addColorStop(0.58, '#F0435A');
    bg.addColorStop(1, '#D92667');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    // 顶部品牌
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.font = `bold 40px ${FONT}`;
    c.textAlign = 'center';
    c.fillText('今天吃什么', W / 2, 78);
    c.font = `24px ${FONT}`;
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText('让转盘帮你决定', W / 2, 116);

    // 白卡
    roundedPath(c, 45, 150, W - 90, 730, 36);
    c.fillStyle = '#FFFFFF';
    c.shadowColor = 'rgba(60,10,20,0.30)';
    c.shadowBlur = 30;
    c.shadowOffsetY = 12;
    c.fill();
    c.shadowColor = 'transparent';
    c.shadowBlur = 0;
    c.shadowOffsetY = 0;

    // 菜品图（等比裁切铺满）
    c.save();
    roundedPath(c, 75, 180, W - 150, 380, 24);
    c.clip();
    const iw = img.width || 400, ih = img.height || 300;
    const scale = Math.max((W - 150) / iw, 380 / ih);
    const dw = iw * scale, dh = ih * scale;
    c.drawImage(img, 75 + (W - 150 - dw) / 2, 180 + (380 - dh) / 2, dw, dh);
    c.restore();

    // 文案
    c.fillStyle = '#A39B8F';
    c.font = `26px ${FONT}`;
    c.fillText('· 今日抽中 ·', W / 2, 628);
    c.fillStyle = '#241C15';
    c.font = `bold ${food.name.length > 8 ? 52 : 64}px ${FONT}`;
    c.fillText(food.name, W / 2, 706, W - 170);
    // 分类小胶囊
    c.font = `26px ${FONT}`;
    const catText = food.category || '';
    if (catText) {
        const tw = c.measureText(catText).width;
        roundedPath(c, W / 2 - tw / 2 - 22, 736, tw + 44, 46, 23);
        c.fillStyle = 'rgba(240, 67, 90, 0.10)';
        c.fill();
        c.fillStyle = '#E23B4E';
        c.fillText(catText, W / 2, 768);
    }
    // 描述（一行截断）
    const desc = String(food.description || '').slice(0, 20);
    if (desc) {
        c.fillStyle = '#6E6259';
        c.font = `28px ${FONT}`;
        c.fillText(desc, W / 2, 830, W - 170);
    }

    // 底部署名 + 日期
    const d = new Date();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = `24px ${FONT}`;
    c.fillText(`${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} · gwshhh.github.io/chishenme`, W / 2, 935);

    return cv;
}

// 分享：优先系统分享（手机可直接发微信），否则下载图片；文字始终复制兜底
function shareResult(food) {
    const text = `今天吃【${food.name}】！(${food.category || '美食'}) —— 来自「今天吃什么」转盘 gwshhh.github.io/chishenme`;
    showToast('正在生成分享卡片…');
    loadCardImage(food).then(img => {
        let cv;
        try {
            cv = buildShareCard(food, img);
        } catch (e) { cv = null; }
        if (!cv) { copyText(text).finally(() => showToast('已复制文字，去分享吧！')); return; }
        cv.toBlob(blob => {
            if (!blob) { copyText(text).finally(() => showToast('已复制文字，去分享吧！')); return; }
            const file = new File([blob], `今天吃什么-${food.name}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: '今天吃什么', text })
                    .catch(() => { /* 用户取消分享不算错误 */ });
                return;
            }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `今天吃什么-${food.name}.png`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
            copyText(text).finally(() => showToast('卡片已保存，文字已复制！'));
        }, 'image/png');
    });
}

// ============ 通用弹窗 ============
function openModal(html) {
    let el = document.getElementById('app-modal');
    if (!el) {
        el = document.createElement('div');
        el.id = 'app-modal';
        el.className = 'modal-overlay';
        document.body.appendChild(el);
        el.addEventListener('click', e => { if (e.target === el) closeModal(); });
    }
    el.innerHTML = `<div class="modal-box">${html}</div>`;
    el.classList.add('show');
    return el;
}

function closeModal() {
    const el = document.getElementById('app-modal');
    if (el) el.classList.remove('show');
}

// ============ 8 强淘汰赛（纠结模式） ============
// 一次抽定还是纠结？从当前候选池按权重抽 8 个，两两对决三轮定冠军。
let duel = null;   // { queue: 本轮待赛, winners: 已晋级, round, totalRounds }

function initTournament() {
    const btn = document.getElementById('tournament-btn');
    if (btn) btn.addEventListener('click', startTournament);
}

// 按权重无放回抽样 count 个
function sampleDistinct(foods, count) {
    const pool = foods.slice();
    const out = [];
    while (pool.length && out.length < count) {
        const i = weightedPick(pool);
        out.push(pool[i]);
        pool.splice(i, 1);
    }
    return out;
}

function startTournament() {
    const foods = getFilteredFoods();
    if (foods.length < 2) { showToast('候选不足 2 个，先调整筛选'); return; }
    const size = foods.length >= 8 ? 8 : (foods.length >= 4 ? 4 : 2);
    duel = { queue: sampleDistinct(foods, size), winners: [], round: 1, totalRounds: Math.round(Math.log2(size)) };
    renderDuel();
}

function duelOverlay() {
    let el = document.getElementById('duel-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'duel-overlay';
    el.className = 'modal-overlay';
    el.innerHTML = `
        <div class="modal-box duel-box">
            <button class="modal-close" id="duel-close">×</button>
            <div class="duel-round" id="duel-round"></div>
            <div class="duel-arena">
                <div class="duel-card" id="duel-a"></div>
                <div class="duel-vs">VS</div>
                <div class="duel-card" id="duel-b"></div>
            </div>
            <p class="duel-hint">点选更想吃的那个，一路选到冠军</p>
        </div>`;
    document.body.appendChild(el);
    document.getElementById('duel-close').addEventListener('click', closeDuel);
    el.addEventListener('click', e => { if (e.target === el) closeDuel(); });
    return el;
}

function closeDuel() {
    const el = document.getElementById('duel-overlay');
    if (el) el.classList.remove('show');
    duel = null;
}

function renderDuel() {
    if (!duel) return;
    // 本轮打完 → 晋级下一轮或产生冠军
    if (duel.queue.length < 2) {
        const next = duel.winners.concat(duel.queue);
        if (next.length === 1) { crownChampion(next[0]); return; }
        duel = { queue: next, winners: [], round: duel.round + 1, totalRounds: duel.totalRounds };
    }
    const el = duelOverlay();
    el.classList.add('show');
    const roundName = duel.round >= duel.totalRounds ? '决赛'
        : (duel.totalRounds - duel.round === 1 ? '半决赛' : `第 ${duel.round} 轮`);
    document.getElementById('duel-round').textContent =
        `${roundName} · 场上还剩 ${duel.queue.length + duel.winners.length} 个`;
    renderDuelCard(document.getElementById('duel-a'), duel.queue[0]);
    renderDuelCard(document.getElementById('duel-b'), duel.queue[1]);
}

function renderDuelCard(el, food) {
    el.innerHTML = `${progressiveImg(food, 'duel-img')}
        <div class="duel-name">${escapeHtml(food.name)}</div>
        <div class="duel-cat">${escapeHtml(food.category || '')}</div>`;
    hydrateImages(el);
    el.onclick = () => {
        if (!duel) return;
        duel.winners.push(food);
        duel.queue.splice(0, 2);
        if (navigator.vibrate) navigator.vibrate(20);
        renderDuel();
    };
}

function crownChampion(food) {
    closeDuel();
    addToHistory(food);
    state.currentResult = food;
    state.lastResultName = food.name;
    switchTab('wheel');
    showResult(food);
    celebrate();
    showToast(`冠军出炉：就吃【${food.name}】！`);
}

// ============ 自定义菜单（含 B 端"整套替换"食堂模式） ============
// customFoods: 追加在内置菜单后的个人菜品；menuOverride: 整套替换内置菜单
// （食堂/园区/团队专属版），两者都存 localStorage、支持 JSON 导入导出。
function loadCustomFoods() {
    return loadStored('customFoods');
}

function pushFood(f) {
    if (!f || !f.name) return;
    const name = normalizeShopText(f.name).slice(0, 20);
    if (!name || foodData.some(x => x.name === name)) return;
    const card = makeNameCard(name);
    foodData.push({
        name,
        category: normalizeShopText(f.category || '').slice(0, 12) || '自定义',
        description: normalizeShopText(f.description || '').slice(0, 40),
        image: card,
        imageFallback: card,
        isCustom: true
    });
}

function mergeCustomFoods() {
    let override = null;
    try { override = JSON.parse(localStorage.getItem('menuOverride') || 'null'); } catch (e) { /* 忽略坏数据 */ }
    if (Array.isArray(override) && override.length) {
        foodData.length = 0;                       // B 端模式：整套替换
        override.forEach(pushFood);
    } else {
        loadCustomFoods().forEach(pushFood);       // 普通模式：追加个人菜品
    }
    // 重算分类（categories 是 const 数组，改内容不改引用）
    const fresh = [...new Set(foodData.map(f => f.category))];
    categories.length = 0;
    fresh.forEach(c => categories.push(c));
}

function refreshAfterMenuChange() {
    renderFilterChips();
    renderListCategoryBar();
    drawWheel();
    updateWheelCount();
    renderFoodGrid();
}

function initCustomMenu() {
    const addBtn = document.getElementById('add-food-btn');
    const mgrBtn = document.getElementById('manage-food-btn');
    if (addBtn) addBtn.addEventListener('click', openAddFood);
    if (mgrBtn) mgrBtn.addEventListener('click', openManageMenu);
}

function openAddFood() {
    openModal(`
        <button class="modal-close" onclick="closeModal()">×</button>
        <h3 class="modal-title">添加自定义美食</h3>
        <div class="form-row"><input id="cf-name" maxlength="20" placeholder="名称（必填），如：楼下张姐炒饭"></div>
        <div class="form-row"><input id="cf-cat" maxlength="12" placeholder="分类（可选，默认：自定义）"></div>
        <div class="form-row"><input id="cf-desc" maxlength="40" placeholder="一句话描述（可选）"></div>
        <button class="modal-primary" onclick="submitAddFood()">加入菜单</button>
    `);
    const nameInput = document.getElementById('cf-name');
    if (nameInput) nameInput.focus();
}

function submitAddFood() {
    const name = normalizeShopText(document.getElementById('cf-name').value).slice(0, 20);
    if (!name) { showToast('名称不能为空'); return; }
    if (foodData.some(f => f.name === name)) { showToast('已有同名菜品'); return; }
    const item = {
        name,
        category: normalizeShopText(document.getElementById('cf-cat').value).slice(0, 12) || '自定义',
        description: normalizeShopText(document.getElementById('cf-desc').value).slice(0, 40)
    };
    const list = loadCustomFoods();
    list.push(item);
    localStorage.setItem('customFoods', JSON.stringify(list));
    pushFood(item);
    if (!categories.includes(item.category)) categories.push(item.category);
    refreshAfterMenuChange();
    closeModal();
    showToast(`已加入【${name}】，转盘/列表可抽`);
}

function openManageMenu() {
    const customs = loadCustomFoods();
    const hasOverride = !!localStorage.getItem('menuOverride');
    const items = customs.length
        ? customs.map((f, i) =>
            `<div class="mgr-item"><span>${escapeHtml(f.name)}<small> · ${escapeHtml(f.category || '自定义')}</small></span>
             <button class="mgr-del" onclick="deleteCustomFood(${i})">删除</button></div>`).join('')
        : '<p class="mgr-empty">还没有自定义菜品，点「＋ 添加自定义」试试</p>';
    openModal(`
        <button class="modal-close" onclick="closeModal()">×</button>
        <h3 class="modal-title">管理菜单</h3>
        ${hasOverride ? '<p class="mgr-tip">当前处于「整套替换」模式（B 端/食堂版），内置菜单已被替换。</p>' : ''}
        <div class="mgr-list">${items}</div>
        <div class="mgr-actions">
            <button class="toolbar-btn" onclick="exportMenu()">导出 JSON</button>
            <button class="toolbar-btn" onclick="openImportMenu()">导入 JSON</button>
            ${hasOverride ? '<button class="toolbar-btn" onclick="clearMenuOverride()">恢复内置菜单</button>' : ''}
        </div>
        <p class="mgr-tip">导入可选「整套替换」：把公司食堂/团队常点做成专属菜单。</p>
    `);
}

function deleteCustomFood(i) {
    const list = loadCustomFoods();
    const removed = list.splice(i, 1)[0];
    localStorage.setItem('customFoods', JSON.stringify(list));
    if (removed) {
        const idx = foodData.findIndex(f => f.name === removed.name && f.isCustom);
        if (idx > -1) foodData.splice(idx, 1);
    }
    refreshAfterMenuChange();
    openManageMenu();
    showToast('已删除');
}

function exportMenu() {
    const payload = JSON.stringify(loadCustomFoods(), null, 2);
    copyText(payload).then(
        () => showToast('自定义菜单 JSON 已复制到剪贴板'),
        () => showToast('复制失败，请重试')
    );
}

function openImportMenu() {
    openModal(`
        <button class="modal-close" onclick="closeModal()">×</button>
        <h3 class="modal-title">导入菜单 JSON</h3>
        <textarea id="import-ta" class="import-ta"
            placeholder='[{"name":"红烧牛肉面","category":"面食","description":"食堂二楼 3 号窗口"}]'></textarea>
        <label class="avoid-repeat"><input type="checkbox" id="import-replace"> 整套替换内置菜单（食堂/B 端模式）</label>
        <button class="modal-primary" onclick="submitImportMenu()">导入并重载</button>
    `);
}

function submitImportMenu() {
    let arr;
    try { arr = JSON.parse(document.getElementById('import-ta').value); } catch (e) { showToast('JSON 格式不对'); return; }
    if (!Array.isArray(arr)) { showToast('需要 JSON 数组'); return; }
    const clean = arr.filter(f => f && f.name).slice(0, 300);
    if (!clean.length) { showToast('没有有效条目（每项需含 name）'); return; }
    if (document.getElementById('import-replace').checked) {
        localStorage.setItem('menuOverride', JSON.stringify(clean));
    } else {
        const list = loadCustomFoods();
        clean.forEach(f => {
            if (!list.some(x => x.name === f.name)) {
                list.push({ name: f.name, category: f.category || '自定义', description: f.description || '' });
            }
        });
        localStorage.setItem('customFoods', JSON.stringify(list));
    }
    location.reload();   // 菜单导入是低频操作，整页重建最稳
}

function clearMenuOverride() {
    localStorage.removeItem('menuOverride');
    location.reload();
}

// ============ 本地商家推广位（data.js 的 SPONSOR 配置后自动展示） ============
function initSponsor() {
    if (typeof SPONSOR === 'undefined' || !SPONSOR || !SPONSOR.name) return;
    const anchor = document.getElementById('today-pick');
    if (!anchor) return;
    const card = document.createElement('div');
    card.className = 'sponsor-card';
    card.innerHTML = `
        <div class="sponsor-info">
            <span class="sponsor-tag">推广</span>
            <span class="sponsor-name">${escapeHtml(SPONSOR.name)}</span>
            <span class="sponsor-desc">${escapeHtml(SPONSOR.desc || '')}</span>
        </div>
        <button class="today-pick-btn" id="sponsor-btn">${escapeHtml(SPONSOR.cta || '去看看')}</button>`;
    anchor.after(card);
    const btn = document.getElementById('sponsor-btn');
    if (btn) btn.onclick = () => window.open(SPONSOR.url, '_blank');
}

// ============ PWA：注册 Service Worker（可安装、可离线） ============
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* 注册失败不影响正常使用 */ });
}

// 跳转外卖平台下单。核心目标：在手机上把抽中的店/菜带进美团（或饿了么）App。
// 纯前端无法确认某个高德 POI 是否存在于美团外卖商家库，所以这里不做“假直达”。
// 策略是：优先复制最可能命中的搜索词；附近店额外提供换词搜索与美团附近页兜底。
function setupDeliveryActions(food) {
    const meituanBtn = document.getElementById('order-meituan');
    const elemeBtn = document.getElementById('order-eleme');
    const assist = document.getElementById('delivery-assist');
    const altBtn = document.getElementById('order-meituan-alt');
    const nearbyBtn = document.getElementById('order-meituan-nearby');
    const couponGuide = document.getElementById('coupon-guide');
    const mtCouponBtn = document.getElementById('order-meituan-coupon');
    const eleCouponBtn = document.getElementById('order-eleme-coupon');
    const hint = document.querySelector('#result-card .delivery-hint');
    const keywords = buildDeliveryKeywords(food);
    const primary = keywords[0] || food.name;

    if (meituanBtn) {
        meituanBtn.textContent = food.isNearby ? '美团搜店' : '美团外卖';
        meituanBtn.onclick = () => openDelivery('meituan', food, { keyword: primary, couponReminder: food.isNearby });
    }
    if (elemeBtn) {
        elemeBtn.textContent = food.isNearby ? '饿了么搜店' : '饿了么';
        elemeBtn.onclick = () => openDelivery('eleme', food, { keyword: primary, couponReminder: food.isNearby });
    }

    if (!food.isNearby) {
        if (hint) hint.textContent = '去外卖平台点这道菜';
        if (assist) assist.style.display = 'none';
        if (couponGuide) couponGuide.style.display = 'none';
        return;
    }

    if (hint) hint.textContent = `优先搜【${shortKeyword(primary)}】；搜不到就换词或看美团附近`;
    if (assist) assist.style.display = 'flex';
    if (couponGuide) couponGuide.style.display = 'block';
    if (mtCouponBtn) mtCouponBtn.onclick = () => openCouponPage('meituan', primary);
    if (eleCouponBtn) eleCouponBtn.onclick = () => openCouponPage('eleme', primary);

    let altIndex = 1;
    if (altBtn) {
        altBtn.disabled = keywords.length < 2;
        altBtn.title = keywords.length > 1 ? `备选：${keywords.slice(1).join(' / ')}` : '暂无其它搜索词';
        altBtn.onclick = () => {
            const keyword = keywords[altIndex] || primary;
            altIndex = altIndex + 1 >= keywords.length ? 1 : altIndex + 1;
            openDelivery('meituan', food, { keyword, couponReminder: true });
        };
    }
    if (nearbyBtn) nearbyBtn.onclick = () => openMeituanNearby(food, primary);
}

function shortKeyword(keyword) {
    const s = String(keyword || '').trim();
    return s.length > 10 ? `${s.slice(0, 10)}…` : s;
}

function normalizeShopText(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
        .replace(/[【】\[\]「」『』]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// 清洗高德店名，提高在美团/饿了么搜到的概率。
// 高德 POI 常带分店、商场、楼层、编号等尾巴；美团外卖更吃“品牌/主品类”搜索。
function cleanShopName(name) {
    let s = String(name || '').normalize('NFKC').trim();
    const original = normalizeShopText(s);
    s = s.replace(/[（(【\[][^（）()【】\[\]]*[）)】\]]/g, ' ');
    s = s.replace(/[·・丨|｜].*$/, ' ');
    s = s.replace(/[\-—–_]+\s*[^\-—–_]*(店|广场|商场|中心|大厦|校区|园区|路|街|号).*$/i, ' ');
    s = s.replace(/(外卖专营店|外卖店|餐饮店|小吃店|美食店|总店|旗舰店|加盟店)$/g, ' ');
    s = normalizeShopText(s);
    return s || original;
}

function extractDishKeyword(food) {
    const text = `${food.name || ''} ${food.category || ''} ${food.sourceType || ''}`;
    const rules = [
        /黄焖鸡米饭|黄焖鸡|鸡公煲|麻辣烫|麻辣香锅|冒菜|酸菜鱼|烤鱼|水煮鱼|螺蛳粉|酸辣粉|米线|过桥米线/,
        /兰州拉面|牛肉面|重庆小面|刀削面|热干面|拌面|炸酱面|面馆|粉面|面/,
        /盖浇饭|煲仔饭|卤肉饭|炒饭|便当|快餐|盒饭|简餐|粥|饺子|馄饨|包子|肠粉|煎饼/,
        /炸鸡|汉堡|披萨|比萨|寿司|日料|韩餐|烤肉|烧烤|火锅|串串|麻辣拌|沙县小吃/,
        /奶茶|茶饮|咖啡|甜品|蛋糕|烘焙|冰淇淋|果茶/
    ];
    for (const re of rules) {
        const m = text.match(re);
        if (m) return m[0] === '面馆' || m[0] === '粉面' ? '面' : m[0];
    }
    return '';
}

function categorySearchKeyword(category) {
    const c = String(category || '');
    if (/面馆/.test(c)) return '面';
    if (/快餐/.test(c)) return '快餐';
    if (/甜品/.test(c)) return '甜品';
    if (/烧烤/.test(c)) return '烧烤';
    if (/火锅/.test(c)) return '火锅';
    if (/西餐/.test(c)) return '披萨 汉堡';
    if (/日料/.test(c)) return '寿司';
    if (/韩餐/.test(c)) return '韩餐';
    if (/清真/.test(c)) return '清真';
    return '';
}

function uniqueKeywords(values) {
    const seen = new Set();
    const out = [];
    values.forEach(value => {
        const keyword = normalizeShopText(value).replace(/\s+/g, ' ').trim();
        if (!keyword || keyword.length < 2) return;
        const key = keyword.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(keyword);
    });
    return out;
}

function buildDeliveryKeywords(food) {
    if (!food || !food.isNearby) return uniqueKeywords([food && food.name]);
    const rawName = String(food.name || '');
    const original = normalizeShopText(rawName);
    const core = cleanShopName(rawName);
    const dish = extractDishKeyword(food);
    const category = categorySearchKeyword(food.category);
    return uniqueKeywords([
        ...(Array.isArray(food.searchKeywords) ? food.searchKeywords : []),
        core,
        original,
        dish && core && !core.includes(dish) ? `${core} ${dish}` : '',
        dish,
        category
    ]);
}

function getPlatformConfig(platform, keyword) {
    const enc = encodeURIComponent(keyword);
    return platform === 'eleme'
        ? {
            name: '饿了么',
            schemeName: 'eleme',
            pkg: 'me.ele',
            host: 'search',
            query: `keyword=${enc}`,
            scheme: `eleme://search?keyword=${enc}`,
            h5: 'https://h5.ele.me',
            web: 'https://www.ele.me'
        }
        : {
            name: '美团',
            schemeName: 'imeituan',
            pkg: 'com.sankuai.meituan',
            host: 'www.meituan.com/search/result',
            query: `q=${enc}`,
            scheme: `imeituan://www.meituan.com/search/result?q=${enc}`,
            h5: 'https://i.waimai.meituan.com',
            web: 'https://waimai.meituan.com'
        };
}

// App scheme/包名非官方文档、可能随版本变化，故 H5 回退是「永远能落地」的保障。
function openDelivery(platform, food, options = {}) {
    const keyword = normalizeShopText(options.keyword || buildDeliveryKeywords(food)[0] || (food && food.name));
    const cfg = getPlatformConfig(platform, keyword);
    const lead = options.couponReminder ? '先领券再下单：' : '';

    if (!isMobile()) {
        copyText(keyword).finally(() => {
            showToast(`${lead}已复制【${keyword}】，在${cfg.name}粘贴搜索即可`);
            window.open(cfg.web, '_blank');
        });
        return;
    }

    if (isEmbeddedBrowser()) {
        copyText(keyword).finally(() => {
            showToast(`${lead}已复制【${keyword}】，请点右上「···」选「在浏览器打开」后再下单`);
        });
        return;
    }

    copyText(keyword).finally(() => {
        showToast(`${lead}已复制【${keyword}】，正在打开${cfg.name}…`);
        launchApp(cfg);
    });
}

function openMeituanNearby(food, keyword) {
    const copied = normalizeShopText(keyword || buildDeliveryKeywords(food)[0] || (food && food.name));
    const url = isMobile() ? 'https://i.waimai.meituan.com' : 'https://waimai.meituan.com';
    copyText(copied).finally(() => {
        showToast(`已复制【${copied}】，打开美团附近后可按距离找或粘贴搜索`);
        if (isMobile()) {
            window.location.href = url;
        } else {
            window.open(url, '_blank');
        }
    });
}

// 跳「领券/红包」入口。以下链接均经过实测（curl 查跳转），不再靠猜：
//   · 饿了么红包页 https://h5.ele.me/hongbao/  —— 实测 HTTP 200，可直接落地；
//   · 美团外卖领券页 https://i.waimai.meituan.com/coupon —— 实测 302 到登录页，
//     但登录链接带 backurl=...coupon，用户登录一次后会自动跳回领券页，故仍可用，
//     只是【必须先登录】，这一点如实告知，不假装能直达。
// 重要事实（第 N 次说明）：平台没有公开、稳定的“隐藏券一键全领”接口，网页也无法
// 操作你的账号自动领券（需登录态、违规、沙箱够不到）。这里只做“把你送到领券页”，
// 券仍需你自己点“领取”。App 的 web 容器 scheme 非公开、之前实测不稳，故不再赌它，
// 直接打开已验证可用的 H5 领券页（装了 App 的系统会询问是否用 App 打开）。
function openCouponPage(platform, keyword) {
    const copied = normalizeShopText(keyword);
    const isEle = platform === 'eleme';
    // CPS 返佣：data.js 的 AFFILIATE 里配置了联盟推广链接就优先走它（用户下单可获佣金），
    // 未配置则用实测可用的普通领券页，体验一致。
    const affiliate = (typeof AFFILIATE === 'object' && AFFILIATE)
        ? (isEle ? AFFILIATE.elemeCoupon : AFFILIATE.meituanCoupon) : '';
    const couponUrl = affiliate || (isEle
        ? 'https://h5.ele.me/hongbao/'                 // 实测 200
        : 'https://i.waimai.meituan.com/coupon');      // 实测 302→登录→回跳领券
    const name = isEle ? '饿了么红包页' : '美团领券页';
    // 美团 H5 会先要求登录，如实提示；饿了么红包页可直接看到
    const tip = isEle
        ? `先领券再下单：已复制【${copied}】，正在打开${name}，点红包领取后回来搜店`
        : `先领券再下单：已复制【${copied}】，${name}需先登录一次，登录后会自动回到领券页`;

    copyText(copied).finally(() => {
        showToast(tip);
        if (isEmbeddedBrowser()) {
            showToast(`已复制【${copied}】，请点右上「···」选「在浏览器打开」后再领券`);
            return;
        }
        if (isMobile()) {
            window.location.href = couponUrl;  // 手机端整页跳，装了 App 系统会询问是否用 App 打开
        } else {
            window.open(couponUrl, '_blank');
        }
    });
}


function isEmbeddedBrowser() {
    return /MicroMessenger|QQ\//i.test(navigator.userAgent);
}
// 唤起外卖 App：安卓走 intent://（系统自动兜底 H5），iOS/其它走 scheme+计时回退。
function launchApp(cfg) {
    const isAndroid = /Android/i.test(navigator.userAgent);

    // 安卓最稳方案：intent:// 带 package 精确唤起，未安装则由 browser_fallback_url
    // 让系统自动打开 H5。无需计时器/可见性猜测，不会误跳。
    if (isAndroid) {
        const fb = encodeURIComponent(cfg.h5);
        const target = cfg.query ? `intent://${cfg.host}?${cfg.query}` : `intent://${cfg.host}`;
        const intent = target
            + `#Intent;scheme=${cfg.schemeName};package=${cfg.pkg};`
            + `S.browser_fallback_url=${fb};end`;
        try { window.location.href = intent; return; } catch (e) { /* 落到下方通用逻辑 */ }
    }

    // iOS / 其它：用户手势内直接跳 scheme（比 iframe 可靠）。唤起成功页面会切到
    // 后台（hidden/pagehide/blur 任一触发），此时取消回退；否则 1.6s 后打开 H5。
    let left = false;
    const mark = () => { left = true; };
    const onVis = () => { if (document.hidden) mark(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', mark);
    window.addEventListener('blur', mark);

    setTimeout(() => {
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('pagehide', mark);
        window.removeEventListener('blur', mark);
        if (!left && !document.hidden) window.location.href = cfg.h5;
    }, 1600);

    try { window.location.href = cfg.scheme; } catch (e) { window.location.href = cfg.h5; }
}

// 粗略判断移动端（决定打开 H5 还是桌面站）
function isMobile() {
    return /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent);
}

// 初始化列表页
function initListPage() {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');

    renderListCategoryBar();

    // 分类筛选事件（委托在容器上，重渲染按钮不丢失）
    categoryFilter.addEventListener('click', (e) => {
        if (e.target.classList.contains('category-btn')) {
            categoryFilter.querySelectorAll('.category-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            e.target.classList.add('active');
            renderFoodGrid();
        }
    });

    // 搜索事件
    searchInput.addEventListener('input', renderFoodGrid);

    // 初始渲染
    renderFoodGrid();
}

// 渲染列表页分类条（自定义菜单变化后可重复调用）
function renderListCategoryBar() {
    const categoryFilter = document.getElementById('category-filter');
    categoryFilter.innerHTML = `
        <button class="category-btn active" data-category="all">全部</button>
        ${categories.map(cat => `
            <button class="category-btn" data-category="${cat}">${cat}</button>
        `).join('')}
    `;
}

// 渲染美食网格
function renderFoodGrid() {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const foodGrid = document.getElementById('food-grid');

    const searchTerm = searchInput.value.toLowerCase();
    const dataset = getActiveDataset();

    // 附近模式不分类；菜单模式按选中分类筛选
    let filteredFoods = dataset;
    if (!state.useNearby) {
        const selectedCategory = categoryFilter.querySelector('.category-btn.active').dataset.category;
        if (selectedCategory !== 'all') {
            filteredFoods = filteredFoods.filter(food => food.category === selectedCategory);
        }
    }

    // 搜索筛选
    if (searchTerm) {
        filteredFoods = filteredFoods.filter(food =>
            food.name.toLowerCase().includes(searchTerm) ||
            (food.category || '').toLowerCase().includes(searchTerm)
        );
    }

    // 渲染网格
    if (filteredFoods.length === 0) {
        const tip = state.useNearby ? '😢 附近暂无可显示的店铺' : '😢 没有找到相关美食';
        foodGrid.innerHTML = `<div class="empty-state"><p>${tip}</p></div>`;
        return;
    }

    foodGrid.innerHTML = filteredFoods.map((food, i) => {
        const isFavorite = state.favorites.some(f => f.name === food.name);
        return `
            <div class="food-card" data-idx="${i}">
                <div class="favorite-icon" data-fav="${i}">${isFavorite ? '💖' : '🤍'}</div>
                ${progressiveImg(food, 'food-card-image')}
                <div class="food-card-content">
                    <div class="food-card-name">${escapeHtml(food.name)}</div>
                    <div class="food-card-category">${escapeHtml(food.category || '')}</div>
                </div>
            </div>
        `;
    }).join('');

    // 收藏图标点击（阻止冒泡，不触发卡片详情）
    foodGrid.querySelectorAll('.favorite-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(filteredFoods[+icon.dataset.fav]);
            renderFoodGrid();
        });
    });

    // 卡片点击 → 详情/抽中
    foodGrid.querySelectorAll('.food-card').forEach(card => {
        card.addEventListener('click', () => {
            showFoodDetail(filteredFoods[+card.dataset.idx]);
        });
    });

    hydrateImages(foodGrid);
}

// 转义工具（店名可能含引号/尖括号，避免破坏 HTML）
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function escapeAttr(s) {
    return escapeHtml(s);
}

// ============ 图片渐进增强（国内手机也一定立刻看到内容）============
// 思路：<img> 的 src 直接用零网络的菜名/店铺 SVG 卡（瞬间显示，绝不空白/转圈），
// 真实照片地址存在 data-real 上，渲染后由 hydrateImages() 在后台预加载，
// 成功才悄悄替换上去；失败或超时就一直保留那张卡。这样无论 GitHub 图片在国内
// 能否拉到，屏幕上永远先有内容，能拉到就自动升级成真实照片。
function progressiveImg(food, cls) {
    // 兜底卡必须是零网络的 data: URI。旧版收藏/历史里存的是文件路径
    // （images_new/*.jpg），国内可能拉不到，这里统一按菜名/店名现场重生成。
    let card = food.imageFallback || '';
    if (!card.startsWith('data:') && typeof makeNameCard === 'function') {
        card = makeNameCard(food.name);
    }
    const real = food.image && food.image !== card ? food.image : '';
    return `<img class="${cls}" src="${escapeAttr(card)}" `
        + `data-real="${escapeAttr(real)}" alt="${escapeAttr(food.name)}" `
        + `loading="lazy" decoding="async">`;
}

// 后台预加载 data-real 的真实照片，加载成功才替换，失败则保留卡片
function hydrateImages(container) {
    if (!container) return;
    container.querySelectorAll('img[data-real]').forEach(img => {
        const real = img.getAttribute('data-real');
        img.removeAttribute('data-real');
        if (!real) return;
        const pre = new Image();
        // 8 秒还没成功就放弃，保留卡片，不让用户一直看转圈
        const timer = setTimeout(() => { pre.onload = pre.onerror = null; }, 8000);
        pre.onload = () => { clearTimeout(timer); img.src = real; };
        pre.onerror = () => { clearTimeout(timer); };
        pre.src = real;
    });
}

// 显示美食详情
function showFoodDetail(food) {
    state.currentResult = food;
    showResult(food);
    switchTab('wheel');
}

// 切换收藏状态
function toggleFavorite(food) {
    const index = state.favorites.findIndex(f => f.name === food.name);

    if (index > -1) {
        state.favorites.splice(index, 1);
        showToast('已取消收藏');
    } else {
        state.favorites.push(food);
        showToast('收藏成功！');
    }

    saveFavorites();
    updateUI();
}

// 通过名称切换收藏（用于卡片）
function toggleFavoriteByName(foodName) {
    const food = foodData.find(f => f.name === foodName);
    if (food) {
        toggleFavorite(food);
    }
}

// 保存收藏
function saveFavorites() {
    localStorage.setItem('favorites', JSON.stringify(state.favorites));
}

// 添加到历史记录
function addToHistory(food) {
    const historyItem = {
        ...food,
        timestamp: Date.now()
    };

    state.history.unshift(historyItem);

    // 只保留最近50条
    if (state.history.length > 50) {
        state.history = state.history.slice(0, 50);
    }

    saveHistory();
}

// 保存历史记录
function saveHistory() {
    localStorage.setItem('history', JSON.stringify(state.history));
}

// 初始化收藏页
function initFavoritesPage() {
    const emptyState = document.getElementById('empty-favorites');
    const favoritesGrid = document.getElementById('favorites-grid');
    const controls = document.getElementById('favorites-controls');
    const countLabel = document.getElementById('fav-count-label');
    const randomBtn = document.getElementById('random-fav-btn');

    if (state.favorites.length === 0) {
        emptyState.style.display = 'block';
        favoritesGrid.innerHTML = '';
        if (controls) controls.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    if (controls) controls.style.display = 'flex';
    if (countLabel) countLabel.textContent = `共 ${state.favorites.length} 个收藏`;
    if (randomBtn) randomBtn.onclick = pickRandomFavorite;

    favoritesGrid.innerHTML = state.favorites.map((food, i) => `
        <div class="food-card" data-idx="${i}">
            <div class="favorite-icon" data-fav="${i}">💖</div>
            ${progressiveImg(food, 'food-card-image')}
            <div class="food-card-content">
                <div class="food-card-name">${escapeHtml(food.name)}</div>
                <div class="food-card-category">${escapeHtml(food.category || '')}</div>
            </div>
        </div>
    `).join('');
    hydrateImages(favoritesGrid);

    // 取消收藏
    favoritesGrid.querySelectorAll('.favorite-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(state.favorites[+icon.dataset.fav]);
            initFavoritesPage();
        });
    });

    // 卡片点击事件（直接用收藏里存的完整对象，附近店也兼容）
    favoritesGrid.querySelectorAll('.food-card').forEach(card => {
        card.addEventListener('click', () => {
            showFoodDetail(state.favorites[+card.dataset.idx]);
        });
    });
}

// 从收藏中随机挑一个（解决"收藏一堆还是不知道吃啥"，同样应用吃腻衰减）
function pickRandomFavorite() {
    if (state.favorites.length === 0) return;
    const food = state.favorites[weightedPick(state.favorites)];
    if (navigator.vibrate) navigator.vibrate(40);
    addToHistory(food);
    showFoodDetail(food);
    celebrate();
    showToast(`就吃【${food.name}】吧！`);
}

// 初始化历史页
function initHistoryPage() {
    const emptyState = document.getElementById('empty-history');
    const historyList = document.getElementById('history-list');
    const clearBtn = document.getElementById('clear-history-btn');
    const statsEl = document.getElementById('history-stats');

    if (state.history.length === 0) {
        emptyState.style.display = 'block';
        historyList.innerHTML = '';
        clearBtn.style.display = 'none';
        if (statsEl) { statsEl.style.display = 'none'; statsEl.textContent = ''; }
        return;
    }

    emptyState.style.display = 'none';
    clearBtn.style.display = 'block';

    // 统计：饮食周报（近 7 天）+ 历史总览
    if (statsEl) {
        const counts = {};
        state.history.forEach(h => { counts[h.name] = (counts[h.name] || 0) + 1; });
        let topName = '', topCount = 0;
        Object.keys(counts).forEach(n => { if (counts[n] > topCount) { topCount = counts[n]; topName = n; } });

        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const week = state.history.filter(h => h.timestamp >= weekAgo);
        const catCount = {};
        week.forEach(h => { const cat = h.category || '其他'; catCount[cat] = (catCount[cat] || 0) + 1; });
        const top3 = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const maxC = top3.length ? top3[0][1] : 1;
        const bars = top3.map(([cat, n]) =>
            `<div class="week-bar-row"><span class="week-bar-label">${escapeHtml(cat)}</span>` +
            `<span class="week-bar"><i style="width:${Math.round(n / maxC * 100)}%"></i></span>` +
            `<span class="week-bar-n">${n}</span></div>`).join('');

        const weekNameCount = {};
        week.forEach(h => { weekNameCount[h.name] = (weekNameCount[h.name] || 0) + 1; });
        const weekTop = Object.entries(weekNameCount).sort((a, b) => b[1] - a[1])[0];
        const quip = !week.length ? '本周还没抽过，转一个？'
            : (weekTop && weekTop[1] >= 3 ? `本周第 ${weekTop[1]} 次【${escapeHtml(weekTop[0])}】，铁粉认证`
                : '本周口味换着来，会吃的');

        statsEl.style.display = 'block';
        statsEl.innerHTML =
            `<div class="week-head">本周 <b>${week.length}</b> 顿 · 历史共 <b>${state.history.length}</b> 次 · 最常抽到 <b>${escapeHtml(topName)}</b>（${topCount} 次）</div>` +
            (bars ? `<div class="week-bars">${bars}</div>` : '') +
            `<div class="week-quip">${quip}</div>`;
    }

    historyList.innerHTML = state.history.map((item, i) => `
        <div class="history-item" data-idx="${i}">
            ${progressiveImg(item, 'history-item-image')}
            <div class="history-item-content">
                <div class="history-item-name">${escapeHtml(item.name)}</div>
                <div class="history-item-time">${formatTime(item.timestamp)}</div>
            </div>
            <button class="history-del" title="删除这条" onclick="event.stopPropagation(); deleteHistoryItem(${item.timestamp})">×</button>
        </div>
    `).join('');
    hydrateImages(historyList);

    // 历史项点击事件（用记录里存的完整对象，附近店也兼容）
    historyList.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            showFoodDetail(state.history[+item.dataset.idx]);
        });
    });

    // 清空历史
    clearBtn.onclick = () => {
        if (confirm('确定要清空所有历史记录吗？')) {
            state.history = [];
            saveHistory();
            initHistoryPage();
            showToast('历史记录已清空');
        }
    };
}

// 删除单条历史记录（按时间戳定位）
function deleteHistoryItem(ts) {
    state.history = state.history.filter(h => h.timestamp !== ts);
    saveHistory();
    initHistoryPage();
    showToast('已删除该记录');
}

// 格式化时间
function formatTime(timestamp) {    const now = Date.now();
    const diff = now - timestamp;

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
        return '刚刚';
    } else if (diff < hour) {
        return `${Math.floor(diff / minute)}分钟前`;
    } else if (diff < day) {
        return `${Math.floor(diff / hour)}小时前`;
    } else if (diff < 7 * day) {
        return `${Math.floor(diff / day)}天前`;
    } else {
        const date = new Date(timestamp);
        return `${date.getMonth() + 1}月${date.getDate()}日`;
    }
}

// 显示 Toast 提示
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// 更新 UI
function updateUI() {
    updateFavBadge();

    if (state.currentTab === 'list') {
        renderFoodGrid();
    } else if (state.currentTab === 'favorites') {
        initFavoritesPage();
    } else if (state.currentTab === 'history') {
        initHistoryPage();
    }

    // 更新结果卡片的收藏按钮
    if (state.currentResult) {
        const favBtn = document.getElementById('add-favorite-btn');
        const isFavorite = state.favorites.some(f => f.name === state.currentResult.name);
        favBtn.textContent = isFavorite ? '💖 已收藏' : '⭐ 收藏';
    }
}

// 更新收藏数量角标
function updateFavBadge() {
    const badge = document.getElementById('fav-badge');
    if (!badge) return;
    const count = state.favorites.length;
    badge.textContent = count > 0 ? (count > 99 ? '99+' : count) : '';
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

// 响应式调整
window.addEventListener('resize', () => {
    if (state.currentTab === 'wheel') {
        drawWheel();
    }
});

// 空格键 / 回车键快捷抽取（不在输入框时）
document.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.code === 'Enter') &&
        state.currentTab === 'wheel' &&
        !state.isSpinning &&
        document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        spinWheel();
    }
});

// 深色模式切换（首次访问跟随系统偏好；手动切换后记住选择）
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark-mode');
        themeToggle.textContent = '☀️';
    }
    syncThemeColor();

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        themeToggle.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        syncThemeColor();
    });
}

// 手机浏览器地址栏/状态栏颜色跟随主题
function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = document.body.classList.contains('dark-mode') ? '#1B1713' : '#FF7A45';
}

// ============ 音效（Web Audio，无需音频文件）============
let audioCtx = null;
let audioUnlocked = false;

function getAudioCtx() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
    }
    return audioCtx;
}

// 手机浏览器（尤其 iOS）要求 AudioContext 必须在「用户手势的同步调用栈」里被
// resume/play 才能解锁发声。转盘的「滴答」是在 requestAnimationFrame 回调里发的，
// 已脱离点击手势，故不解锁就一直静音。这里在用户首次触摸/点击页面时就解锁：
// 创建并 resume 上下文，再播一段 0 音量的空音，把音频通道彻底激活。
function initAudioUnlock() {
    const unlock = () => {
        if (audioUnlocked) return;
        const ctx = getAudioCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();
        // 播放一个静音 buffer，iOS 上这是真正解锁音频的关键一步
        try {
            const buf = ctx.createBuffer(1, 1, 22050);
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0);
        } catch (e) { /* 忽略 */ }
        audioUnlocked = true;
    };
    // 首次触摸/点击/按键都尝试解锁，once 触发后自动移除
    ['touchend', 'touchstart', 'click', 'keydown'].forEach(evt =>
        document.addEventListener(evt, unlock, { once: false, passive: true }));
}

function beep(freq, durationMs, type = 'square', gainVal = 0.04) {
    if (!state.soundOn) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainVal;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    osc.start(now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.stop(now + durationMs / 1000);
}

// 转盘经过扇格的"滴答"
function playTick() {
    beep(880, 30, 'square', 0.03);
}

// 抽中结果的"叮"（小三度上行，悦耳）
function playDing() {
    if (!state.soundOn) return;
    beep(660, 120, 'sine', 0.06);
    setTimeout(() => beep(990, 200, 'sine', 0.06), 110);
}

// 音效开关
function initSoundToggle() {
    const btn = document.getElementById('sound-toggle');
    if (!btn) return;
    btn.textContent = state.soundOn ? '🔊' : '🔇';
    btn.addEventListener('click', () => {
        state.soundOn = !state.soundOn;
        localStorage.setItem('soundOn', state.soundOn ? '1' : '0');
        btn.textContent = state.soundOn ? '🔊' : '🔇';
        if (state.soundOn) { getAudioCtx(); playTick(); }  // 点开时给个反馈并解锁音频
        showToast(state.soundOn ? '音效已开启' : '音效已关闭');
    });
}

// ============ 今日推荐 ============
// 按日期确定性地选一道菜：同一天始终推荐同一道，跨天才变。
function initTodayPick() {
    const nameEl = document.getElementById('today-pick-name');
    const btn = document.getElementById('today-pick-btn');
    if (!nameEl || !btn) return;

    const now = new Date();
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    const food = foodData[seed % foodData.length];

    nameEl.textContent = food.name;
    btn.onclick = () => {
        addToHistory(food);
        showFoodDetail(food);
        showToast(`今日就吃【${food.name}】！`);
    };
}

// ============ 避免连续重复 开关 ============
function initAvoidRepeat() {
    const cb = document.getElementById('avoid-repeat');
    if (!cb) return;
    cb.checked = state.avoidRepeat;
    cb.addEventListener('change', () => {
        state.avoidRepeat = cb.checked;
        localStorage.setItem('avoidRepeat', cb.checked ? '1' : '0');
        showToast(cb.checked ? '已开启：不会连续抽到同一道' : '已关闭连续去重');
    });
}

// ============ 吃腻衰减 开关 ============
function initFatigueDecay() {
    const cb = document.getElementById('fatigue-decay');
    if (!cb) return;
    cb.checked = state.fatigueDecay;
    cb.addEventListener('change', () => {
        state.fatigueDecay = cb.checked;
        localStorage.setItem('fatigueDecay', cb.checked ? '1' : '0');
        showToast(cb.checked ? '已开启：近 7 天吃过的会更少抽到' : '已关闭吃腻降权，全员等概率');
    });
}

// ============ 附近美食（定位 → 拉取真实附近店铺 → 整合进转盘/列表）============
// 重要说明：美团没有对外开放、可跨域调用的「按坐标查餐厅/菜品」接口，纯前端无法
// 取到美团 App 内的菜单数据（跨域被拦 + 需 App 内置签名与登录态 + 抓取违规）。
// 因此「附近的美食」改用 OpenStreetMap 的公开数据（Overpass API，免密钥、支持跨域）
// 拉取你身边真实存在的餐饮店，整合进转盘/列表供抽取；抽中后再跳美团去这家店下单。
function initNearby() {
    const card = document.getElementById('nearby-card');
    const locateBtn = document.getElementById('locate-btn');
    const goBtn = document.getElementById('nearby-meituan-btn');
    if (!card || !locateBtn || !goBtn) return;

    // 恢复上次定位结果（同一会话/设备免重复授权），并自动进入附近模式：
    // 一打开列表/转盘默认就是附近真实餐厅，无需手动点定位。
    let restored = false;
    try {
        const saved = JSON.parse(localStorage.getItem('location') || 'null');
        if (saved && typeof saved.latitude === 'number') {
            state.location = saved;
            renderNearby(saved.city);
            renderNearbyMeta();       // 缓存里的城市立即上屏，天气随后补充
            loadNearbyPlaces(true);   // 有缓存坐标，直接按当前档拉附近店铺（自动，不打断）
            fetchWeather(saved.latitude, saved.longitude);
            restored = true;
        }
    } catch (e) { /* 数据损坏忽略 */ }
    // 没有缓存坐标则自动发起定位（成功后会自动拉附近并进入附近模式）
    if (!restored) requestLocation();

    locateBtn.addEventListener('click', requestLocation);
    // 「逛附近」按钮：定位后用真实店铺填充转盘/列表并切到附近模式
    goBtn.addEventListener('click', () => {
        if (!state.location) { requestLocation(); return; }
        loadNearbyPlaces();
    });

    // 退出附近模式、回到内置菜单
    const exitBtn = document.getElementById('nearby-exit-btn');
    if (exitBtn) exitBtn.addEventListener('click', exitNearbyMode);

    // 三档选择：数量越多搜索半径越大；选中后立即按新档重新加载（若已定位）
    const levelWrap = document.getElementById('nearby-levels');
    if (levelWrap) {
        levelWrap.querySelectorAll('.level-btn').forEach(btn => {
            const lv = parseInt(btn.dataset.level, 10);
            btn.classList.toggle('active', lv === state.nearbyLevel);
            btn.addEventListener('click', () => {
                state.nearbyLevel = lv;
                localStorage.setItem('nearbyLevel', String(lv));
                levelWrap.querySelectorAll('.level-btn').forEach(b =>
                    b.classList.toggle('active', b === btn));
                if (state.location) loadNearbyPlaces(true);  // 已定位则立即按新档刷新（自动）
            });
        });
    }
}

// 已定位后更新 UI 文案与按钮
function renderNearby(cityText) {
    const statusEl = document.getElementById('nearby-status');
    const goBtn = document.getElementById('nearby-meituan-btn');
    const locateBtn = document.getElementById('locate-btn');
    if (statusEl) statusEl.textContent = cityText ? `已定位：${cityText}` : '已定位，点「发现附近」加载店铺';
    if (goBtn) { goBtn.style.display = 'inline-flex'; goBtn.textContent = '发现附近'; }
    if (locateBtn) locateBtn.textContent = '重新定位';
    const levelWrap = document.getElementById('nearby-levels');
    if (levelWrap) levelWrap.style.display = 'flex';  // 定位后显示三档选择
}

// 请求浏览器定位（需 HTTPS 或 localhost；file:// 下多数浏览器禁用）
function requestLocation() {
    const statusEl = document.getElementById('nearby-status');

    if (!navigator.geolocation) {
        showToast('当前浏览器不支持定位');
        return;
    }
    if (location.protocol === 'file:') {
        showToast('定位需通过 http(s) 打开页面，直接双击文件无法定位');
        if (statusEl) statusEl.textContent = '请用本地服务器或部署后访问以启用定位';
        return;
    }

    if (statusEl) statusEl.textContent = '定位中…';
    showToast('正在获取你的位置…');

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            state.location = { latitude, longitude, city: '' };
            persistLocation();
            renderNearby('');
            reverseGeocode(latitude, longitude);
            loadNearbyPlaces(true);  // 定位成功立即拉取附近店铺（自动，不打断当前页）
            fetchWeather(latitude, longitude);
        },
        (err) => {
            const msg = {
                1: '已拒绝定位授权，可在浏览器设置中开启',
                2: '暂时无法获取位置，请检查网络或定位服务',
                3: '定位超时，请重试'
            }[err.code] || '定位失败';
            showToast(msg);
            if (statusEl) statusEl.textContent = '定位失败，点击重试';
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
}

// 反查城市/区域名（OpenStreetMap Nominatim，免密钥、支持跨域）。
function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&accept-language=zh-CN`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);

    fetch(url, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(data => {
            const a = data.address || {};
            const city = a.city || a.town || a.county || a.state || '';
            const dist = a.district || a.suburb || a.city_district || a.neighbourhood || '';
            const text = [city, dist].filter(Boolean).join(' · ');
            if (state.location) {
                state.location.city = text;
                persistLocation();
            }
            if (!state.useNearby) renderNearby(text);
            renderNearbyMeta();
        })
        .catch(() => { /* 反查失败不影响主流程 */ })
        .finally(() => clearTimeout(timer));
}

// 持久化定位（下次进入免重复授权）
function persistLocation() {
    try {
        localStorage.setItem('location', JSON.stringify(state.location));
    } catch (e) { /* 隐私模式等写入失败，忽略 */ }
}

// 三档"附近范围"：店铺数越多，搜索半径越大、抓取页数越多。
// 高德 place/around 单页最多 25 条，故页数 = ceil(目标数 / 25)，多抓几页留余量去重。
const NEARBY_LEVELS = {
    1: { count: 60,  radius: 1500, pages: 4,  label: '附近 60 家' },
    2: { count: 180, radius: 3000, pages: 9,  label: '附近 180 家' },
    3: { count: 360, radius: 5000, pages: 18, label: '附近 360 家' }
};

// 拉取附近真实店铺（高德地图 Web服务，国内数据齐全、服务器在境内、返回 CORS:* 可前端直调），
// 整合进转盘/列表。流程：浏览器 GPS(WGS-84) -> 高德坐标转换为 GCJ-02（消除偏移）
// -> 周边搜索(餐饮大类 050000) 按档位取多页 -> 解析真实店名/品类/距离。
function loadNearbyPlaces(auto = false) {
    if (!state.location) { requestLocation(); return; }
    const statusEl = document.getElementById('nearby-status');
    const { latitude: lat, longitude: lon } = state.location;
    const lvl = NEARBY_LEVELS[state.nearbyLevel] || NEARBY_LEVELS[1];

    if (statusEl) statusEl.textContent = `正在搜索${lvl.label}…`;
    showToast(`正在搜索${lvl.label}…`);

    // 高德请求统一带超时；任一步失败都回退到友好提示
    const fetchJSON = (url) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        return fetch(url, { signal: ctrl.signal })
            .then(r => r.json())
            .finally(() => clearTimeout(timer));
    };

    // ① GPS(WGS-84) -> 高德 GCJ-02。浏览器定位是 WGS-84，直接喂高德会偏几百米。
    const convUrl = `https://restapi.amap.com/v3/assistant/coordinate/convert`
        + `?locations=${lon},${lat}&coordsys=gps&key=${AMAP_KEY}`;

    fetchJSON(convUrl)
        .then(d => {
            // 转换失败（额度/网络）就退而用原始坐标，偏移可接受
            const center = (d && d.status === '1' && d.locations) ? d.locations : `${lon},${lat}`;
            return center;
        })
        .then(center => {
            // ② 周边搜索餐饮大类（types=050000），半径/页数按档位放大，按距离排序。
            // 关键：高德个人 key 对并发很敏感，一次性并发多页会触发 QPS 限制(错误码 10021)
            // 导致大量页失败、拉不满目标数。故改为「每批 2 页、批间隔 550ms」逐批拉取，
            // 实测档2/档3 全页成功（详见提交说明）。代价是档3约需 6 秒，期间显示进度。
            const base = `https://restapi.amap.com/v3/place/around`
                + `?key=${AMAP_KEY}&location=${center}&types=050000`
                + `&radius=${lvl.radius}&sortrule=distance&offset=25&extensions=all`;
            const BATCH = 2, GAP = 550;
            const sleep = (ms) => new Promise(res => setTimeout(res, ms));
            const results = [];

            // 逐批拉取，批内并发 BATCH 页，批间隔 GAP 毫秒
            return (async () => {
                for (let start = 1; start <= lvl.pages; start += BATCH) {
                    const batch = [];
                    for (let p = start; p < start + BATCH && p <= lvl.pages; p++) {
                        batch.push(fetchJSON(`${base}&page=${p}`).catch(() => null));
                    }
                    const got = await Promise.all(batch);
                    results.push(...got);
                    // 多档时给个进度感（按已请求页数估算），让用户知道在加载
                    if (statusEl && lvl.pages > 4) {
                        const done = Math.min(start + BATCH - 1, lvl.pages);
                        statusEl.textContent = `正在搜索${lvl.label}…(${Math.round(done / lvl.pages * 100)}%)`;
                    }
                    if (start + BATCH <= lvl.pages) await sleep(GAP);
                }
                return results;
            })();
        })
        .then(results => {
            const seen = new Set();
            const places = [];
            results.forEach(r => {
                if (!r || r.status !== '1' || !Array.isArray(r.pois)) return;
                r.pois.forEach(poi => {
                    const name = (poi.name || '').trim();
                    if (!name || seen.has(name)) return;
                    // 路线 A：剔除酒吧/茶馆等基本不上外卖的业态，降低抽中后搜不到的概率
                    if (isUnlikelyDelivery(poi.type, name)) return;
                    seen.add(name);
                    const dist = parseInt(poi.distance, 10);
                    const distText = isNaN(dist) ? ''
                        : (dist < 1000 ? `${dist} 米` : `${(dist / 1000).toFixed(1)} 公里`);
                    const addr = typeof poi.address === 'string' ? poi.address : '';
                    const category = amapCuisine(poi.type);
                    // 高德 extensions=all 返回的真实店铺照片 photos:[{title,url}]，取第一张作主图；
                    // 拉不到/超时则由 progressiveImg 回退到品类色卡，绝不空白。
                    // http 图在 https 页面会被当混合内容拦截，强制转 https
                    const photo = Array.isArray(poi.photos) && poi.photos[0] && poi.photos[0].url
                        ? poi.photos[0].url.replace(/^http:\/\//, 'https://') : '';
                    const card = placeIcon(category, name);
                    places.push({
                        name,
                        category,
                        _dist: isNaN(dist) ? Infinity : dist,
                        description: `距你约 ${distText}${addr ? ' · ' + addr : ''}`.trim(),
                        image: photo || card,    // 有真照用真照，没有就直接用色卡
                        imageFallback: card,     // 真照加载失败时的兜底
                        isNearby: true,
                        // 保留高德返回的店铺坐标(GCJ-02 "lng,lat")与地址，
                        // 跳转外卖时用于唤起 App 并尽量定位到这家店
                        location: typeof poi.location === 'string' ? poi.location : '',
                        address: addr,
                        sourceType: typeof poi.type === 'string' ? poi.type : '',
                        searchKeywords: buildDeliveryKeywords({ name, category, sourceType: poi.type, isNearby: true })
                    });
                });
            });
            places.sort((a, b) => a._dist - b._dist);

            if (places.length === 0) {
                if (statusEl) statusEl.textContent = '附近暂未找到收录的店铺，可换个位置或去美团看看';
                showToast('附近暂无收录的店铺');
                return;
            }
            enterNearbyMode(places.slice(0, lvl.count), auto);
        })
        .catch(() => {
            if (statusEl) statusEl.textContent = '附近店铺加载失败，请重试';
            showToast('加载附近店铺失败，请检查网络后重试');
        });
}

// 路线 A 命中率优化：剔除「基本不在美团外卖上」的业态，避免抽中后搜不到。
// 酒吧/酒馆/茶馆/咖啡馆/夜店这类多为堂食，跳美团外卖经常无结果；纯饮品店也常缺。
// 返回 true 表示「应当从附近列表里剔除」。判断同时看高德 type 文本与店名关键词。
function isUnlikelyDelivery(typeStr, name) {
    const t = (typeStr || '') + ' ' + (name || '');
    // 明确偏堂食/非外卖或美团外卖覆盖不稳定的业态关键词。
    const exclude = /酒吧|清吧|夜店|酒馆|livehouse|KTV|茶艺|茶楼|茶馆|茶室|网咖|网吧|桌游|剧本杀|会所|食堂|棋牌|台球|水吧|烟酒|便利店|超市/i;
    if (exclude.test(t)) return true;
    // 纯咖啡/纯茶空间经常只有到店消费；奶茶、甜品、蛋糕等仍保留。
    if (/咖啡|咖啡厅|咖啡馆|茶饮|饮品|冷饮/.test(t) && !/奶茶|甜品|蛋糕|烘焙|面包|果茶|茶饮/.test(t)) return true;
    return false;
}

// 高德 POI 的 type 文本（如"餐饮服务;咖啡厅;咖啡厅"）映射成简短中文品类，用于卡片与配色
function amapCuisine(typeStr) {
    const t = typeStr || '';
    const rules = [
        [/咖啡/, '咖啡'], [/茶艺|茶楼|茶馆/, '咖啡/茶'], [/冷饮|甜品|糕饼|蛋糕|冰淇淋/, '甜品'],
        [/快餐/, '快餐'], [/火锅/, '火锅'], [/烧烤|烤肉/, '烧烤'], [/海鲜/, '海鲜'],
        [/日本|日料|寿司/, '日料'], [/韩国|韩式/, '韩餐'], [/西餐|披萨|比萨/, '西餐'],
        [/清真|新疆/, '清真'], [/面|粉/, '面馆'], [/川菜|湘菜|粤菜|中餐|餐厅|饭/, '中餐'],
        [/酒吧|酒馆/, '酒馆']
    ];
    for (const [re, label] of rules) if (re.test(t)) return label;
    return '餐厅';
}

// 进入附近模式：用真实店铺填充转盘/列表
function enterNearbyMode(places, auto = false) {
    state.nearbyPlaces = places;
    state.useNearby = true;
    state.selectedCategories = [];

    const statusEl = document.getElementById('nearby-status');
    const exitBtn = document.getElementById('nearby-exit-btn');
    const goBtn = document.getElementById('nearby-meituan-btn');
    if (statusEl) statusEl.textContent = `已加载附近 ${places.length} 家店，可抽取`;
    if (exitBtn) exitBtn.style.display = 'inline-flex';
    if (goBtn) goBtn.textContent = '重新加载';

    document.getElementById('nearby-card').classList.add('nearby-active');
    toggleCategoryUI(false);  // 附近模式隐藏内置分类筛选

    drawWheel();
    updateWheelCount();
    renderFoodGrid();         // 不论当前在哪页，都刷新列表为附近店铺
    // 自动进入（页面加载触发）时不打断用户、不强制跳转盘页、不弹 toast
    if (!auto) {
        switchTab('wheel');
        showToast(`附近 ${places.length} 家店已就位，开抽吧！`);
    }
}

// 退出附近模式，回到内置菜单
function exitNearbyMode() {
    state.useNearby = false;
    state.nearbyPlaces = [];
    const exitBtn = document.getElementById('nearby-exit-btn');
    const goBtn = document.getElementById('nearby-meituan-btn');
    if (exitBtn) exitBtn.style.display = 'none';
    if (goBtn) goBtn.textContent = '发现附近';
    document.getElementById('nearby-card').classList.remove('nearby-active');
    renderNearby(state.location ? state.location.city : '');
    toggleCategoryUI(true);
    drawWheel();
    updateWheelCount();
    if (state.currentTab === 'list') renderFoodGrid();
    showToast('已切回内置菜单');
}

// 切换"内置分类筛选 / 列表分类条"的显隐（附近模式下隐藏）
function toggleCategoryUI(show) {
    const filters = document.querySelector('#wheel-tab .filters');
    const catFilter = document.getElementById('category-filter');
    if (filters) filters.style.display = show ? '' : 'none';
    if (catFilter) catFilter.style.display = show ? '' : 'none';
}

// 为附近店铺生成一张带品类图标的本地图片（SVG data URI，无需图片文件、不裂图）
function placeIcon(category, name) {
    const palette = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#BB8FCE', '#F7DC6F', '#74B9FF', '#55EFC4'];
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const bg = palette[h % palette.length];
    const emojiMap = {
        '面馆': '🍜', '火锅': '🍲', '烧烤': '🍢', '汉堡': '🍔', '披萨': '🍕', '日料': '🍣',
        '寿司': '🍣', '韩餐': '🍚', '咖啡': '☕', '咖啡/茶': '☕', '甜品': '🍰', '冰淇淋': '🍦',
        '炸鸡': '🍗', '海鲜': '🦐', '快餐': '🍱', '饺子': '🥟', '酒馆': '🍻', '中餐': '🥘'
    };
    const emoji = emojiMap[category] || '🍴';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
        <rect width="400" height="300" fill="${bg}"/>
        <text x="200" y="150" font-size="120" text-anchor="middle" dominant-baseline="central">${emoji}</text>
        <text x="200" y="250" font-size="22" fill="#fff" text-anchor="middle" font-family="sans-serif">${escapeHtml(category)}</text>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function initShakeDetection() {
    if (!window.DeviceMotionEvent) return;

    let lastTime = 0;
    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;

    window.addEventListener('devicemotion', (e) => {
        const current = e.accelerationIncludingGravity;
        const currentTime = new Date().getTime();

        if ((currentTime - lastTime) > 100) {
            const diffTime = currentTime - lastTime;
            lastTime = currentTime;

            const x = current.x;
            const y = current.y;
            const z = current.z;

            const speed = Math.abs(x + y + z - lastX - lastY - lastZ) / diffTime * 10000;

            if (speed > 3000 && state.currentTab === 'wheel' && !state.isSpinning) {
                spinWheel();
                showToast('🎲 摇一摇抽取！');
            }

            lastX = x;
            lastY = y;
            lastZ = z;
        }
    });
}
