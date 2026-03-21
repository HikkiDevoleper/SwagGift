const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();
tg.enableClosingConfirmation();

// State
let user = null;
let prizesList = null;
let currentTab = 'inventory';
let isSpinning = false;
let isOwner = false;

// API Helper
async function api(endpoint, method = "GET", body = null) {
    const res = await fetch(`/api/${endpoint}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-Telegram-Init-Data": tg.initData || ""
        },
        body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
}

// Initialization
async function init() {
    console.log("App init...");
    if (!tg.initData && tg.initDataUnsafe && Object.keys(tg.initDataUnsafe).length === 0) {
        await new Promise(r => setTimeout(r, 800));
    }

    try {
        const [userData, prizesData] = await Promise.all([
            api("user"),
            api("prizes_list")
        ]);
        
        user = userData.user;
        prizesList = prizesData.prizes;
        isOwner = userData.is_owner;
        
        updateUI();
        initSlider();
        switchTab('inventory');
        
        if (isOwner) {
            document.getElementById("admin-tab-btn").style.display = "block";
        }
        if (userData.free_used) {
            document.getElementById("btn-free").classList.add("disabled");
            document.getElementById("btn-free").innerHTML = "<span>✅ Бесплатный шанс использован</span>";
        }
        
        document.getElementById("loading").style.display = "none";
        document.getElementById("app").style.display = "block";
        tg.HapticFeedback.impactOccurred('medium');
        
    } catch (err) {
        console.error("Init failure:", err);
        const loadingText = document.querySelector(".loading-text");
        if (loadingText) {
            loadingText.innerHTML = "Ошибка аутентификации.<br><button onclick='location.reload()' style='margin-top:10px; background:white; color:black; border:none; padding:5px 10px; border-radius:5px;'>Повторить</button>";
        }
    }
}

function updateUI() {
    document.getElementById("user-name").innerText = user.first_name || user.username || "Игрок";
    document.getElementById("wins-count").innerText = user.wins || 0;
    document.getElementById("spins-count").innerText = user.spins || 0;
    
    const wins = user.wins || 0;
    let rank = "Новичок";
    if (wins >= 50) rank = "Легенда";
    else if (wins >= 20) rank = "Мастер";
    else if (wins >= 10) rank = "Везунчик";
    else if (wins >= 3) rank = "Начинающий";
    document.getElementById("user-rank").innerText = rank;
}

// Slider Logic
function initSlider() {
    const slider = document.getElementById("slider");
    slider.innerHTML = "";
    for (let i = 0; i < 40; i++) {
        const randomPrize = prizesList[Math.floor(Math.random() * prizesList.length)];
        slider.appendChild(createItemCard(randomPrize));
    }
}

function createItemCard(prize) {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
        <div class="item-emoji">${prize.emoji}</div>
        <div class="item-rarity-indicator" style="background: ${getRarityColor(prize.rarity)}"></div>
    `;
    return card;
}

function getRarityColor(rarity) {
    const colors = {
        "Обычный": "var(--common)",
        "Редкий": "var(--rare)",
        "Эпический": "var(--epic)",
        "Легендарный": "var(--legend)",
    };
    return colors[rarity] || "#fff";
}

// Tabs
document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        switchTab(tab);
    });
});

async function switchTab(tab) {
    currentTab = tab;
    const tabContent = document.getElementById("tab-content");
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.toggle("active", item.getAttribute("data-tab") === tab);
    });
    
    tabContent.innerHTML = '<div class="loader" style="position:relative; margin: 40px auto;"></div>';
    
    try {
        if (tab === 'inventory') {
            const data = await api("user");
            renderInventory(data.prizes);
        } else if (tab === 'top') {
            const data = await api("leaderboard");
            renderLeaderboard(data.rows);
        } else if (tab === 'history') {
            const data = await api("history");
            renderHistory(data.history);
        } else if (tab === 'admin') {
            const settings = await api("admin/settings");
            renderAdmin(settings);
        }
    } catch (e) {
        tabContent.innerHTML = "<p style='text-align:center;'>Ошибка загрузки</p>";
    }
}

function renderInventory(items) {
    const container = document.getElementById("tab-content");
    if (!items || items.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:rgba(255,255,255,0.4); margin-top:40px;'>У вас пока нет призов.</p>";
        return;
    }
    const html = items.map(it => `
        <div class="premium-card">
            <div class="card-emoji">${getEmojiForName(it.name)}</div>
            <div class="card-info">
                <div class="name">${it.name}</div>
                <div class="date">${it.date}</div>
            </div>
            <div class="rarity-label" style="background: ${getRarityColor(it.rarity)}66; color: ${getRarityColor(it.rarity)}">${it.rarity}</div>
        </div>
    `).join("");
    container.innerHTML = `<div class="list-container">${html}</div>`;
}

function renderLeaderboard(rows) {
    const container = document.getElementById("tab-content");
    const medals = ["🥇", "🥈", "🥉"];
    const html = rows.map((r, i) => `
        <div class="premium-card">
            <div style="font-weight:900; font-size: 18px; width: 30px; color: var(--primary);">${medals[i] || (i + 1)}</div>
            <div class="card-info">
                <div class="name">${r.first_name || r.username || "Игрок"}</div>
                <div class="date">${r.spins} спинов</div>
            </div>
            <div style="font-weight: 800; font-size: 16px; color: var(--legend);">${r.wins} 🏆</div>
        </div>
    `).join("");
    container.innerHTML = `<div class="list-container">${html}</div>`;
}

function renderHistory(history) {
    const container = document.getElementById("tab-content");
    if (!history || history.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:rgba(255,255,255,0.4); margin-top:40px;'>История пуста</p>";
        return;
    }
    const html = history.map(h => `
        <div class="premium-card">
            <div class="card-emoji">${getEmojiForName(h.prize_name)}</div>
            <div class="card-info">
                <div class="name">${h.first_name || h.username || "Аноним"}</div>
                <div class="date">${h.prize_name} • ${h.won_at.split('T')[1].slice(0, 5)}</div>
            </div>
            <div class="rarity-label" style="background: ${getRarityColor(h.rarity)}66; color: ${getRarityColor(h.rarity)}">${h.rarity}</div>
        </div>
    `).join("");
    container.innerHTML = `<div class="list-container">${html}</div>`;
}

function renderAdmin(settings) {
    const container = document.getElementById("tab-content");
    const getStatus = (val) => val ? '<span style="color:var(--common)">ВКЛ</span>' : '<span style="color:var(--accent)">ВЫКЛ</span>';
    
    container.innerHTML = `
        <div class="list-container">
            <div class="premium-card" onclick="toggleAdmin('demo')">
                <div class="card-info">
                    <div class="name">🚀 Демонстрационный режим</div>
                    <div class="date">Все призы считаются демо-выигрышами</div>
                </div>
                <div>${getStatus(settings.demo)}</div>
            </div>
            <div class="premium-card" onclick="toggleAdmin('gifts')">
                <div class="card-info">
                    <div class="name">🎁 Отправка подарков</div>
                    <div class="date">Автоматическая отправка в Telegram</div>
                </div>
                <div>${getStatus(settings.gifts)}</div>
            </div>
            <div class="premium-card" onclick="toggleAdmin('maint')">
                <div class="card-info">
                    <div class="name">🛠 Технические работы</div>
                    <div class="date">Ограничить доступ игрокам</div>
                </div>
                <div>${getStatus(settings.maint)}</div>
            </div>
             <div class="premium-card" onclick="toggleAdmin('testpay')">
                <div class="card-info">
                    <div class="name">💳 Тестовая оплата</div>
                    <div class="date">Владелец может крутить бесплатно</div>
                </div>
                <div>${getStatus(settings.testpay)}</div>
            </div>
            <div style="padding: 10px; font-size: 11px; color: var(--text-muted); text-align:center;">
                ID Владельца: ${user.user_id}<br>
                Стоимость спина: ${settings.cost} ⭐<br>
                Админ-панель бота доступна по /admin
            </div>
        </div>
    `;
}

async function toggleAdmin(key) {
    tg.HapticFeedback.impactOccurred('light');
    try {
        const res = await api("admin/toggle", "POST", { key });
        if (res.ok) {
            const settings = await api("admin/settings");
            renderAdmin(settings);
        }
    } catch (e) {
        tg.showAlert("Ошибка изменения настроек");
    }
}

function getEmojiForName(name) {
    const p = prizesList.find(x => x.name === name);
    return p ? p.emoji : "🎁";
}

// Spin Handling
document.getElementById("btn-spin").addEventListener("click", () => startSpin(false));
document.getElementById("btn-free").addEventListener("click", () => startSpin(true));

async function startSpin(isFree = false) {
    if (isSpinning) return;
    try {
        if (isFree) {
            if (document.getElementById("btn-free").classList.contains("disabled")) return;
            const res = await api("free_spin", "POST");
            if (res.error === "not_subscribed") {
                tg.showConfirm("Подпишитесь на канал @cheatdurov для бесплатного спина!", (ok) => {
                    if (ok) tg.openLink("https://t.me/cheatdurov");
                });
                return;
            }
            if (res.error === "already_used") {
                tg.showAlert("Бесплатный спин уже использован.");
                return;
            }
            executeSliderAnimation(res.winner);
        } else {
            const { invoice_link } = await api("create_invoice", "POST");
            tg.openInvoice(invoice_link, (status) => {
                if (status === "paid") pollResult();
            });
        }
    } catch (e) {
        tg.showAlert("Ошибка: " + e.message);
    }
}

async function pollResult() {
    tg.MainButton.setText("ПОЛУЧЕНИЕ РЕЗУЛЬТАТА...").show();
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
            const { result } = await api("spin_result");
            if (result) {
                tg.MainButton.hide();
                executeSliderAnimation(result.winner);
                return;
            }
        } catch (e) {}
    }
    tg.MainButton.hide();
    tg.showAlert("Результат задерживается. Проверьте инвентарь.");
}

function executeSliderAnimation(winner) {
    isSpinning = true;
    const slider = document.getElementById("slider");
    const itemWidth = 120;
    slider.style.transition = 'none';
    slider.style.transform = 'translateX(0)';
    slider.innerHTML = "";
    
    const winningPos = 45;
    for (let i = 0; i < 60; i++) {
        const prize = (i === winningPos) ? winner : prizesList[Math.floor(Math.random() * prizesList.length)];
        slider.appendChild(createItemCard(prize));
    }
    void slider.offsetWidth;
    const centerOffset = 60;
    const slideTo = -((winningPos * itemWidth) - (slider.offsetParent.offsetWidth / 2) + centerOffset);
    
    slider.style.transition = 'transform 6s cubic-bezier(0.1, 0, 0, 1)';
    slider.style.transform = `translateX(${slideTo}px)`;
    
    const tick = setInterval(() => tg.HapticFeedback.impactOccurred('light'), 150);
    setTimeout(() => clearInterval(tick), 5000);

    setTimeout(() => {
        isSpinning = false;
        slider.children[winningPos].classList.add('won');
        setTimeout(() => showOverlay(winner), 800);
        api("user").then(data => {
            user = data.user;
            updateUI();
            if (data.free_used) {
                document.getElementById("btn-free").classList.add("disabled");
                document.getElementById("btn-free").innerHTML = "<span>✅ Бесплатный шанс использован</span>";
            }
        });
    }, 6200);
}

function showOverlay(winner) {
    if (winner.type === 'nothing') {
        tg.HapticFeedback.notificationOccurred('warning');
        tg.showAlert("Упс! Попробуйте еще раз.");
    } else {
        const overlay = document.getElementById("overlay");
        const color = getRarityColor(winner.rarity);
        document.getElementById("result-emoji").innerText = winner.emoji;
        document.getElementById("result-name").innerText = winner.name;
        document.getElementById("result-rarity").innerText = winner.rarity;
        document.getElementById("result-rarity").style.color = color;
        document.getElementById("result-glow").style.background = color;
        overlay.style.display = "flex";
        tg.HapticFeedback.notificationOccurred('success');
    }
}

function closeOverlay() {
    document.getElementById("overlay").style.display = "none";
}

init();
