import os
from datetime import datetime, timezone
from pathlib import Path

TOKEN = os.environ.get("BOT_TOKEN", "")
OWNER_ID = int(os.environ.get("OWNER_ID", "0"))
OWNER_USERNAME = os.environ.get("OWNER_USERNAME", "")
CHANNEL_ID = os.environ.get("CHANNEL_ID", "@SwagGiftChannel")
CHANNEL_URL = os.environ.get("CHANNEL_URL", "https://t.me/SwagGiftChannel")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "")
DB_PATH = Path(os.environ.get("DB_PATH", "swagging_gift.db"))
PORT = int(os.environ.get("PORT", "8080"))

DEFAULT_SPIN_COST = int(os.environ.get("SPIN_COST", "15"))
BOT_START_TIME = datetime.now(timezone.utc)

# ─── Prize Catalog ───────────────────────────────────
# Synced with public/gifts.json stickers
# tgs = filename in public/gifts/ for animated sticker
PRIZES = [
    {
        "key": "gift",
        "name": "Подарок",
        "emoji": "🎁",
        "rarity": "Редкий",
        "weight": 10,
        "type": "gift",
        "sell_value": 25,
        "tgs": "подарок.tgs",
        "gift_id": 2,
    },
    {
        "key": "bear",
        "name": "Мишка",
        "emoji": "🧸",
        "rarity": "Обычный",
        "weight": 10,
        "type": "gift",
        "sell_value": 15,
        "tgs": "мишка.tgs",
        "gift_id": 1,
    },
    {
        "key": "flowers",
        "name": "Цветы",
        "emoji": "💐",
        "rarity": "Редкий",
        "weight": 10,
        "type": "gift",
        "sell_value": 50,
        "tgs": "цветы.tgs",
        "gift_id": 5,
    },
    {
        "key": "rose",
        "name": "Роза",
        "emoji": "🌹",
        "rarity": "Обычный",
        "weight": 10,
        "type": "gift",
        "sell_value": 25,
        "tgs": "роза.tgs",
        "gift_id": 4,
    },
    {
        "key": "heart",
        "name": "Сердце",
        "emoji": "💝",
        "rarity": "Обычный",
        "weight": 10,
        "type": "gift",
        "sell_value": 15,
        "tgs": "сердце.tgs",
        "gift_id": 3,
    },
    {
        "key": "cake",
        "name": "Торт",
        "emoji": "🎂",
        "rarity": "Эпический",
        "weight": 5,
        "type": "gift",
        "sell_value": 50,
        "tgs": "торт.tgs",
        "gift_id": 6,
    },
    {
        "key": "ring",
        "name": "Кольцо",
        "emoji": "💍",
        "rarity": "Легендарный",
        "weight": 5,
        "type": "gift",
        "sell_value": 100,
        "tgs": "кольцо.tgs",
        "gift_id": 9,
    },
    {
        "key": "trophy",
        "name": "Кубок",
        "emoji": "🏆",
        "rarity": "Легендарный",
        "weight": 5,
        "type": "gift",
        "sell_value": 100,
        "tgs": "кубок.tgs",
        "gift_id": 8,
    },
    {
        "key": "rocket",
        "name": "Ракета",
        "emoji": "🚀",
        "rarity": "Эпический",
        "weight": 5,
        "type": "gift",
        "sell_value": 50,
        "tgs": "ракета.tgs",
        "gift_id": 7,
    },
    {
        "key": "nothing",
        "name": "Пусто",
        "emoji": "💨",
        "rarity": "Промах",
        "weight": 30,
        "type": "nothing",
        "sell_value": 0,
        "tgs": None,
        "gift_id": None,
    },
]

PRIZES_BY_KEY = {prize["key"]: prize for prize in PRIZES}
TOTAL_WEIGHT = sum(prize["weight"] for prize in PRIZES)


def update_weights(new_weights: dict[str, int]) -> None:
    global TOTAL_WEIGHT
    for prize in PRIZES:
        if prize["key"] in new_weights:
            prize["weight"] = max(0, int(new_weights[prize["key"]]))
    TOTAL_WEIGHT = sum(prize["weight"] for prize in PRIZES)
