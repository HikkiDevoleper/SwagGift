import hmac
import hashlib
import json
import logging
import aiohttp
from urllib.parse import unquote
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from aiogram import Bot as AiogramBot

from config import TOKEN, CHANNEL_ID, SPIN_COST, PRIZES, TOTAL_WEIGHT, DB_PATH
from database import Database

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("swagging_gift.server")

app = FastAPI()
db = Database(DB_PATH)
bot_instance = AiogramBot(token=TOKEN)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_init_data(init_data_raw: str, bot_token: str) -> dict:
    log.info(f"Verifying init data: {init_data_raw[:20]}...")
    if not init_data_raw:
        log.error("Init data is missing in headers")
        raise HTTPException(401, "No init data")
    
    params = {}
    for part in init_data_raw.split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            params[k] = unquote(v)

    received_hash = params.pop("hash", None)
    if not received_hash:
        raise HTTPException(401, "Hash missing")

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

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
        raise HTTPException(403, "Invalid signature")

    user_json = params.get("user", "{}")
    return json.loads(user_json)

@app.on_event("startup")
async def startup():
    await db.setup()

@app.get("/api/user")
async def get_user_api(request: Request):
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    log.info(f"X-Telegram-Init-Data header: {len(init_data)} chars")
    user = verify_init_data(init_data, TOKEN)
    uid = user["id"]
    
    await db.ensure_user(uid, user.get("username", ""), user.get("first_name", ""))
    data = await db.get_user(uid)
    prizes = await db.get_prizes(uid, 50)
    free_used = await db.has_used_free(uid)
    
    return {"user": data, "prizes": prizes, "free_used": free_used}

@app.post("/api/create_invoice")
async def create_invoice_api(request: Request):
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_init_data(init_data, TOKEN)
    uid = user["id"]
    
    # Create invoice link using Bot API
    url = f"https://api.telegram.org/bot{TOKEN}/createInvoiceLink"
    payload = {
        "title": "Swagging Gift — спин",
        "description": "Один спин — шанс выиграть Telegram-подарок 🎁",
        "payload": f"sg_spin_{uid}",
        "currency": "XTR",
        "prices": [{"label": "Прокрутка", "amount": SPIN_COST}]
    }
    
    async with aiohttp.ClientSession() as s:
        async with s.post(url, json=payload) as r:
            data = await r.json()
            
    if not data.get("ok"):
        log.error(f"Invoice error: {data.get('description')}")
        raise HTTPException(500, "Failed to create invoice")
        
    return {"invoice_link": data["result"]}

@app.post("/api/free_spin")
async def free_spin_api(request: Request):
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_init_data(init_data, TOKEN)
    uid = user["id"]
    
    if await db.has_used_free(uid):
        return {"error": "already_used"}

    try:
        member = await bot_instance.get_chat_member(CHANNEL_ID, uid)
        subscribed = member.status in ("member", "administrator", "creator")
    except Exception as e:
        log.error(f"Subscription check error: {e}")
        subscribed = False

    if not subscribed:
        return {"error": "not_subscribed"}

    from bot import pick_prize
    winner = pick_prize()
    await db.mark_free_used(uid)
    await db.record_spin(uid, winner, is_free=True)
    
    return {"winner": winner}

@app.get("/api/spin_result")
async def get_spin_result_api(request: Request):
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_init_data(init_data, TOKEN)
    result = await db.get_spin_result(user["id"])
    return {"result": result}

@app.get("/api/prizes_list")
async def get_prizes_list_api():
    return {"prizes": PRIZES, "total_weight": TOTAL_WEIGHT}

@app.get("/api/leaderboard")
async def get_leaderboard_api():
    rows = await db.leaderboard(10)
    return {"rows": rows}

# Mount static files (must be at the end)
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")
