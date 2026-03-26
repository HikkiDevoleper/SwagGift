import asyncio
import hashlib
import hmac
import json
import logging
from pathlib import Path
from typing import Any, AsyncIterator, Dict
from urllib.parse import parse_qsl

import aiohttp
from aiogram import Bot as AiogramBot
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from config import (
    CHANNEL_ID, CHANNEL_URL, DB_PATH, DEFAULT_SPIN_COST,
    OWNER_ID, PRIZES, PRIZES_BY_KEY, TOKEN, TOTAL_WEIGHT, update_weights,
)
from database import Database
from runtime_state import runtime_state

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("swagging_gift.server")

app = FastAPI(title="Swagging Gift")
db = Database(DB_PATH)
bot_instance = AiogramBot(token=TOKEN)
WEB_ROOT = Path("webapp/dist")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helpers ─────────────────────────────────────────

def verify_init_data(init_data_raw: str, bot_token: str) -> Dict[str, Any]:
    if not init_data_raw:
        raise HTTPException(status_code=401, detail="Telegram init data missing")
    try:
        params = dict(parse_qsl(init_data_raw, keep_blank_values=True))
        received_hash = params.pop("hash", None)
        if not received_hash:
            raise HTTPException(status_code=401, detail="Telegram hash missing")
        data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(params.items()))
        secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
        expected_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_hash, received_hash):
            raise HTTPException(status_code=403, detail="Invalid Telegram signature")
        user = json.loads(params.get("user", "{}"))
        if not user or "id" not in user:
            raise HTTPException(status_code=401, detail="Telegram user missing")
        return user
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Init data verification failed: %s", exc)
        raise HTTPException(status_code=400, detail="Malformed Telegram init data")


async def get_telegram_user(request: Request) -> Dict[str, Any]:
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    user = verify_init_data(init_data, TOKEN)
    photo_url = user.get("photo_url", "")
    await db.ensure_user(user["id"], user.get("username", ""), user.get("first_name", ""), photo_url)
    return user


def no_store_json(payload: Dict[str, Any]) -> JSONResponse:
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})


async def check_subscription(uid: int) -> bool:
    """Check if user is subscribed to the channel."""
    if not CHANNEL_ID:
        return True
    try:
        member = await bot_instance.get_chat_member(CHANNEL_ID, uid)
        return member.status in ("member", "administrator", "creator")
    except Exception as exc:
        log.warning("Sub check failed for %s: %s", uid, exc)
        return False


# ─── Startup ─────────────────────────────────────────

@app.on_event("startup")
async def startup() -> None:
    runtime_state.set_default_cost(DEFAULT_SPIN_COST)
    await db.setup()
    log.info("Server startup complete")


@app.get("/api/health")
async def healthcheck() -> Dict[str, Any]:
    return {"ok": True}


# ─── Bootstrap & User ────────────────────────────────

@app.get("/api/bootstrap")
async def bootstrap_api(request: Request) -> JSONResponse:
    user = await get_telegram_user(request)
    uid = user["id"]
    user_data = await db.get_user(uid)
    prizes = await db.get_prizes(uid, 100)
    free_used = await db.has_used_free(uid)
    flags = await runtime_state.snapshot()
    spin_cost = await runtime_state.get_spin_cost()

    return no_store_json({
        "user": user_data,
        "prizes": prizes,
        "free_used": free_used,
        "is_owner": uid == OWNER_ID,
        "config": {
            "spin_cost": spin_cost,
            "channel_url": CHANNEL_URL,
        },
        "prizes_catalog": PRIZES,
        "flags": flags,
        "leaderboard": await db.leaderboard(8),
        "history": await db.get_global_history(12),
    })


@app.get("/api/user")
async def get_user_api(request: Request) -> JSONResponse:
    user = await get_telegram_user(request)
    data = await db.get_user(user["id"])
    prizes = await db.get_prizes(user["id"], 100)
    free_used = await db.has_used_free(user["id"])
    spin_cost = await runtime_state.get_spin_cost()

    return no_store_json({
        "user": data,
        "prizes": prizes,
        "free_used": free_used,
        "is_owner": user["id"] == OWNER_ID,
        "config": {"spin_cost": spin_cost},
    })


@app.get("/api/user_brief")
async def get_user_brief_api(request: Request) -> JSONResponse:
    user = await get_telegram_user(request)
    data = await db.get_user(user["id"])
    free_used = await db.has_used_free(user["id"])
    return no_store_json(
        {
            "user": data,
            "free_used": free_used,
            "is_owner": user["id"] == OWNER_ID,
            "config": {
                "spin_cost": await runtime_state.get_spin_cost(),
                "channel_url": CHANNEL_URL,
                "channel_id": CHANNEL_ID,
            },
        }
    )


# ─── Top-Up Balance ─────────────────────────────────

@app.post("/api/topup")
async def topup_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    body = await request.json()
    amount = int(body.get("amount", 0))
    if amount < 1 or amount > 10000:
        raise HTTPException(status_code=400, detail="Invalid amount (1-10000)")

    payload = {
        "title": "Swag Gift — пополнение",
        "description": f"Пополнение баланса на {amount} ⭐",
        "payload": f"sg_topup_{user['id']}_{amount}",
        "currency": "XTR",
        "prices": [{"label": "Звёзды", "amount": amount}],
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(f"https://api.telegram.org/bot{TOKEN}/createInvoiceLink", json=payload) as resp:
            data = await resp.json()
    if not data.get("ok"):
        log.error("Topup invoice failed: %s", data.get("description"))
        raise HTTPException(status_code=500, detail="Invoice creation failed")
    return {"invoice_link": data["result"]}


# ─── Spin (from balance) ────────────────────────────

@app.post("/api/spin")
async def spin_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    uid = user["id"]
    spin_cost = await runtime_state.get_spin_cost()

    if spin_cost > 0:
        ok = await db.deduct_balance(uid, spin_cost)
        if not ok:
            balance = await db.get_balance(uid)
            return {"error": "insufficient_balance", "balance": balance, "spin_cost": spin_cost}

    from bot import pick_prize
    winner = pick_prize()
    prize_id = await db.record_spin(uid, winner, is_demo=False, is_free=False, stars=spin_cost)
    balance = await db.get_balance(uid)
    log.info("Spin | uid=%s prize=%s cost=%s bal=%s", uid, winner["key"], spin_cost, balance)
    return {"winner": winner, "prize_id": prize_id, "balance": balance}


# ─── Demo Spin (owner) ──────────────────────────────

@app.post("/api/demo_spin")
async def demo_spin_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    if user["id"] != OWNER_ID:
        raise HTTPException(status_code=403, detail="Owner only")
    flags = await runtime_state.snapshot()
    if not flags["demo"]:
        raise HTTPException(status_code=403, detail="Demo disabled")
    from bot import pick_prize
    winner = pick_prize()
    prize_id = await db.record_spin(user["id"], winner, is_demo=True, is_free=False)
    return {"winner": winner, "prize_id": prize_id, "is_demo": True}


# ─── Free Spin ───────────────────────────────────────

@app.post("/api/free_spin")
async def free_spin_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    uid = user["id"]
    if await db.has_used_free(uid):
        return {"error": "already_used"}
    if not await check_subscription(uid):
        return {"error": "not_subscribed", "channel_url": CHANNEL_URL}
    from bot import pick_prize
    winner = pick_prize()
    await db.mark_free_used(uid)
    prize_id = await db.record_spin(uid, winner, is_demo=False, is_free=True)
    return {"winner": winner, "prize_id": prize_id, "free_used": True}


# ─── Sell Prize ──────────────────────────────────────

@app.post("/api/sell")
async def sell_prize_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    body = await request.json()
    prize_id = int(body.get("prize_id", 0))
    prize_key = body.get("prize_key", "")
    prize_info = PRIZES_BY_KEY.get(prize_key)
    if not prize_info or prize_info["type"] == "nothing":
        raise HTTPException(status_code=400, detail="Cannot sell")
    sell_value = prize_info.get("sell_value", 0)
    if sell_value <= 0:
        raise HTTPException(status_code=400, detail="No sell value")
    ok = await db.sell_prize(user["id"], prize_id, sell_value)
    if not ok:
        raise HTTPException(status_code=400, detail="Not found or already sold")
    balance = await db.get_balance(user["id"])
    log.info("Sell | uid=%s pid=%s +%s⭐ bal=%s", user["id"], prize_id, sell_value, balance)
    return {"ok": True, "sell_value": sell_value, "balance": balance}


# ─── Withdraw Prize ──────────────────────────────────

@app.post("/api/withdraw")
async def withdraw_prize_api(request: Request) -> Dict[str, Any]:
    """Mark prize as 'withdrawing' — gift will be sent via Telegram."""
    user = await get_telegram_user(request)
    body = await request.json()
    prize_id = int(body.get("prize_id", 0))
    ok = await db.withdraw_prize(user["id"], prize_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Not found or already withdrawn")
    log.info("Withdraw | uid=%s pid=%s", user["id"], prize_id)
    return {"ok": True, "status": "withdrawing"}


# ─── Legacy ──────────────────────────────────────────

@app.post("/api/create_invoice")
async def create_invoice_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    spin_cost = await runtime_state.get_spin_cost()
    payload = {
        "title": "Swagging Gift - спин",
        "description": "Один спин рулетки.",
        "payload": f"sg_spin_{user['id']}",
        "currency": "XTR",
        "prices": [{"label": "Прокрутка", "amount": spin_cost}],
    }
    async with aiohttp.ClientSession() as session:
        async with session.post(f"https://api.telegram.org/bot{TOKEN}/createInvoiceLink", json=payload) as resp:
            data = await resp.json()
    if not data.get("ok"):
        raise HTTPException(status_code=500, detail="Invoice failed")
    return {"invoice_link": data["result"]}


@app.get("/api/spin_result")
async def get_spin_result_api(request: Request) -> JSONResponse:
    user = await get_telegram_user(request)
    result = await db.get_spin_result(user["id"])
    return no_store_json({"result": result})


@app.get("/api/prizes_list")
async def get_prizes_list_api() -> Dict[str, Any]:
    return {"prizes": PRIZES, "total_weight": TOTAL_WEIGHT}


@app.get("/api/leaderboard")
async def leaderboard_api(limit: int = 15) -> Dict[str, Any]:
    return {"rows": await db.leaderboard(limit)}


@app.get("/api/history")
async def history_api(limit: int = 20) -> Dict[str, Any]:
    return {"history": await db.get_global_history(limit)}


# ─── SSE Live ────────────────────────────────────────

@app.get("/api/live")
async def live_updates_api() -> StreamingResponse:
    async def event_stream() -> AsyncIterator[str]:
        prev = ""
        while True:
            payload = json.dumps({
                "history": await db.get_global_history(10),
                "leaderboard": await db.leaderboard(8),
            }, ensure_ascii=False)
            if payload != prev:
                yield f"event: snapshot\ndata: {payload}\n\n"
                prev = payload
            else:
                yield "event: ping\ndata: {}\n\n"
            await asyncio.sleep(5)
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


# ─── Admin ───────────────────────────────────────────

@app.get("/api/admin/settings")
async def get_admin_settings_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    if user["id"] != OWNER_ID:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        **(await runtime_state.snapshot()),
        "cost": await runtime_state.get_spin_cost(),
        "owner_id": OWNER_ID,
    }


@app.post("/api/admin/toggle")
async def toggle_setting_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    if user["id"] != OWNER_ID:
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    key = body.get("key")
    if key not in ("demo", "gifts", "maint", "testpay"):
        raise HTTPException(status_code=400, detail="Invalid key")
    value = await runtime_state.toggle(key)
    return {"ok": True, "key": key, "value": value}


@app.post("/api/admin/weights")
async def update_weights_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    if user["id"] != OWNER_ID:
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    weights = body.get("weights", {})
    if not isinstance(weights, dict):
        raise HTTPException(status_code=400, detail="Invalid weights")
    sanitized = {k: max(0, int(v)) for k, v in weights.items() if isinstance(k, str) and isinstance(v, (int, float))}
    update_weights(sanitized)
    log.info("Weights updated: %s", sanitized)
    return {"ok": True, "prizes": PRIZES, "total_weight": TOTAL_WEIGHT}


@app.post("/api/admin/spin_cost")
async def set_spin_cost_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    if user["id"] != OWNER_ID:
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    cost = int(body.get("cost", -1))
    if cost < 0:
        raise HTTPException(status_code=400, detail="Cost >= 0")
    new_cost = await runtime_state.set_spin_cost(cost)
    log.info("Spin cost → %s", new_cost)
    return {"ok": True, "spin_cost": new_cost}


@app.post("/api/admin/set_balance")
async def set_balance_api(request: Request) -> Dict[str, Any]:
    """Owner can add/remove stars for any user."""
    user = await get_telegram_user(request)
    if user["id"] != OWNER_ID:
        raise HTTPException(status_code=403, detail="Forbidden")
    body = await request.json()
    target_uid = int(body.get("user_id", 0))
    delta = int(body.get("delta", 0))
    if target_uid <= 0:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    target = await db.get_user(target_uid)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if delta > 0:
        new_bal = await db.add_balance(target_uid, delta)
    elif delta < 0:
        ok = await db.deduct_balance(target_uid, abs(delta))
        new_bal = await db.get_balance(target_uid) if ok else target.get("balance", 0)
    else:
        new_bal = target.get("balance", 0)
    log.info("Admin set_balance | target=%s delta=%s new=%s", target_uid, delta, new_bal)
    return {"ok": True, "user_id": target_uid, "balance": new_bal}


# ─── Static files ────────────────────────────────────

app.mount(
    "/",
    StaticFiles(directory=str(WEB_ROOT if WEB_ROOT.exists() else Path("webapp")), html=True),
    name="webapp",
)
