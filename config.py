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
# sell_value = how many ⭐ user gets when selling this prize
PRIZES = [
    {
        "key": "heart",
        "name": "Сердце",
        "emoji": "❤️",
        "rarity": "Обычный",
        "weight": 22,
        "type": "gift",
        "sell_value": 15,
        "gift_id": None,
    },
    {
        "key": "bear",
        "name": "Мишка",
        "emoji": "🧸",
        "rarity": "Обычный",
        "weight": 20,
        "type": "gift",
        "sell_value": 15,
        "gift_id": None,
    },
    {
        "key": "gift",
        "name": "Подарок",
        "emoji": "🎁",
        "rarity": "Редкий",
        "weight": 15,
        "type": "gift",
        "sell_value": 25,
        "gift_id": None,
    },
    {
        "key": "rose",
        "name": "Роза",
        "emoji": "🌹",
        "rarity": "Редкий",
        "weight": 14,
        "type": "gift",
        "sell_value": 25,
        "gift_id": None,
    },
    {
        "key": "cake",
        "name": "Торт",
        "emoji": "🎂",
        "rarity": "Эпический",
        "weight": 8,
        "type": "gift",
        "sell_value": 50,
        "gift_id": None,
    },
    {
        "key": "bouquet",
        "name": "Букет",
        "emoji": "💐",
        "rarity": "Эпический",
        "weight": 7,
        "type": "gift",
        "sell_value": 50,
        "gift_id": None,
    },
    {
        "key": "racket",
        "name": "Ракетка",
        "emoji": "🏸",
        "rarity": "Эпический",
        "weight": 6,
        "type": "gift",
        "sell_value": 50,
        "gift_id": None,
    },
    {
        "key": "diamond",
        "name": "Бриллиант",
        "emoji": "💎",
        "rarity": "Легендарный",
        "weight": 2,
        "type": "gift",
        "sell_value": 100,
        "gift_id": None,
    },
    {
        "key": "nothing",
        "name": "Пусто",
        "emoji": "💨",
        "rarity": "Промах",
        "weight": 35,
        "type": "nothing",
        "sell_value": 0,
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
