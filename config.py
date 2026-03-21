import os
from pathlib import Path
from datetime import datetime, timezone

# Telegram Bot Token
TOKEN = os.environ.get("BOT_TOKEN", "8706094547:AAHJSLk2YrdM75CyTYKzwgIzYaUz19cP-ZE")

# Global Settings
SPIN_COST = int(os.environ.get("SPIN_COST", 15))
OWNER_ID = int(os.environ.get("OWNER_ID", 7969551121))
OWNER_USERNAME = os.environ.get("OWNER_USERNAME", "fuckswagging")
CHANNEL_ID = os.environ.get("CHANNEL_ID", "@cheatdurov")
CHANNEL_URL = os.environ.get("CHANNEL_URL", "https://t.me/cheatdurov")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://swagginggift-production.up.railway.app")
DB_PATH = Path(os.environ.get("DB_PATH", "swagging_gift.db"))

# Bot start time for uptime stats
BOT_START_TIME = datetime.now(timezone.utc)

# Prizes Configuration
PRIZES = [
    {"key": "rose",    "name": "Роза",           "emoji": "🌹", "rarity": "Обычный",     "ri": "🟢", "weight": 25, "type": "gift",    "gift_id": None},
    {"key": "bouquet", "name": "Букет",          "emoji": "💐", "rarity": "Обычный",     "ri": "🟢", "weight": 18, "type": "gift",    "gift_id": None},
    {"key": "cake",    "name": "Торт",           "emoji": "🎂", "rarity": "Обычный",     "ri": "🟢", "weight": 20, "type": "gift",    "gift_id": None},
    {"key": "bear",    "name": "Плюшевый мишка", "emoji": "🧸", "rarity": "Редкий",      "ri": "🔵", "weight": 12, "type": "gift",    "gift_id": None},
    {"key": "heart",   "name": "Сердечко",       "emoji": "❤️", "rarity": "Редкий",      "ri": "🔵", "weight": 10, "type": "gift",    "gift_id": None},
    {"key": "trophy",  "name": "Трофей",         "emoji": "🏆", "rarity": "Эпический",   "ri": "🟣", "weight": 5,  "type": "gift",    "gift_id": None},
    {"key": "gem",     "name": "Кристалл",       "emoji": "💎", "rarity": "Легендарный", "ri": "🌟", "weight": 2,  "type": "gift",    "gift_id": None},
    {"key": "nothing", "name": "Пусто",          "emoji": "💀", "rarity": "—",           "ri": "⚫", "weight": 35, "type": "nothing", "gift_id": None},
]

TOTAL_WEIGHT = sum(p["weight"] for p in PRIZES)
NICE_EMOJIS = [p["emoji"] for p in PRIZES if p["key"] != "nothing"]
