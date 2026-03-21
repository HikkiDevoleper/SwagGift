const tg = window.Telegram.WebApp;
const initData = tg.initData;

tg.ready();
tg.expand();

// State
let user = null;
let prizesList = null;
let spinsCount = 0;
let winsCount = 0;
let isSpinning = false;
let currentRotation = 0;

// API Helper
async function api(endpoint, method = "GET", body = null) {
    const res = await fetch(`/api/${endpoint}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-Telegram-Init-Data": initData
        },
        body: body ? JSON.stringify(body) : null
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
}

// Initialization
async function init() {
    try {
        const [userData, prizesData] = await Promise.all([
            api("user"),
            api("prizes_list")
        ]);
        
        user = userData.user;
        prizesList = prizesData.prizes;
        spinsCount = user.spins || 0;
        winsCount = user.wins || 0;
        
        updateStats();
        setupWheel();
        showTab('inventory', userData.prizes);
        
        if (userData.free_used) {
            document.getElementById("btn-free").style.display = "none";
        }
        
        document.getElementById("loading").style.display = "none";
        document.getElementById("app").style.display = "block";
        
    } catch (err) {
        console.error("Init error:", err);
        tg.showAlert("Ошибка загрузки данных. Попробуйте перезагрузить приложение.");
    }
}

function updateStats() {
    document.getElementById("wins-count").innerText = `🏆 ${winsCount}`;
    document.getElementById("spins-count").innerText = `🎰 ${spinsCount}`;
}

function setupWheel() {
    const wheel = document.getElementById("wheel");
    wheel.innerHTML = "";
    
    // We create a wheel with fixed emojis for visual effect
    const emojis = ["🌹", "💐", "🎂", "🧸", "❤️", "🏆", "💎", "💀"];
    const count = emojis.length;
    
    emojis.forEach((emoji, i) => {
        const item = document.createElement("div");
        item.className = "wheel-item";
        item.innerText = emoji;
        item.style.transform = `rotate(${(i * 360) / count}deg)`;
        wheel.appendChild(item);
    });
}

// Navigation
async function showTab(tab, preloadedData = null) {
    const tabContent = document.getElementById("tab-content");
    const buttons = document.querySelectorAll(".tab-btn");
    
    buttons.forEach(btn => {
        btn.classList.toggle("active", btn.innerText.toLowerCase().includes(tab.toLowerCase()));
    });
    
    tabContent.innerHTML = '<div class="loader-small"></div>';
    
    try {
        if (tab === 'inventory') {
            const data = preloadedData || (await api("user")).prizes;
            renderInventory(data);
        } else if (tab === 'top') {
            const data = await api("leaderboard");
            renderTop(data.rows);
        } else if (tab === 'rules') {
            renderRules();
        }
    } catch (err) {
        tabContent.innerHTML = "<p>Ошибка загрузки вкладки</p>";
    }
}

function renderInventory(items) {
    const tabContent = document.getElementById("tab-content");
    if (!items || items.length === 0) {
        tabContent.innerHTML = '<p style="text-align:center; padding: 20px; color: #888;">У вас пока нет призов</p>';
        return;
    }
    
    const colors = {
        "Обычный": "#4CAF50",
        "Редкий": "#2196F3",
        "Эпический": "#9C27B0",
        "Легендарный": "#FFD700"
    };
    
    const html = items.map(it => `
        <div class="inv-item">
            <div class="inv-emoji">${getEmojiForKey(it.name)}</div>
            <div class="inv-info">
                <div class="inv-name">${it.name}</div>
                <div class="inv-date">${it.date}</div>
            </div>
            <span class="rarity-pill" style="color:${colors[it.rarity] || '#fff'}">${it.rarity}</span>
        </div>
    `).join("");
    
    tabContent.innerHTML = `<div class="inv-list">${html}</div>`;
}

function getEmojiForKey(name) {
    const p = prizesList.find(p => p.name === name);
    return p ? p.emoji : "🎁";
}

function renderTop(rows) {
    const tabContent = document.getElementById("tab-content");
    const medals = ["🥇", "🥈", "🥉"];
    const html = rows.map((r, i) => `
        <div class="top-item">
            <span class="top-rank">${medals[i] || (i + 1)}</span>
            <span class="top-name">${r.first_name || r.username || 'Игрок'}</span>
            <span class="top-wins">${r.wins} 🏆</span>
        </div>
    `).join("");
    tabContent.innerHTML = `<div class="top-list">${html}</div>`;
}

function renderRules() {
    const tabContent = document.getElementById("tab-content");
    const html = prizesList.map(p => `
        <div class="inv-item" style="opacity: ${p.key === 'nothing' ? 0.5 : 1}">
            <div class="inv-emoji">${p.emoji}</div>
            <div class="inv-info">
                <div class="inv-name">${p.name}</div>
                <div class="inv-date">${p.rarity}</div>
            </div>
            <div style="font-weight: 800; font-size: 14px;">${((p.weight / 167) * 100).toFixed(1)}%</div>
        </div>
    `).join("");
    tabContent.innerHTML = `<div class="inv-list">${html}</div>`;
}

// Logic: Spin
async function startSpin(isFree = false) {
    if (isSpinning) return;
    
    try {
        if (isFree) {
            const res = await api("free_spin", "POST");
            if (res.error === "not_subscribed") {
                tg.showConfirm("Для бесплатного спина нужно подписаться на канал @cheatdurov. Открыть канал?", (ok) => {
                    if (ok) tg.openLink("https://t.me/cheatdurov");
                });
                return;
            }
            if (res.error === "already_used") {
                tg.showAlert("Бесплатный спин уже использован.");
                return;
            }
            animateSpin(res.winner);
        } else {
            const { invoice_link } = await api("create_invoice", "POST");
            tg.openInvoice(invoice_link, (status) => {
                if (status === "paid") {
                    pollResult();
                } else {
                    tg.showAlert("Оплата не была завершена.");
                }
            });
        }
    } catch (err) {
        tg.showAlert("Ошибка при запуске спина.");
    }
}

async function pollResult() {
    tg.MainButton.setText("Проверка оплаты...").show();
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
            const { result } = await api("spin_result");
            if (result) {
                tg.MainButton.hide();
                animateSpin(result.winner);
                return;
            }
        } catch (e) {}
    }
    tg.MainButton.hide();
    tg.showAlert("Платёж задерживается. Если подарок не придёт — напишите в поддержку.");
}

function animateSpin(winner) {
    isSpinning = true;
    const wheel = document.getElementById("wheel");
    
    // Calculate winning angle
    const emojis = ["🌹", "💐", "🎂", "🧸", "❤️", "🏆", "💎", "💀"];
    const winnerIdx = emojis.indexOf(winner.emoji);
    if (winnerIdx === -1) return animateSpin({emoji: "💀", name: "Пусто", type: "nothing", rarity: "—"});
    
    const count = emojis.length;
    const extraRotations = 5 + Math.floor(Math.random() * 5); // 5-10 full turns
    const itemAngle = 360 / count;
    const targetAngle = (360 - (winnerIdx * itemAngle));
    
    currentRotation += (extraRotations * 360) + (targetAngle - (currentRotation % 360));
    
    wheel.style.transform = `rotate(${currentRotation}deg)`;
    
    // Play sound or haptic
    tg.HapticFeedback.notificationOccurred('success');
    
    setTimeout(() => {
        isSpinning = false;
        showResult(winner);
        spinsCount++;
        if (winner.type !== 'nothing') winsCount++;
        updateStats();
        showTab('inventory'); // reload inventory
    }, 5500);
}

function showResult(winner) {
    if (winner.type === 'nothing') {
        document.getElementById("lose-overlay").style.display = "flex";
        tg.HapticFeedback.notificationOccurred('error');
    } else {
        document.getElementById("win-name").innerText = winner.name;
        document.getElementById("win-emoji").innerText = winner.emoji;
        document.getElementById("win-rarity").innerText = winner.rarity;
        document.getElementById("win-overlay").style.display = "flex";
        tg.HapticFeedback.notificationOccurred('success');
    }
}

function closeOverlay() {
    document.getElementById("win-overlay").style.display = "none";
    document.getElementById("lose-overlay").style.display = "none";
}

// Event Listeners
document.getElementById("btn-spin").addEventListener("click", () => startSpin(false));
document.getElementById("btn-free").addEventListener("click", () => startSpin(true));

// Start
init();
