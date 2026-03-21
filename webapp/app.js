const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();
tg.enableClosingConfirmation();

const state = {
    user: null,
    prizes: [],
    inventory: [],
    leaderboard: [],
    history: [],
    flags: {},
    isOwner: false,
    freeUsed: false,
    spinCost: 15,
    currentTab: "inventory",
    isSpinning: false,
    liveSource: null,
    livePollId: null,
};

const els = {
    loading: document.getElementById("loading"),
    loadingText: document.getElementById("loading-text"),
    app: document.getElementById("app"),
    userName: document.getElementById("user-name"),
    userRank: document.getElementById("user-rank"),
    userAvatar: document.getElementById("user-avatar"),
    wins: document.getElementById("wins-count"),
    spins: document.getElementById("spins-count"),
    stars: document.getElementById("stars-count"),
    heroStatus: document.getElementById("hero-status"),
    liveBadge: document.getElementById("live-badge"),
    spinBadge: document.getElementById("spin-cost-badge"),
    freeBadge: document.getElementById("free-badge"),
    slider: document.getElementById("slider"),
    btnSpin: document.getElementById("btn-spin"),
    btnFree: document.getElementById("btn-free"),
    btnRefresh: document.getElementById("btn-refresh"),
    tabContent: document.getElementById("tab-content"),
    adminTabBtn: document.getElementById("admin-tab-btn"),
    modal: document.getElementById("result-modal"),
    resultEmoji: document.getElementById("result-emoji"),
    resultName: document.getElementById("result-name"),
    resultRarity: document.getElementById("result-rarity"),
    resultHalo: document.getElementById("result-halo"),
    resultNote: document.getElementById("result-note"),
    closeResult: document.getElementById("btn-close-result"),
    toast: document.getElementById("toast"),
};

const rarityColors = {
    "Обычный": "#6ee7b7",
    "Редкий": "#67b7ff",
    "Эпический": "#ff8a5b",
    "Легендарный": "#ffd166",
    "Промах": "#8e9ab5",
};

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function rankForWins(wins) {
    if (wins >= 50) return "Легенда удачи";
    if (wins >= 20) return "Коллекционер";
    if (wins >= 10) return "Охотник за дропом";
    if (wins >= 3) return "Разогнавшийся игрок";
    return "Новый игрок";
}

function formatDate(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

function getPrizeByName(name) {
    return state.prizes.find((item) => item.name === name);
}

function getPrizeByKey(key) {
    return state.prizes.find((item) => item.key === key);
}

function showToast(text, type = "info") {
    els.toast.textContent = text;
    els.toast.className = `toast toast-show ${type}`;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
        els.toast.className = "toast hidden";
    }, 2600);
}

async function api(endpoint, method = "GET", body = null) {
    const response = await fetch(`/api/${endpoint}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-Telegram-Init-Data": tg.initData || "",
        },
        cache: "no-store",
        body: body ? JSON.stringify(body) : null,
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch {
        payload = {};
    }

    if (!response.ok) {
        throw new Error(payload.detail || `HTTP ${response.status}`);
    }
    return payload;
}

function setLoading(text) {
    els.loadingText.textContent = text;
}

function updateProfile() {
    const user = state.user || {};
    const displayName = user.first_name || user.username || "Игрок";
    const firstLetter = (displayName[0] || "🎁").toUpperCase();
    els.userName.textContent = displayName;
    els.userRank.textContent = rankForWins(user.wins || 0);
    els.userAvatar.textContent = /[A-ZА-Я0-9]/i.test(firstLetter) ? firstLetter : "🎁";
    els.wins.textContent = user.wins || 0;
    els.spins.textContent = user.spins || 0;
    els.stars.textContent = `${user.stars_spent || 0}⭐`;
    els.spinBadge.textContent = `${state.spinCost}⭐ за спин`;
    els.freeBadge.textContent = state.freeUsed ? "free used" : "free chance";
    els.heroStatus.textContent = state.freeUsed
        ? "Бесплатный шанс уже использован. Платный спин и live-таблица доступны дальше."
        : "Бесплатный шанс активен. Подпишись на канал и попробуй открыть первый дроп.";
    els.btnFree.disabled = state.freeUsed || state.isSpinning;
    els.btnSpin.disabled = state.isSpinning;
}

function createSliderCard(prize, accent = false) {
    const color = rarityColors[prize.rarity] || "#ffffff";
    return `
        <div class="item-card ${accent ? "accent" : ""}" style="--accent:${color}">
            <div class="item-emoji">${prize.emoji}</div>
            <div class="item-name">${escapeHtml(prize.name)}</div>
            <div class="item-rarity">${escapeHtml(prize.rarity)}</div>
        </div>
    `;
}

function initSlider() {
    const items = [];
    for (let index = 0; index < 28; index += 1) {
        const prize = state.prizes[Math.floor(Math.random() * state.prizes.length)];
        items.push(createSliderCard(prize));
    }
    els.slider.innerHTML = items.join("");
    els.slider.style.transition = "none";
    els.slider.style.transform = "translateX(0)";
}

function renderInventory() {
    if (!state.inventory.length) {
        els.tabContent.innerHTML = `<div class="empty-state">Пока пусто. Первый выигрыш появится здесь.</div>`;
        return;
    }

    els.tabContent.innerHTML = `
        <div class="stack-list">
            ${state.inventory.map((item) => {
                const prize = getPrizeByKey(item.key) || getPrizeByName(item.name) || { emoji: "🎁" };
                const color = rarityColors[item.rarity] || "#ffffff";
                return `
                    <article class="list-card">
                        <div class="list-icon">${prize.emoji}</div>
                        <div class="list-copy">
                            <h3>${escapeHtml(item.name)}</h3>
                            <p>${formatDate(item.date)}</p>
                        </div>
                        <span class="rarity-pill" style="--pill:${color}">${escapeHtml(item.rarity)}</span>
                    </article>
                `;
            }).join("")}
        </div>
    `;
}

function renderHistory() {
    if (!state.history.length) {
        els.tabContent.innerHTML = `<div class="empty-state">Лента пока пустая. Первый выигрыш запустит волну.</div>`;
        return;
    }

    els.tabContent.innerHTML = `
        <div class="stack-list">
            ${state.history.map((row) => {
                const prize = getPrizeByKey(row.prize_key) || getPrizeByName(row.prize_name) || { emoji: "🎁" };
                const color = rarityColors[row.rarity] || "#ffffff";
                return `
                    <article class="list-card live-card">
                        <div class="list-icon">${prize.emoji}</div>
                        <div class="list-copy">
                            <h3>${escapeHtml(row.first_name || row.username || "Аноним")}</h3>
                            <p>${escapeHtml(row.prize_name)} • ${formatDate(row.won_at)}</p>
                        </div>
                        <span class="rarity-pill" style="--pill:${color}">${escapeHtml(row.rarity)}</span>
                    </article>
                `;
            }).join("")}
        </div>
    `;
}

function renderLeaderboard() {
    if (!state.leaderboard.length) {
        els.tabContent.innerHTML = `<div class="empty-state">Рейтинг появится, когда игроки начнут крутить рулетку.</div>`;
        return;
    }

    const medals = ["🥇", "🥈", "🥉"];
    els.tabContent.innerHTML = `
        <div class="stack-list">
            ${state.leaderboard.map((row, index) => `
                <article class="list-card">
                    <div class="list-rank">${medals[index] || `#${index + 1}`}</div>
                    <div class="list-copy">
                        <h3>${escapeHtml(row.first_name || row.username || "Игрок")}</h3>
                        <p>${row.spins || 0} спинов • ${row.stars_spent || 0}⭐</p>
                    </div>
                    <strong class="win-mark">${row.wins || 0} побед</strong>
                </article>
            `).join("")}
        </div>
    `;
}

function renderAdmin() {
    els.tabContent.innerHTML = `
        <div class="stack-list">
            ${renderAdminToggle("demo", "Демо режим", "Все призы записываются как тестовые")}
            ${renderAdminToggle("gifts", "Отправка подарков", "Автоматическая доставка в Telegram")}
            ${renderAdminToggle("maint", "Технический режим", "Закрыть доступ обычным игрокам")}
            ${renderAdminToggle("testpay", "Тест оплаты", "Резервный флаг для владельца")}
            <article class="list-card admin-note">
                <div class="list-copy">
                    <h3>Owner ID</h3>
                    <p>${state.user.user_id}</p>
                </div>
            </article>
        </div>
    `;
}

function renderAdminToggle(key, title, subtitle) {
    const isOn = Boolean(state.flags?.[key]);
    return `
        <button class="list-card admin-toggle" type="button" data-admin-toggle="${key}">
            <div class="list-copy">
                <h3>${title}</h3>
                <p>${subtitle}</p>
            </div>
            <span class="switch-badge ${isOn ? "on" : ""}">${isOn ? "ON" : "OFF"}</span>
        </button>
    `;
}

function renderCurrentTab() {
    if (state.currentTab === "inventory") renderInventory();
    if (state.currentTab === "history") renderHistory();
    if (state.currentTab === "top") renderLeaderboard();
    if (state.currentTab === "admin") renderAdmin();
}

function switchTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll(".tab-btn").forEach((button) => {
        button.classList.toggle("active", button.dataset.tab === tab);
    });
    renderCurrentTab();
}

async function refreshUserState() {
    const data = await api("user");
    state.user = data.user;
    state.inventory = data.prizes;
    state.freeUsed = data.free_used;
    updateProfile();
    if (state.currentTab === "inventory") renderInventory();
}

function showResult(winner, note) {
    const color = rarityColors[winner.rarity] || "#ffffff";
    els.resultEmoji.textContent = winner.emoji;
    els.resultName.textContent = winner.name;
    els.resultRarity.textContent = winner.rarity;
    els.resultRarity.style.color = color;
    els.resultHalo.style.background = color;
    els.resultNote.textContent = note;
    els.modal.classList.remove("hidden");
}

function closeResult() {
    els.modal.classList.add("hidden");
}

function applyLiveSnapshot(payload) {
    if (payload.history) state.history = payload.history;
    if (payload.leaderboard) state.leaderboard = payload.leaderboard;
    renderCurrentTab();
    els.liveBadge.classList.add("connected");
}

function connectLiveStream() {
    if (state.liveSource) state.liveSource.close();
    if (state.livePollId) clearInterval(state.livePollId);

    try {
        const source = new EventSource("/api/live");
        state.liveSource = source;
        source.addEventListener("snapshot", (event) => {
            try {
                applyLiveSnapshot(JSON.parse(event.data));
            } catch {
                //
            }
        });
        source.addEventListener("ping", () => {
            els.liveBadge.classList.add("connected");
        });
        source.onerror = () => {
            els.liveBadge.classList.remove("connected");
            if (!state.livePollId) {
                state.livePollId = setInterval(async () => {
                    try {
                        const [history, leaderboard] = await Promise.all([
                            api("history?limit=10"),
                            api("leaderboard?limit=8"),
                        ]);
                        applyLiveSnapshot({
                            history: history.history,
                            leaderboard: leaderboard.rows,
                        });
                    } catch {
                        //
                    }
                }, 8000);
            }
        };
    } catch {
        els.liveBadge.classList.remove("connected");
        if (!state.livePollId) {
            state.livePollId = setInterval(async () => {
                try {
                    const [history, leaderboard] = await Promise.all([
                        api("history?limit=10"),
                        api("leaderboard?limit=8"),
                    ]);
                    applyLiveSnapshot({
                        history: history.history,
                        leaderboard: leaderboard.rows,
                    });
                } catch {
                    //
                }
            }, 8000);
        }
    }
}

async function pollSpinResult() {
    tg.MainButton.setText("Ищем результат...").show();
    for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1250));
        try {
            const data = await api("spin_result");
            if (data.result) {
                tg.MainButton.hide();
                await executeSliderAnimation(data.result.winner, data.result.is_demo);
                return;
            }
        } catch {
            //
        }
    }
    tg.MainButton.hide();
    showToast("Результат задерживается, но спин сохранён в системе.", "warn");
    await refreshUserState();
}

async function executeSliderAnimation(winner, isDemo = false) {
    state.isSpinning = true;
    updateProfile();

    const deck = [];
    const stopIndex = 42;
    for (let index = 0; index < 56; index += 1) {
        const prize = index === stopIndex
            ? winner
            : state.prizes[Math.floor(Math.random() * state.prizes.length)];
        deck.push(createSliderCard(prize, index === stopIndex));
    }

    els.slider.innerHTML = deck.join("");
    els.slider.style.transition = "none";
    els.slider.style.transform = "translateX(0)";
    void els.slider.offsetWidth;

    const cardWidth = 136;
    const viewportWidth = els.slider.parentElement.offsetWidth;
    const target = -1 * ((stopIndex * cardWidth) - (viewportWidth / 2) + (cardWidth / 2));
    els.slider.style.transition = "transform 5.8s cubic-bezier(0.08, 0.72, 0.1, 1)";
    els.slider.style.transform = `translateX(${target}px)`;

    const hapticTimer = setInterval(() => tg.HapticFeedback.impactOccurred("light"), 140);
    setTimeout(() => clearInterval(hapticTimer), 4800);

    await new Promise((resolve) => setTimeout(resolve, 6200));
    state.isSpinning = false;
    updateProfile();
    await refreshUserState();

    if (winner.type === "nothing") {
        tg.HapticFeedback.notificationOccurred("warning");
        showToast("В этот раз мимо. Следующий спин может быть громче.", "warn");
        return;
    }

    tg.HapticFeedback.notificationOccurred("success");
    showResult(
        winner,
        isDemo
            ? "Демо-режим активен: предмет записан как тестовый выигрыш."
            : "Предмет уже добавлен в ваш профиль и отображается в списке призов."
    );
}

async function startSpin(isFree) {
    if (state.isSpinning) return;

    try {
        if (isFree) {
            if (state.freeUsed) return;
            const result = await api("free_spin", "POST");
            if (result.error === "already_used") {
                state.freeUsed = true;
                updateProfile();
                showToast("Бесплатный шанс уже использован.", "warn");
                return;
            }
            if (result.error === "not_subscribed") {
                tg.showConfirm("Нужна подписка на канал, чтобы забрать бесплатный спин. Открыть канал?", (ok) => {
                    if (ok) tg.openLink(result.channel_url || "https://t.me/cheatdurov");
                });
                return;
            }
            state.freeUsed = true;
            updateProfile();
            await executeSliderAnimation(result.winner, state.flags?.demo);
            return;
        }

        const invoice = await api("create_invoice", "POST");
        tg.openInvoice(invoice.invoice_link, (status) => {
            if (status === "paid") {
                pollSpinResult();
            } else if (status === "cancelled") {
                showToast("Оплата отменена.", "warn");
            } else if (status === "failed") {
                showToast("Оплата не прошла.", "warn");
            }
        });
    } catch (error) {
        showToast(error.message || "Ошибка запуска спина.", "warn");
    }
}

async function toggleAdmin(key) {
    try {
        await api("admin/toggle", "POST", { key });
        const settings = await api("admin/settings");
        state.flags = settings;
        renderAdmin();
        showToast(`Флаг ${key} обновлён.`, "ok");
    } catch (error) {
        showToast(error.message || "Не удалось изменить настройку.", "warn");
    }
}

async function bootstrap() {
    setLoading("Загружаем профиль, дропы и live-данные...");
    const data = await api("bootstrap");
    state.user = data.user;
    state.inventory = data.prizes;
    state.history = data.history;
    state.leaderboard = data.leaderboard;
    state.isOwner = data.is_owner;
    state.freeUsed = data.free_used;
    state.spinCost = data.config.spin_cost;
    state.flags = data.flags;
    state.prizes = data.prizes_catalog || (await api("prizes_list")).prizes;

    els.adminTabBtn.classList.toggle("hidden", !state.isOwner);
    updateProfile();
    initSlider();
    switchTab("inventory");
    connectLiveStream();
    els.app.classList.remove("hidden");
    els.loading.classList.add("hidden");
    tg.HapticFeedback.impactOccurred("medium");
}

document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
});

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-toggle]");
    if (button) toggleAdmin(button.dataset.adminToggle);
});

els.btnSpin.addEventListener("click", () => startSpin(false));
els.btnFree.addEventListener("click", () => startSpin(true));
els.btnRefresh.addEventListener("click", async () => {
    await refreshUserState();
    showToast("Профиль обновлён.", "ok");
});
els.closeResult.addEventListener("click", closeResult);
els.modal.addEventListener("click", (event) => {
    if (event.target === els.modal || event.target.classList.contains("modal-backdrop")) closeResult();
});

bootstrap().catch((error) => {
    setLoading(error.message || "Ошибка инициализации");
    showToast("Не удалось инициализировать Mini App.", "warn");
});
