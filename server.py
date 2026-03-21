import hmac
import hashlib
import json
import logging
import aiohttp
from urllib.parse import unquote, parse_qsl
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from aiogram import Bot as AiogramBot

from config import TOKEN, CHANNEL_ID, SPIN_COST, PRIZES, TOTAL_WEIGHT, DB_PATH, OWNER_ID
from database import Database
import bot # Import bot to access global variables

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
    if not init_data_raw:
        log.error("verify_init_data: init_data_raw is empty")
        raise HTTPException(401, "No init data")
    
    try:
        # Robust parsing using parse_qsl
        params = dict(parse_qsl(init_data_raw))
        received_hash = params.pop("hash", None)
        
        if not received_hash:
            log.error("verify_init_data: hash missing")
            raise HTTPException(401, "Hash missing")

        # Create data-check-string
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
            log.warning(f"Signature mismatch! Expected: {expected_hash}, Received: {received_hash}")
            # For debugging, log the check string
            log.debug(f"Check string: {data_check_string}")
            raise HTTPException(403, "Invalid signature")

        user_json = params.get("user", "{}")
        return json.loads(user_json)
    except Exception as e:
        log.error(f"Verification error: {e}")
        if isinstance(e, HTTPException): raise e
        raise HTTPException(400, f"Malformed init data: {str(e)}")

@app.on_event("startup")
async def startup():
    await db.setup()

@app.get("/api/user")
async def get_user_api(request: Request):
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_init_data(init_data, TOKEN)
    uid = user["id"]
    
    await db.ensure_user(uid, user.get("username", ""), user.get("first_name", ""))
    data = await db.get_user(uid)
    prizes = await db.get_prizes(uid, 100)
    free_used = await db.has_used_free(uid)
    
    return {
        "user": data, 
        "prizes": prizes, 
        "free_used": free_used, 
        "is_owner": uid == OWNER_ID
    }

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
        raise HTTPException(500, f"Telegram API error: {data.get('description')}")
        
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
        # If API fails, we assume not subscribed for safety
        subscribed = False

    if not subscribed:
        return {"error": "not_subscribed"}

    from bot import pick_prize
    winner = pick_prize()
    await db.mark_free_used(uid)
    await db.record_spin(uid, winner, is_free=True)
    
    log.info(f"FREE SPIN: User {uid} won {winner['name']}")
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
    rows = await db.leaderboard(15)
    return {"rows": rows}

@app.get("/api/admin/settings")
async def get_admin_settings_api(request: Request):
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_init_data(init_data, TOKEN)
    if user["id"] != OWNER_ID:
        raise HTTPException(403, "Forbidden")
    
    return {
        "demo": bot.DEMO_MODE,
        "gifts": bot.SEND_GIFTS,
        "maint": bot.MAINTENANCE_MODE,
        "testpay": bot.OWNER_TEST_PAY,
        "cost": SPIN_COST
    }

@app.post("/api/admin/toggle")
async def toggle_setting_api(request: Request):
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_init_data(init_data, TOKEN)
    if user["id"] != OWNER_ID:
        raise HTTPException(403, "Forbidden")
    
    body = await request.json()
    key = body.get("key")
    
    if key == "demo": 
        bot.DEMO_MODE = not bot.DEMO_MODE
        val = bot.DEMO_MODE
    elif key == "gifts": 
        bot.SEND_GIFTS = not bot.SEND_GIFTS
        val = bot.SEND_GIFTS
    elif key == "maint": 
        bot.MAINTENANCE_MODE = not bot.MAINTENANCE_MODE
        val = bot.MAINTENANCE_MODE
    elif key == "testpay": 
        bot.OWNER_TEST_PAY = not bot.OWNER_TEST_PAY
        val = bot.OWNER_TEST_PAY
    else: raise HTTPException(400, "Invalid key")
    
    return {"ok": True, "key": key, "value": val}

@app.get("/api/history")
async def get_history_api():
    rows = await db.get_global_history(20)
    return {"history": rows}

# Mount static files (must be at the end)
app.mount("/", StaticFiles(directory="webapp", html=True), name="webapp")
