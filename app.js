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
    lastResultName: null,
    soundOn: localStorage.getItem('soundOn') !== '0',  // 默认开
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
    initTabs();
    initFilters();
    initWheel();
    initListPage();
    initFavoritesPage();
    initHistoryPage();
    initThemeToggle();
    initSoundToggle();
    initTodayPick();
    initAvoidRepeat();
    initNearby();
    initShakeDetection();
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
    const filterChips = document.getElementById('filter-chips');
    const filterAll = document.getElementById('filter-all');

    // 渲染分类筛选项
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

    // "全部"复选框
    filterAll.addEventListener('change', () => {
        if (filterAll.checked) {
            state.selectedCategories = [];
            document.querySelectorAll('.filter-chip').forEach(chip => {
                chip.classList.remove('active');
                chip.querySelector('input').checked = false;
            });
            drawWheel();
            updateWheelCount();
        }
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

// 获取筛选后的美食列表（附近模式不分类，直接返回全部附近店铺）
function getFilteredFoods() {
    if (state.useNearby) {
        return state.nearbyPlaces;
    }
    if (state.selectedCategories.length === 0) {
        return foodData;
    }
    return foodData.filter(food => state.selectedCategories.includes(food.category));
}

// 初始化转盘
function initWheel() {
    // 设置 canvas 尺寸
    const size = 300;
    canvas.width = size;
    canvas.height = size;

    drawWheel();

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
        ? `🎯 附近 ${n} 家店参与抽取`
        : `🎯 当前 ${n} 道菜参与抽取`;
}

// 当前转盘上对应的美食列表（抽取时锁定，保证指针与结果一致）
let wheelFoods = [];

// 绘制转盘（rotation 为整体旋转角度，单位弧度）
function drawWheel(rotation = 0) {
    const foods = getFilteredFoods();
    wheelFoods = foods;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2 - 10;
    const arcAngle = (2 * Math.PI) / foods.length;

    // 在未变换的坐标系中清空整个画布（避免旋转后清不干净产生重影）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 应用整体旋转
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);

    // 绘制扇形
    foods.forEach((food, index) => {
        const startAngle = index * arcAngle - Math.PI / 2;
        const endAngle = startAngle + arcAngle;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fillStyle = wheelColors[index % wheelColors.length];
        ctx.fill();

        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 绘制文字（沿扇形中线）
        ctx.save();
        ctx.rotate(startAngle + arcAngle / 2);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.font = foods.length > 30 ? 'bold 9px Arial' : 'bold 12px Arial';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 3;
        ctx.fillText(food.name, radius - 8, 0, radius - 38);
        ctx.restore();
    });

    ctx.restore();

    // 绘制中心圆（未变换坐标系）
    ctx.beginPath();
    ctx.arc(centerX, centerY, 30, 0, 2 * Math.PI);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#667eea';
    ctx.font = '22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍴', centerX, centerY);
}

// 转盘旋转动画
function spinWheel() {
    if (state.isSpinning) return;

    const foods = getFilteredFoods();
    if (foods.length === 0) {
        showToast('请至少选择一个分类！');
        return;
    }

    state.isSpinning = true;
    spinBtn.disabled = true;
    spinBtn.querySelector('span').textContent = '抽取中...';
    resultCard.style.display = 'none';

    // 随机选择一个美食
    let selectedIndex = Math.floor(Math.random() * foods.length);
    // 避免连续重复：与上次结果相同则重选（多于一道菜时才有意义）
    if (state.avoidRepeat && foods.length > 1) {
        let guard = 0;
        while (foods[selectedIndex].name === state.lastResultName && guard < 20) {
            selectedIndex = Math.floor(Math.random() * foods.length);
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
            // 精确停在目标角度，确保指针对准选中扇形
            drawWheel(finalRotation % (2 * Math.PI));
            finishSpin(selectedFood);
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

    // 添加到历史记录
    addToHistory(food);

    // 抽中时震动反馈（支持的移动端）
    if (navigator.vibrate) {
        navigator.vibrate([60, 40, 120]);
    }

    // 显示结果（不重绘转盘，保持指针停留的位置）
    showResult(food);
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

    // 去外卖平台下单（随机选完直接跳转点单）
    document.getElementById('order-meituan').onclick = () => openDelivery('meituan', food);
    document.getElementById('order-eleme').onclick = () => openDelivery('eleme', food);

    // 附近模式：提示语改为"去这家店下单"
    const hint = document.querySelector('#result-card .delivery-hint');
    if (hint) hint.textContent = food.isNearby
        ? '🛵 去美团/饿了么搜这家店下单'
        : '🛵 去外卖平台点这道菜';
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

// 复制结果到剪贴板，方便分享
function shareResult(food) {
    const text = `🍴 今天吃【${food.name}】！(${food.category}) —— 来自「今天吃什么」美食转盘`;
    copyText(text).then(
        () => showToast('结果已复制，去分享吧！'),
        () => showToast('复制失败，请手动选择文字')
    );
}

// 跳转外卖平台：复制菜名 + 打开平台（平台不开放按菜名直达，故复制后到站内粘贴搜索）。
// 移动端打开各平台的 H5「附近」站点，由平台用自身定位展示你身边能点这道菜的店。
function openDelivery(platform, food) {
    const mobile = isMobile();
    const sites = {
        meituan: {
            url: mobile ? 'https://i.waimai.meituan.com' : 'https://waimai.meituan.com',
            name: '美团外卖'
        },
        eleme: {
            url: mobile ? 'https://h5.ele.me' : 'https://www.ele.me',
            name: '饿了么'
        }
    };
    const site = sites[platform];
    if (!site) return;

    const near = state.location ? '附近' : '';
    const go = () => {
        showToast(`已复制【${food.name}】，在${site.name}${near}粘贴搜索即可`);
        window.open(site.url, '_blank');
    };
    copyText(food.name).then(go, go);  // 复制失败也照常跳转
}

// 粗略判断移动端（决定打开 H5 还是桌面站）
function isMobile() {
    return /Android|iPhone|iPad|iPod|HarmonyOS|Mobile/i.test(navigator.userAgent);
}

// 初始化列表页
function initListPage() {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const foodGrid = document.getElementById('food-grid');

    // 渲染分类筛选按钮
    categoryFilter.innerHTML = `
        <button class="category-btn active" data-category="all">全部</button>
        ${categories.map(cat => `
            <button class="category-btn" data-category="${cat}">${cat}</button>
        `).join('')}
    `;

    // 分类筛选事件
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

// 从收藏中随机挑一个（解决"收藏一堆还是不知道吃啥"）
function pickRandomFavorite() {
    if (state.favorites.length === 0) return;
    const food = state.favorites[Math.floor(Math.random() * state.favorites.length)];
    if (navigator.vibrate) navigator.vibrate(40);
    addToHistory(food);
    showFoodDetail(food);
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

    // 统计：抽取次数 + 最常抽到
    if (statsEl) {
        const counts = {};
        state.history.forEach(h => { counts[h.name] = (counts[h.name] || 0) + 1; });
        let topName = '', topCount = 0;
        Object.keys(counts).forEach(n => { if (counts[n] > topCount) { topCount = counts[n]; topName = n; } });
        statsEl.style.display = 'block';
        statsEl.innerHTML = `📊 共抽取 <b>${state.history.length}</b> 次 · 最常抽到 <b>${topName}</b>（${topCount} 次）`;
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

// 深色模式切换
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.textContent = '☀️';
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        themeToggle.textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
}

// ============ 音效（Web Audio，无需音频文件）============
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
    }
    return audioCtx;
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

    // 恢复上次定位结果（同一会话/设备免重复授权）
    try {
        const saved = JSON.parse(localStorage.getItem('location') || 'null');
        if (saved && typeof saved.latitude === 'number') {
            state.location = saved;
            renderNearby(saved.city);
        }
    } catch (e) { /* 数据损坏忽略 */ }

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
                if (state.location) loadNearbyPlaces();  // 已定位则立即按新档刷新
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
    if (goBtn) { goBtn.style.display = 'inline-flex'; goBtn.textContent = '🍽 发现附近'; }
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
            loadNearbyPlaces();  // 定位成功立即拉取附近店铺
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
function loadNearbyPlaces() {
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
                        isNearby: true
                    });
                });
            });
            places.sort((a, b) => a._dist - b._dist);

            if (places.length === 0) {
                if (statusEl) statusEl.textContent = '附近暂未找到收录的店铺，可换个位置或去美团看看';
                showToast('附近暂无收录的店铺');
                return;
            }
            enterNearbyMode(places.slice(0, lvl.count));
        })
        .catch(() => {
            if (statusEl) statusEl.textContent = '附近店铺加载失败，请重试';
            showToast('加载附近店铺失败，请检查网络后重试');
        });
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
function enterNearbyMode(places) {
    state.nearbyPlaces = places;
    state.useNearby = true;
    state.selectedCategories = [];

    const statusEl = document.getElementById('nearby-status');
    const exitBtn = document.getElementById('nearby-exit-btn');
    const goBtn = document.getElementById('nearby-meituan-btn');
    if (statusEl) statusEl.textContent = `已加载附近 ${places.length} 家店，可抽取`;
    if (exitBtn) exitBtn.style.display = 'inline-flex';
    if (goBtn) goBtn.textContent = '🔄 重新加载';

    document.getElementById('nearby-card').classList.add('nearby-active');
    toggleCategoryUI(false);  // 附近模式隐藏内置分类筛选

    drawWheel();
    updateWheelCount();
    if (state.currentTab === 'list') renderFoodGrid();
    switchTab('wheel');
    showToast(`附近 ${places.length} 家店已就位，开抽吧！`);
}

// 退出附近模式，回到内置菜单
function exitNearbyMode() {
    state.useNearby = false;
    state.nearbyPlaces = [];
    const exitBtn = document.getElementById('nearby-exit-btn');
    const goBtn = document.getElementById('nearby-meituan-btn');
    if (exitBtn) exitBtn.style.display = 'none';
    if (goBtn) goBtn.textContent = '🍽 发现附近';
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
