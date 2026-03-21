import asyncio
import random
import logging
import aiohttp
import json
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any

from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery, LabeledPrice, PreCheckoutQuery, Message,
    InlineKeyboardButton, WebAppInfo, ReplyKeyboardMarkup, KeyboardButton
)
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.enums import ParseMode
from aiogram.client.default import DefaultBotProperties
from aiogram.exceptions import TelegramBadRequest

from config import (
    TOKEN, SPIN_COST, OWNER_ID, OWNER_USERNAME, 
    CHANNEL_ID, CHANNEL_URL, WEBAPP_URL, DB_PATH,
    PRIZES, TOTAL_WEIGHT, NICE_EMOJIS, BOT_START_TIME
)
from database import Database

# ══════════════════════════════════════════════════════════════════
#  КОНФИГУРАЦИЯ
# ══════════════════════════════════════════════════════════════════
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
log = logging.getLogger("swagging_gift.bot")

db = Database(DB_PATH)

# Глобальные переключатели (меняются через панель/команды)
DEMO_MODE:        bool = False
SEND_GIFTS:       bool = False
MAINTENANCE_MODE: bool = False
OWNER_TEST_PAY:   bool = False

# Флаг — БД готова
DB_READY: bool = False

TG_API_BASE = f"https://api.telegram.org/bot{TOKEN}"

# ══════════════════════════════════════════════════════════════════
#  TELEGRAM API HELPERS
# ══════════════════════════════════════════════════════════════════
async def api_get_available_gifts() -> List[Dict]:
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"{TG_API_BASE}/getAvailableGifts") as r:
                data = await r.json()
        if data.get("ok"):
            gifts = data["result"].get("gifts", [])
            log.info(f"getAvailableGifts: {len(gifts)} подарков")
            return gifts
        log.warning(f"getAvailableGifts: {data.get('description')}")
    except Exception as ex:
        log.error(f"getAvailableGifts: {ex}")
    return []

async def api_send_gift(uid: int, gift_id: str, text: str = "") -> bool:
    payload: Dict = {"user_id": uid, "gift_id": gift_id}
    if text:
        payload["text"] = text[:255]
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(f"{TG_API_BASE}/sendGift", json=payload) as r:
                data = await r.json()
        return data.get("ok", False)
    except Exception as ex:
        log.error(f"sendGift: {ex}")
    return False

async def api_refund_stars(uid: int, charge_id: str) -> bool:
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(
                f"{TG_API_BASE}/refundStarPayment",
                json={"user_id": uid, "telegram_payment_charge_id": charge_id},
            ) as r:
                data = await r.json()
        return data.get("ok", False)
    except Exception as ex:
        log.error(f"refundStarPayment: {ex}")
    return False

async def populate_gift_ids() -> None:
    gifts = await api_get_available_gifts()
    if not gifts: return
    emoji_map = {p["emoji"]: p for p in PRIZES if p["type"] == "gift"}
    for g in gifts:
        em = g.get("sticker", {}).get("emoji", "")
        gid = g.get("id")
        if em in emoji_map and emoji_map[em]["gift_id"] is None:
            emoji_map[em]["gift_id"] = gid
    used = {p["gift_id"] for p in PRIZES if p["gift_id"]}
    spare = [g for g in gifts if g.get("id") not in used]
    unmapped = [p for p in PRIZES if p["type"] == "gift" and p["gift_id"] is None]
    for i, p in enumerate(unmapped):
        if i < len(spare): p["gift_id"] = spare[i]["id"]

# ══════════════════════════════════════════════════════════════════
#  ХЕЛПЕРЫ
# ══════════════════════════════════════════════════════════════════
def e(text: str) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def is_owner(uid: int) -> bool:
    return uid == OWNER_ID

def _uptime() -> str:
    d = datetime.now(timezone.utc) - BOT_START_TIME
    h, r = divmod(int(d.total_seconds()), 3600)
    m, s = divmod(r, 60)
    return f"{h}ч {m}м {s}с"

def _div(n: int = 22) -> str:
    return "━" * n

def pick_prize() -> Dict:
    return random.choices(PRIZES, weights=[p["weight"] for p in PRIZES], k=1)[0]

# ══════════════════════════════════════════════════════════════════
#  БОТ
# ══════════════════════════════════════════════════════════════════
bot = Bot(token=TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()

@dp.update.outer_middleware()
async def guard_middleware(handler, event: types.Update, data: dict):
    if not DB_READY: return await handler(event, data)
    user = None
    if event.message: user = event.message.from_user
    elif event.callback_query: user = event.callback_query.from_user
    if user and user.id != OWNER_ID:
        if await db.is_banned(user.id): return
        if MAINTENANCE_MODE:
            notice = "<b>Swagging Gift временно недоступен</b>\n\nВедутся технические работы. Попробуйте позже."
            if event.message: await event.message.answer(notice)
            elif event.callback_query: await event.callback_query.answer(notice, show_alert=True)
            return
    return await handler(event, data)

# ══════════════════════════════════════════════════════════════════
#  ОСНОВНЫЕ КОМАНДЫ
# ══════════════════════════════════════════════════════════════════
@dp.message(Command("start"))
async def cmd_start(msg: Message) -> None:
    uid = msg.from_user.id
    await db.ensure_user(uid, msg.from_user.username or "", msg.from_user.first_name or "")
    
    kb = ReplyKeyboardMarkup(keyboard=[[
        KeyboardButton(text="🎰 Открыть рулетку", web_app=WebAppInfo(url=WEBAPP_URL))
    ]], resize_keyboard=True)
    
    await msg.answer(
        "<b>Swagging Gift</b>\n\nКрутите барабан и выигрывайте настоящие подарки Telegram.\n"
        "Выигранный подарок появляется прямо в вашем профиле.",
        reply_markup=kb
    )

@dp.pre_checkout_query()
async def pre_checkout(q: PreCheckoutQuery) -> None:
    await q.answer(ok=True)

@dp.message(F.successful_payment)
async def on_paid(msg: Message) -> None:
    uid = msg.from_user.id
    charge_id = msg.successful_payment.telegram_payment_charge_id
    stars = msg.successful_payment.total_amount
    
    winner = pick_prize()
    await db.record_spin(uid, winner, stars=stars, charge_id=charge_id)
    await db.set_spin_result(charge_id, {"winner": winner, "charge_id": charge_id})
    
    log.info(f"ПЛАТЕЖ: User {uid} оплатил {stars}⭐. Выпал {winner['name']}")

# ══════════════════════════════════════════════════════════════════
#  ПАНЕЛЬ ВЛАДЕЛЬЦА (ТОЛЬКО ДЛЯ БОТА)
# ══════════════════════════════════════════════════════════════════
def kb_owner() -> types.InlineKeyboardMarkup:
    b = InlineKeyboardBuilder()
    b.row(
        InlineKeyboardButton(text="Демо: ВКЛ" if DEMO_MODE else "Демо: ВЫКЛ", callback_data="own_demo"),
        InlineKeyboardButton(text="Подарки: ВКЛ" if SEND_GIFTS else "Подарки: ВЫКЛ", callback_data="own_gifts_toggle"),
    )
    b.row(
        InlineKeyboardButton(text="Тех-режим: ВКЛ" if MAINTENANCE_MODE else "Тех-режим: ВЫКЛ", callback_data="own_maint"),
        InlineKeyboardButton(text="Тест оплаты: ВКЛ" if OWNER_TEST_PAY else "Тест оплаты: ВЫКЛ", callback_data="own_testpay"),
    )
    b.row(InlineKeyboardButton(text="Финансы", callback_data="own_stars"), InlineKeyboardButton(text="Игроки", callback_data="own_users_0"))
    b.row(InlineKeyboardButton(text="Платежи", callback_data="own_payments"), InlineKeyboardButton(text="Gift IDs", callback_data="own_gift_ids"))
    return b.as_markup()

@dp.message(Command("admin"))
async def cmd_admin(msg: Message) -> None:
    if not is_owner(msg.from_user.id): return
    await msg.answer("<b>Панель управления</b>", reply_markup=kb_owner())

@dp.callback_query(F.data == "owner_panel")
async def cb_owner_panel(cb: CallbackQuery) -> None:
    if not is_owner(cb.from_user.id): return
    await cb.message.edit_text("<b>Панель управления</b>", reply_markup=kb_owner())
    await cb.answer()

@dp.callback_query(F.data == "own_demo")
async def cb_own_demo(cb: CallbackQuery) -> None:
    if not is_owner(cb.from_user.id): return
    global DEMO_MODE
    DEMO_MODE = not DEMO_MODE
    await cb.answer(f"Демо: {'ВКЛ 🟢' if DEMO_MODE else 'ВЫКЛ ⚫'}", show_alert=True)
    await cb_owner_panel(cb)

@dp.callback_query(F.data == "own_gifts_toggle")
async def cb_own_gifts_toggle(cb: CallbackQuery) -> None:
    if not is_owner(cb.from_user.id): return
    global SEND_GIFTS
    SEND_GIFTS = not SEND_GIFTS
    await cb.answer(f"Авто-подарки: {'ВКЛ 🟢' if SEND_GIFTS else 'ВЫКЛ ⚫'}", show_alert=True)
    await cb_owner_panel(cb)

@dp.callback_query(F.data == "own_maint")
async def cb_own_maint(cb: CallbackQuery) -> None:
    if not is_owner(cb.from_user.id): return
    global MAINTENANCE_MODE
    MAINTENANCE_MODE = not MAINTENANCE_MODE
    await cb.answer(f"Тех-режим: {'ВКЛ 🛠' if MAINTENANCE_MODE else 'ВЫКЛ ⚫'}", show_alert=True)
    await cb_owner_panel(cb)

@dp.callback_query(F.data == "own_stars")
async def cb_own_stars(cb: CallbackQuery) -> None:
    if not is_owner(cb.from_user.id): return
    stars = await db.total_stars()
    div = _div()
    text = (f"💰 <b>Финансы</b>\n<code>{div}</code>\nНакоплено звёзд: <b>{stars} ⭐</b>\n\n"
            "/refund <charge_id>")
    b = InlineKeyboardBuilder()
    b.row(InlineKeyboardButton(text="⬅️ Назад", callback_data="owner_panel"))
    await cb.message.edit_text(text, reply_markup=b.as_markup())
    await cb.answer()

@dp.callback_query(F.data.startswith("own_users_"))
async def cb_own_users(cb: CallbackQuery) -> None:
    if not is_owner(cb.from_user.id): return
    offset = int(cb.data.split("_")[-1])
    users = await db.get_users_list(10, offset)
    lines = [f"<b>{e(u['first_name'] or u['username'])}</b> <code>{u['user_id']}</code>" for u in users]
    text = f"👥 <b>Игроки</b>\n" + "\n".join(lines)
    b = InlineKeyboardBuilder()
    b.row(InlineKeyboardButton(text="⬅️ Назад", callback_data="owner_panel"))
    await cb.message.edit_text(text, reply_markup=b.as_markup())
    await cb.answer()

@dp.callback_query(F.data == "own_payments")
async def cb_own_payments(cb: CallbackQuery) -> None:
    if not is_owner(cb.from_user.id): return
    rows = await db.recent_payments(8)
    lines = [f"<b>{e(r.get('first_name'))}</b>: {r['amount']}⭐ (…{r['charge_id'][-6:]})" for r in rows]
    text = f"📜 <b>Платежи</b>\n" + "\n".join(lines)
    b = InlineKeyboardBuilder()
    b.row(InlineKeyboardButton(text="⬅️ Назад", callback_data="owner_panel"))
    await cb.message.edit_text(text, reply_markup=b.as_markup())
    await cb.answer()

@dp.callback_query(F.data == "own_gift_ids")
async def cb_own_gift_ids(cb: CallbackQuery) -> None:
    if not is_owner(cb.from_user.id): return
    lines = [f"{'✅' if p.get('gift_id') else '❌'} {p['emoji']} {p['name']}" for p in PRIZES if p["type"] == "gift"]
    text = f"🎁 <b>Gift IDs</b>\n" + "\n".join(lines)
    b = InlineKeyboardBuilder()
    b.row(InlineKeyboardButton(text="🔄 Обновить", callback_data="own_reload_gifts"))
    b.row(InlineKeyboardButton(text="⬅️ Назад", callback_data="owner_panel"))
    await cb.message.edit_text(text, reply_markup=b.as_markup())
    await cb.answer()

@dp.callback_query(F.data == "own_reload_gifts")
async def cb_own_reload_gifts(cb: CallbackQuery) -> None:
    if not is_owner(cb.from_user.id): return
    await populate_gift_ids()
    await cb.answer("Обновлено", show_alert=True)
    await cb_own_gift_ids(cb)

# ══════════════════════════════════════════════════════════════════
#  КОМАНДЫ (REFUND, BROADCAST и т.д.)
# ══════════════════════════════════════════════════════════════════
@dp.message(Command("refund"))
async def cmd_refund(msg: Message) -> None:
    if not is_owner(msg.from_user.id): return
    parts = msg.text.split()
    if len(parts) < 2: return
    charge_id = parts[1]
    payment = await db.get_payment(charge_id)
    if not payment or payment["refunded"]: return
    if await api_refund_stars(payment["user_id"], charge_id):
        await db.mark_refunded(charge_id)
        await msg.answer("✅ Возврат выполнен")

@dp.message(Command("broadcast"))
async def cmd_broadcast(msg: Message) -> None:
    if not is_owner(msg.from_user.id): return
    parts = msg.text.split(maxsplit=1)
    if len(parts) < 2: return
    text = parts[1]
    ids = await db.all_user_ids()
    for uid in ids:
        try: await bot.send_message(uid, f"📢 {text}")
        except: pass
        await asyncio.sleep(0.05)
    await msg.answer("✅ Рассылка завершена")

@dp.message(Command("ban"))
async def cmd_ban(msg: Message) -> None:
    if not is_owner(msg.from_user.id): return
    parts = msg.text.split()
    if len(parts) < 2: return
    uid = int(parts[1])
    await db.set_ban(uid, True)
    await msg.answer(f"🚫 {uid} забанен")

@dp.message(Command("unban"))
async def cmd_unban(msg: Message) -> None:
    if not is_owner(msg.from_user.id): return
    parts = msg.text.split()
    if len(parts) < 2: return
    uid = int(parts[1])
    await db.set_ban(uid, False)
    await msg.answer(f"✅ {uid} разбанен")

async def main() -> None:
    global DB_READY
    await db.setup()
    DB_READY = True
    await populate_gift_ids()
    await bot.set_my_commands([
        types.BotCommand(command="start", description="Главное меню"),
    ])
    await bot.set_chat_menu_button(
        menu_button=types.MenuButtonWebApp(text="Открыть рулетку", web_app=types.WebAppInfo(url=WEBAPP_URL))
    )
    log.info(f"Bot started | Cost: {SPIN_COST}")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())