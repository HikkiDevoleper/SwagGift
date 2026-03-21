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

from config import CHANNEL_ID, CHANNEL_URL, DB_PATH, OWNER_ID, PRIZES, SPIN_COST, TOKEN, TOTAL_WEIGHT
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
    await db.ensure_user(user["id"], user.get("username", ""), user.get("first_name", ""))
    return user


def no_store_json(payload: Dict[str, Any]) -> JSONResponse:
    response = JSONResponse(payload)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.on_event("startup")
async def startup() -> None:
    await db.setup()
    log.info("Server startup complete")


@app.get("/api/health")
async def healthcheck() -> Dict[str, Any]:
    return {
        "ok": True,
        "stats": await db.get_dashboard_stats(),
    }


@app.get("/api/bootstrap")
async def bootstrap_api(request: Request) -> JSONResponse:
    user = await get_telegram_user(request)
    user_data = await db.get_user(user["id"])
    prizes = await db.get_prizes(user["id"], 100)
    free_used = await db.has_used_free(user["id"])
    flags = await runtime_state.snapshot()
    leaderboard = await db.leaderboard(8)
    history = await db.get_global_history(12)

    return no_store_json(
        {
            "user": user_data,
            "prizes": prizes,
            "free_used": free_used,
            "is_owner": user["id"] == OWNER_ID,
            "config": {
                "spin_cost": SPIN_COST,
                "channel_url": CHANNEL_URL,
                "channel_id": CHANNEL_ID,
            },
            "prizes_catalog": PRIZES,
            "flags": flags,
            "leaderboard": leaderboard,
            "history": history,
        }
    )


@app.get("/api/user")
async def get_user_api(request: Request) -> JSONResponse:
    user = await get_telegram_user(request)
    data = await db.get_user(user["id"])
    prizes = await db.get_prizes(user["id"], 100)
    free_used = await db.has_used_free(user["id"])
    return no_store_json(
        {
            "user": data,
            "prizes": prizes,
            "free_used": free_used,
            "is_owner": user["id"] == OWNER_ID,
        }
    )


@app.post("/api/create_invoice")
async def create_invoice_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    payload = {
        "title": "Swagging Gift - спин",
        "description": "Один спин, одна судьба, один шанс получить подарок Telegram.",
        "payload": f"sg_spin_{user['id']}",
        "currency": "XTR",
        "prices": [{"label": "Прокрутка", "amount": SPIN_COST}],
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(f"https://api.telegram.org/bot{TOKEN}/createInvoiceLink", json=payload) as response:
            data = await response.json()

    if not data.get("ok"):
        log.error("Invoice creation failed: %s", data.get("description"))
        raise HTTPException(status_code=500, detail="Telegram invoice creation failed")
    return {"invoice_link": data["result"]}


@app.post("/api/free_spin")
async def free_spin_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    flags = await runtime_state.snapshot()
    uid = user["id"]

    if await db.has_used_free(uid):
        return {"error": "already_used"}

    try:
        member = await bot_instance.get_chat_member(CHANNEL_ID, uid)
        subscribed = member.status in ("member", "administrator", "creator")
    except Exception as exc:
        log.exception("Subscription check failed for %s: %s", uid, exc)
        subscribed = False

    if not subscribed:
        return {"error": "not_subscribed", "channel_url": CHANNEL_URL}

    from bot import pick_prize

    winner = pick_prize()
    await db.mark_free_used(uid)
    await db.record_spin(uid, winner, is_demo=flags["demo"], is_free=True)
    log.info("Free spin | uid=%s prize=%s", uid, winner["key"])
    return {"winner": winner, "free_used": True}


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


@app.get("/api/live")
async def live_updates_api() -> StreamingResponse:
    async def event_stream() -> AsyncIterator[str]:
        previous_payload = ""
        while True:
            payload = json.dumps(
                {
                    "history": await db.get_global_history(10),
                    "leaderboard": await db.leaderboard(8),
                    "stats": await db.get_dashboard_stats(),
                },
                ensure_ascii=False,
            )
            if payload != previous_payload:
                yield f"event: snapshot\ndata: {payload}\n\n"
                previous_payload = payload
            else:
                yield "event: ping\ndata: {}\n\n"
            await asyncio.sleep(5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@app.get("/api/admin/settings")
async def get_admin_settings_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    if user["id"] != OWNER_ID:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        **(await runtime_state.snapshot()),
        "cost": SPIN_COST,
        "owner_id": OWNER_ID,
    }


@app.post("/api/admin/toggle")
async def toggle_setting_api(request: Request) -> Dict[str, Any]:
    user = await get_telegram_user(request)
    if user["id"] != OWNER_ID:
        raise HTTPException(status_code=403, detail="Forbidden")

    body = await request.json()
    key = body.get("key")
    key_map = {
        "demo": "demo",
        "gifts": "gifts",
        "maint": "maint",
        "testpay": "testpay",
    }
    if key not in key_map:
        raise HTTPException(status_code=400, detail="Invalid key")

    value = await runtime_state.toggle(key_map[key])
    return {"ok": True, "key": key, "value": value}


app.mount(
    "/",
    StaticFiles(directory=str(WEB_ROOT if WEB_ROOT.exists() else Path("webapp")), html=True),
    name="webapp",
)
