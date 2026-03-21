Технический бриф: Swagging Gift — перевод в Telegram Mini App
Контекст проекта
Есть рабочий Telegram-бот (bot.py) — рулетка с Telegram-подарками. Задача: весь интерфейс рулетки перенести в Telegram Mini App (WebApp), оставив бот только как «бэкенд» (платежи, команды, связь с WebApp).
Данные:

Бот: @SwagGiftBot, токен: 8706094547:AAHJSLk2YrdM75CyTYKzwgIzYaUz19cP-ZE
Хостинг Mini App: https://swagginggift-production.up.railway.app/
Деплой: Railway + GitHub (автодеплой из репозитория)
БД: SQLite через aiosqlite (уже есть в bot.py)


Структура проекта на GitHub
swagginggift/
├── bot.py                  # Telegram-бот (Python, aiogram 3)
├── server.py               # FastAPI сервер для WebApp API
├── requirements.txt
├── Procfile                # Для Railway: web + bot процессы
├── railway.toml            # Конфиг Railway
├── swagging_gift.db        # SQLite (создаётся автоматически)
└── webapp/                 # Фронтенд Mini App
    ├── index.html
    ├── style.css
    └── app.js
Procfile (запускает оба процесса):
web: uvicorn server:app --host 0.0.0.0 --port $PORT
bot: python bot.py
Или один процесс с asyncio — запускать FastAPI и aiogram polling вместе в main().

Как работает Mini App

Пользователь нажимает кнопку в боте → открывается WebApp (https://swagginggift-production.up.railway.app/)
WebApp общается с FastAPI сервером (/api/...) для получения данных
Для оплаты: WebApp вызывает Telegram.WebApp.openInvoice() — бот отдаёт invoice через API
После оплаты: бот получает successful_payment, крутит барабан, отправляет результат обратно в WebApp через answerWebAppQuery или просто сообщением


bot.py — что изменить
Из bot.py нужно:

Убрать все inline-клавиатуры с интерфейсом рулетки (инвентарь, спин, анимацию)
Оставить в боте:

/start — теперь отправляет одну кнопку «Открыть рулетку» типа WebAppInfo
Обработчик F.successful_payment — крутит барабан, записывает результат в БД
Обработчик F.web_app_data — принимает данные от WebApp если нужно
Все команды владельца (/refund, /setcost, /broadcast, /ban и т.д.)
pre_checkout_query
Панель владельца остаётся в боте



Новый /start в боте:
pythonfrom aiogram.types import WebAppInfo, KeyboardButton, ReplyKeyboardMarkup

@dp.message(Command("start"))
async def cmd_start(msg: Message):
    await db.ensure_user(...)
    kb = ReplyKeyboardMarkup(keyboard=[[
        KeyboardButton(
            text="🎰 Открыть рулетку",
            web_app=WebAppInfo(url="https://swagginggift-production.up.railway.app/")
        )
    ]], resize_keyboard=True)
    await msg.answer(
        "<b>Swagging Gift</b>\n\nКрутите барабан и выигрывайте Telegram-подарки.",
        reply_markup=kb
    )
Инвойс теперь создаётся через API-запрос от WebApp:
python@dp.message(F.web_app_data)
async def on_webapp_data(msg: Message):
    data = json.loads(msg.web_app_data.data)
    if data.get("action") == "spin_paid":
        # Уже оплачено через Stars — крутим барабан
        ...

server.py — FastAPI для WebApp
pythonfrom fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import hmac, hashlib, json
from database import db  # импорт из bot.py или отдельный модуль

app = FastAPI()

app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")

BOT_TOKEN = "8706094547:AAHJSLk2YrdM75CyTYKzwgIzYaUz19cP-ZE"

def verify_telegram_data(init_data: str) -> dict:
    """Проверяет подпись initData от Telegram.WebApp"""
    parsed = dict(x.split("=", 1) for x in init_data.split("&"))
    received_hash = parsed.pop("hash", "")
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret = hmac.new("WebAppData".encode(), BOT_TOKEN.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise HTTPException(403, "Invalid signature")
    return json.loads(parsed.get("user", "{}"))

@app.get("/api/user")
async def get_user(request: Request):
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_telegram_data(init_data)
    uid  = user["id"]
    await db.ensure_user(uid, user.get("username",""), user.get("first_name",""))
    data = await db.get_user(uid)
    prizes = await db.get_prizes(uid, 20)
    free_used = await db.has_used_free(uid)
    return {"user": data, "prizes": prizes, "free_used": free_used}

@app.post("/api/create_invoice")
async def create_invoice(request: Request):
    """Создаёт Stars invoice и возвращает его ссылку для WebApp"""
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_telegram_data(init_data)
    uid  = user["id"]
    # Создаём invoice через Bot API
    import aiohttp
    async with aiohttp.ClientSession() as s:
        async with s.post(f"https://api.telegram.org/bot{BOT_TOKEN}/createInvoiceLink", json={
            "title": "Swagging Gift — спин",
            "description": "Один спин — шанс выиграть Telegram-подарок",
            "payload": f"spin_{uid}",
            "currency": "XTR",
            "prices": [{"label": "Прокрутка", "amount": SPIN_COST}]
        }) as r:
            data = await r.json()
    return {"invoice_url": data["result"]}

@app.get("/api/prizes")
async def get_prizes_list():
    """Список всех призов с шансами для отображения в WebApp"""
    return {"prizes": PRIZES, "total_weight": TOTAL_WEIGHT}

@app.get("/api/leaderboard")
async def get_leaderboard():
    rows = await db.leaderboard(10)
    return {"rows": rows}

webapp/app.js — фронтенд
javascriptconst tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const initData = tg.initData;  // Передаём в каждый запрос

async function api(endpoint, method = "GET", body = null) {
    const res = await fetch(`/api/${endpoint}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            "X-Telegram-Init-Data": initData
        },
        body: body ? JSON.stringify(body) : null
    });
    return res.json();
}

// Загрузить данные пользователя
async function loadUser() {
    const data = await api("user");
    renderInventory(data.prizes);
    renderStats(data.user);
    if (data.free_used) {
        document.getElementById("btn-free").style.display = "none";
    }
}

// Платный спин через Stars
async function spinPaid() {
    const { invoice_url } = await api("create_invoice", "POST");
    tg.openInvoice(invoice_url, (status) => {
        if (status === "paid") {
            // Бот получит successful_payment и обработает
            // WebApp ждёт результат через polling /api/last_result
            pollResult();
        }
    });
}

// Бесплатный спин — проверка подписки
async function spinFree() {
    const result = await api("free_spin", "POST");
    if (result.error === "not_subscribed") {
        tg.openLink("https://t.me/cheatdurov");
        return;
    }
    if (result.error === "already_used") {
        alert("Бесплатный спин уже использован.");
        return;
    }
    showSpinAnimation(result);
}

// Анимация рулетки на фронте
function showSpinAnimation(result) {
    // CSS анимация + показ результата
    // result.winner = { name, emoji, rarity, ri }
}
```

---

### Оплата Stars — полный флоу
```
WebApp                     FastAPI              Bot (aiogram)
  |                           |                      |
  |-- POST /api/create_invoice-->                     |
  |                           |-- createInvoiceLink ->|
  |<-- { invoice_url } -------|                      |
  |                           |                      |
  |-- tg.openInvoice(url) ----------------------------------->|
  |                           |            [пользователь платит]
  |                           |       pre_checkout_query ------>|
  |                           |       successful_payment ------>|
  |                           |            [бот крутит барабан] |
  |                           |            [пишет результат в БД]
  |-- GET /api/last_result -->|                      |
  |<-- { winner: {...} } -----|                      |
  |                           |                      |
  [показываем анимацию и результат]
/api/last_result — эндпоинт для получения последнего результата:
python@app.get("/api/last_result")
async def last_result(request: Request):
    user  = verify_telegram_data(request.headers.get("X-Telegram-Init-Data",""))
    prizes = await db.get_prizes(user["id"], 1)
    return {"last": prizes[0] if prizes else None}

railway.toml
toml[build]
builder = "nixpacks"

[deploy]
startCommand = "python run.py"
healthcheckPath = "/api/prizes"
healthcheckTimeout = 30
run.py — запускает FastAPI + бот вместе:
pythonimport asyncio
import uvicorn
from bot import main as bot_main
from server import app as fastapi_app

async def run():
    config = uvicorn.Config(fastapi_app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
    server = uvicorn.Server(config)
    await asyncio.gather(
        server.serve(),
        bot_main(),
    )

if __name__ == "__main__":
    asyncio.run(run())

Что взять из bot.py без изменений

Весь класс Database — один в один
populate_gift_ids(), api_send_gift(), api_refund_stars(), check_subscribed()
pick_prize(), PRIZES, TOTAL_WEIGHT
Все команды владельца (/refund, /setcost, /broadcast, /find, /ban, /unban)
pre_checkout_query и F.successful_payment обработчики

Что удалить из bot.py

animate_spin(), typewriter() — анимация теперь на фронте
Все callback_query обработчики кроме панели владельца
kb_main, kb_after_spin, kb_subscribe, kb_back — клавиатуры не нужны

Дополнение к брифу: Swagging Gift Mini App

1. База данных — вынести в отдельный модуль
Сейчас Database класс внутри bot.py. Для Mini App его нужно вынести:
swagginggift/
├── database.py     # класс Database — импортируется и в bot.py и в server.py
├── config.py       # все константы (TOKEN, PRIZES, SPIN_COST и т.д.)
├── bot.py          # только aiogram логика
├── server.py       # только FastAPI
└── run.py          # запускает оба
config.py:
pythonimport os

TOKEN      = os.environ.get("BOT_TOKEN", "8706094547:AAHJSLk2YrdM75CyTYKzwgIzYaUz19cP-ZE")
SPIN_COST  = int(os.environ.get("SPIN_COST", 15))
OWNER_ID   = int(os.environ.get("OWNER_ID", 7969551121))
CHANNEL_ID = os.environ.get("CHANNEL_ID", "@cheatdurov")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://swagginggift-production.up.railway.app")
DB_PATH    = os.environ.get("DB_PATH", "swagging_gift.db")

PRIZES = [...]  # весь список призов сюда
Токен и прочее — в переменных окружения Railway, не хардкодить в коде.

2. Проверка initData — подробно
Это критически важно. Без проверки любой может слать запросы к API от чужого имени.
pythonimport hmac
import hashlib
import json
from urllib.parse import unquote

def verify_init_data(init_data_raw: str, bot_token: str) -> dict:
    """
    Проверяет подпись Telegram.WebApp.initData.
    Возвращает словарь с данными пользователя или бросает исключение.
    """
    # Парсим строку формата key=value&key=value
    params = {}
    for part in init_data_raw.split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            params[k] = unquote(v)

    received_hash = params.pop("hash", None)
    if not received_hash:
        raise ValueError("hash отсутствует")

    # Формируем строку для проверки: отсортированные пары key=value через \n
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    # HMAC-SHA256: secret = HMAC("WebAppData", bot_token)
    secret_key = hmac.new(
        "WebAppData".encode("utf-8"),
        bot_token.encode("utf-8"),
        hashlib.sha256
    ).digest()

    expected_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise ValueError("Подпись не совпадает")

    # Возвращаем данные пользователя
    user_json = params.get("user", "{}")
    return json.loads(user_json)
На фронте initData передаётся в каждый запрос:
javascriptheaders: {
    "X-Telegram-Init-Data": window.Telegram.WebApp.initData
}
```

---

### 3. Флоу бесплатного спина через WebApp

Это тонкий момент — подписку нельзя проверить прямо из WebApp, только бот может вызвать `get_chat_member`. Поэтому:
```
WebApp                    FastAPI                   Bot
  |                          |                        |
  |-- POST /api/free_spin -->|                        |
  |                          |-- bot.get_chat_member->|
  |                          |<-- member.status ------|
  |                          |                        |
  | если подписан:           |                        |
  |                          |-- pick_prize()         |
  |                          |-- record_spin()        |
  |<-- { winner: {...} } ----|                        |
  |                          |                        |
  | если не подписан:        |                        |
  |<-- { error: "not_subscribed" }                    |
server.py эндпоинт:
pythonfrom aiogram import Bot as AiogramBot
from config import TOKEN, CHANNEL_ID

_bot_instance = AiogramBot(token=TOKEN)

@app.post("/api/free_spin")
async def free_spin(request: Request):
    user = verify_init_data(
        request.headers.get("X-Telegram-Init-Data", ""), TOKEN
    )
    uid = user["id"]
    await db.ensure_user(uid, user.get("username",""), user.get("first_name",""))

    if await db.has_used_free(uid):
        return {"error": "already_used"}

    # Проверка подписки через бота
    try:
        member = await _bot_instance.get_chat_member(CHANNEL_ID, uid)
        subscribed = member.status in ("member", "administrator", "creator")
    except Exception:
        subscribed = False

    if not subscribed:
        return {"error": "not_subscribed", "channel_url": "https://t.me/cheatdurov"}

    # Даём спин
    await db.mark_free_used(uid)
    winner = pick_prize()
    await db.record_spin(uid, winner, is_free=True)
    return {"winner": winner}

4. Флоу платного спина — детально
Проблема: после оплаты Stars бот получает successful_payment, а WebApp не знает об этом автоматически. Нужен механизм передачи результата.
Решение — pending_spins таблица в БД:
python# В database.py добавить:
async def create_pending_spin(self, uid: int, charge_id: str) -> None:
    async with aiosqlite.connect(self.path) as db:
        await db.execute(
            "CREATE TABLE IF NOT EXISTS pending_spins "
            "(uid INTEGER, charge_id TEXT UNIQUE, result TEXT, created_at TEXT)"
        )
        await db.execute(
            "INSERT OR IGNORE INTO pending_spins VALUES (?,?,NULL,?)",
            (uid, charge_id, datetime.now().isoformat())
        )
        await db.commit()

async def set_spin_result(self, charge_id: str, result: dict) -> None:
    import json
    async with aiosqlite.connect(self.path) as db:
        await db.execute(
            "UPDATE pending_spins SET result=? WHERE charge_id=?",
            (json.dumps(result, ensure_ascii=False), charge_id)
        )
        await db.commit()

async def get_spin_result(self, uid: int) -> Optional[dict]:
    import json
    async with aiosqlite.connect(self.path) as db:
        async with db.execute(
            "SELECT result FROM pending_spins WHERE uid=? AND result IS NOT NULL "
            "ORDER BY created_at DESC LIMIT 1", (uid,)
        ) as cur:
            row = await cur.fetchone()
            if row and row[0]:
                # Удаляем чтобы не возвращать повторно
                await db.execute(
                    "DELETE FROM pending_spins WHERE uid=? AND result IS NOT NULL", (uid,)
                )
                await db.commit()
                return json.loads(row[0])
    return None
В bot.py — successful_payment:
python@dp.message(F.successful_payment)
async def on_paid(msg: Message):
    uid       = msg.from_user.id
    charge_id = msg.successful_payment.telegram_payment_charge_id
    stars     = msg.successful_payment.total_amount

    winner = pick_prize()
    await db.record_spin(uid, winner, stars=stars, charge_id=charge_id)

    # Кладём результат в БД — WebApp заберёт через polling
    await db.set_spin_result(charge_id, {
        "winner": winner,
        "charge_id": charge_id,
    })
В server.py — WebApp поллит результат:
python@app.get("/api/spin_result")
async def spin_result(request: Request):
    user   = verify_init_data(request.headers.get("X-Telegram-Init-Data",""), TOKEN)
    result = await db.get_spin_result(user["id"])
    return {"result": result}  # null если ещё не готов
В app.js — polling после оплаты:
javascriptasync function pollResult(maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
        await sleep(1000);  // ждём 1 секунду
        const { result } = await api("spin_result");
        if (result) {
            showSpinAnimation(result.winner);
            return;
        }
    }
    alert("Что-то пошло не так. Обратитесь в поддержку.");
}
```

---

### 5. Переменные окружения на Railway

В Railway Dashboard → Variables добавить:
```
BOT_TOKEN    = 8706094547:AAHJSLk2YrdM75CyTYKzwgIzYaUz19cP-ZE
OWNER_ID     = 7969551121
CHANNEL_ID   = @cheatdurov
WEBAPP_URL   = https://swagginggift-production.up.railway.app
SPIN_COST    = 15
DB_PATH      = /data/swagging_gift.db
PORT         = (Railway подставляет автоматически)
Для постоянного хранения БД на Railway нужен Volume (Persistent Storage): Railway → Add Volume → mount path /data.

6. webapp/index.html — минимальный скелет
html<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Swagging Gift</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div id="app">
        <div id="screen-main">
            <h2>Swagging Gift</h2>
            <div id="prizes-row"></div>
            <button id="btn-spin">Крутить — 15 ⭐</button>
            <button id="btn-free">Бесплатный спин</button>
            <div id="tabs">
                <button onclick="showTab('inventory')">Призы</button>
                <button onclick="showTab('stats')">Статистика</button>
                <button onclick="showTab('top')">Топ</button>
                <button onclick="showTab('about')">О боте</button>
            </div>
        </div>
        <div id="screen-spin" style="display:none">
            <!-- Анимация рулетки -->
            <div id="slots"></div>
            <div id="spin-status"></div>
        </div>
        <div id="screen-result" style="display:none">
            <!-- Результат -->
        </div>
        <div id="tab-content"></div>
    </div>
    <script src="app.js"></script>
</body>
</html>

7. Настройка Menu Button в боте
Чтобы Mini App открывался кнопкой в нижнем меню Telegram (не только через /start):
python# Один раз при запуске бота:
await bot.set_chat_menu_button(
    menu_button=types.MenuButtonWebApp(
        text="Открыть рулетку",
        web_app=types.WebAppInfo(url=WEBAPP_URL)
    )
)
```

---

### 8. requirements.txt
```
aiogram==3.26.0
aiosqlite==0.22.1
aiohttp==3.13.3
fastapi==0.115.0
uvicorn==0.32.0
python-multipart==0.0.12

Итоговый порядок действий для нейросети

Создать config.py — вынести все константы
Создать database.py — вынести класс Database, добавить pending_spins
Переписать bot.py — оставить только /start с WebApp кнопкой, successful_payment, команды владельца
Написать server.py — FastAPI с эндпоинтами /api/user, /api/create_invoice, /api/free_spin, /api/spin_result, /api/prizes, /api/leaderboard
Написать webapp/ — HTML/CSS/JS фронтенд
Написать run.py — запускает FastAPI и aiogram polling параллельно через asyncio.gather
Добавить railway.toml и переменные окружения
Подключить Volume на Railway для хранения БД


В конце всего проекта, когда будет всё готов, сделай git  в https://github.com/HikkiDevoleper/SwagGift 