import os
from datetime import datetime, timezone
from pathlib import Path

TOKEN = os.environ.get("BOT_TOKEN", "8706094547:AAHJSLk2YrdM75CyTYKzwgIzYaUz19cP-ZE")
SPIN_COST = int(os.environ.get("SPIN_COST", 15))
OWNER_ID = int(os.environ.get("OWNER_ID", 7969551121))
OWNER_USERNAME = os.environ.get("OWNER_USERNAME", "fuckswagging")
CHANNEL_ID = os.environ.get("CHANNEL_ID", "@cheatdurov")
CHANNEL_URL = os.environ.get("CHANNEL_URL", "https://t.me/cheatdurov")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://swagginggift-production.up.railway.app/")
DB_PATH = Path(os.environ.get("DB_PATH", "swagging_gift.db"))

BOT_START_TIME = datetime.now(timezone.utc)

PRIZES = [
    {
        "key": "rose",
        "name": "Роза",
        "emoji": "🌹",
        "rarity": "Обычный",
        "weight": 25,
        "type": "gift",
        "gift_id": None,
    },
    {
        "key": "bouquet",
        "name": "Букет",
        "emoji": "💐",
        "rarity": "Обычный",
        "weight": 18,
        "type": "gift",
        "gift_id": None,
    },
    {
        "key": "cake",
        "name": "Торт",
        "emoji": "🎂",
        "rarity": "Обычный",
        "weight": 20,
        "type": "gift",
        "gift_id": None,
    },
    {
        "key": "bear",
        "name": "Плюшевый мишка",
        "emoji": "🧸",
        "rarity": "Редкий",
        "weight": 12,
        "type": "gift",
        "gift_id": None,
    },
    {
        "key": "heart",
        "name": "Сердце",
        "emoji": "❤️",
        "rarity": "Редкий",
        "weight": 10,
        "type": "gift",
        "gift_id": None,
    },
    {
        "key": "trophy",
        "name": "Трофей",
        "emoji": "🏆",
        "rarity": "Эпический",
        "weight": 5,
        "type": "gift",
        "gift_id": None,
    },
    {
        "key": "gem",
        "name": "Кристалл",
        "emoji": "💎",
        "rarity": "Легендарный",
        "weight": 2,
        "type": "gift",
        "gift_id": None,
    },
    {
        "key": "nothing",
        "name": "Пусто",
        "emoji": "💨",
        "rarity": "Промах",
        "weight": 35,
        "type": "nothing",
        "gift_id": None,
    },
]

PRIZES_BY_KEY = {prize["key"]: prize for prize in PRIZES}
TOTAL_WEIGHT = sum(prize["weight"] for prize in PRIZES)
