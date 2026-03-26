import asyncio
import html
import logging
import random
from datetime import datetime, timezone
from typing import Any, Dict, List

import aiohttp
from aiogram import Bot, Dispatcher, F, types
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    Message,
    PreCheckoutQuery,
    WebAppInfo,
)
from aiogram.utils.keyboard import InlineKeyboardBuilder

from config import BOT_START_TIME, CHANNEL_URL, DB_PATH, DEFAULT_SPIN_COST, OWNER_ID, OWNER_USERNAME, PRIZES, TOKEN, WEBAPP_URL
from database import Database
from runtime_state import runtime_state

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s | %(message)s",
)
log = logging.getLogger("swagging_gift.bot")

db = Database(DB_PATH)
bot = Bot(token=TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher()
DB_READY = False
TG_API_BASE = f"https://api.telegram.org/bot{TOKEN}"


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def is_owner(uid: int) -> bool:
    return uid == OWNER_ID


def uptime_text() -> str:
    delta = datetime.now(timezone.utc) - BOT_START_TIME
    hours, rest = divmod(int(delta.total_seconds()), 3600)
    minutes, seconds = divmod(rest, 60)
    return f"{hours}ч {minutes}м {seconds}с"


def pick_prize() -> Dict[str, Any]:
    return random.choices(PRIZES, weights=[prize["weight"] for prize in PRIZES], k=1)[0]


async def api_get_available_gifts() -> List[Dict[str, Any]]:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{TG_API_BASE}/getAvailableGifts") as response:
                data = await response.json()
        if data.get("ok"):
            return data["result"].get("gifts", [])
        log.warning("getAvailableGifts failed: %s", data.get("description"))
    except Exception as exc:
        log.exception("getAvailableGifts error: %s", exc)
    return []


async def api_send_gift(uid: int, gift_id: str, text: str = "") -> bool:
    payload: Dict[str, Any] = {"user_id": uid, "gift_id": gift_id}
    if text:
        payload["text"] = text[:255]

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{TG_API_BASE}/sendGift", json=payload) as response:
                data = await response.json()
        return bool(data.get("ok"))
    except Exception as exc:
        log.exception("sendGift error: %s", exc)
        return False


async def api_refund_stars(uid: int, charge_id: str) -> bool:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{TG_API_BASE}/refundStarPayment",
                json={"user_id": uid, "telegram_payment_charge_id": charge_id},
            ) as response:
                data = await response.json()
        return bool(data.get("ok"))
    except Exception as exc:
        log.exception("refundStarPayment error: %s", exc)
        return False


async def populate_gift_ids() -> None:
    gifts = await api_get_available_gifts()
    if not gifts:
        return

    emoji_map = {prize["emoji"]: prize for prize in PRIZES if prize["type"] == "gift"}
    for gift in gifts:
        emoji = gift.get("sticker", {}).get("emoji", "")
        if emoji in emoji_map and emoji_map[emoji]["gift_id"] is None:
            emoji_map[emoji]["gift_id"] = gift.get("id")

    used_ids = {prize["gift_id"] for prize in PRIZES if prize.get("gift_id")}
    spare_gifts = [gift for gift in gifts if gift.get("id") not in used_ids]
    missing = [prize for prize in PRIZES if prize["type"] == "gift" and not prize.get("gift_id")]
    for index, prize in enumerate(missing):
        if index < len(spare_gifts):
            prize["gift_id"] = spare_gifts[index]["id"]


async def get_runtime_flags() -> Dict[str, bool]:
    return await runtime_state.snapshot()


async def set_runtime_flag(key: str) -> bool:
    return await runtime_state.toggle(key)


def owner_keyboard(flags: Dict[str, bool]) -> types.InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(
            text=f"Демо: {'ВКЛ' if flags['demo'] else 'ВЫКЛ'}",
            callback_data="own_demo",
        ),
        InlineKeyboardButton(
            text=f"Подарки: {'ВКЛ' if flags['gifts'] else 'ВЫКЛ'}",
            callback_data="own_gifts",
        ),
    )
    builder.row(
        InlineKeyboardButton(
            text=f"Техрежим: {'ВКЛ' if flags['maint'] else 'ВЫКЛ'}",
            callback_data="own_maint",
        ),
        InlineKeyboardButton(
            text=f"Тест-оплата: {'ВКЛ' if flags['testpay'] else 'ВЫКЛ'}",
            callback_data="own_testpay",
        ),
    )
    builder.row(
        InlineKeyboardButton(text="Финансы", callback_data="own_stars"),
        InlineKeyboardButton(text="Игроки", callback_data="own_users_0"),
    )
    builder.row(
        InlineKeyboardButton(text="Платежи", callback_data="own_payments"),
        InlineKeyboardButton(text="Gift IDs", callback_data="own_gift_ids"),
    )
    return builder.as_markup()


async def render_owner_panel() -> str:
    stats = await db.get_dashboard_stats()
    flags = await get_runtime_flags()
    return (
        "<b>Панель управления</b>\n\n"
        f"Uptime: <code>{uptime_text()}</code>\n"
        f"Игроков: <b>{stats['users']}</b>\n"
        f"Спинов: <b>{stats['spins']}</b>\n"
        f"Звёзд: <b>{stats['stars']}</b>\n"
        f"Побед сегодня: <b>{stats['wins_today']}</b>\n\n"
        f"Demo: <b>{'ON' if flags['demo'] else 'OFF'}</b>\n"
        f"Gifts: <b>{'ON' if flags['gifts'] else 'OFF'}</b>\n"
        f"Maint: <b>{'ON' if flags['maint'] else 'OFF'}</b>\n"
        f"TestPay: <b>{'ON' if flags['testpay'] else 'OFF'}</b>"
    )


@dp.update.outer_middleware()
async def guard_middleware(handler, event: types.Update, data: dict):
    if not DB_READY:
        return await handler(event, data)

    user = None
    if event.message:
        user = event.message.from_user
    elif event.callback_query:
        user = event.callback_query.from_user

    if not user or is_owner(user.id):
        return await handler(event, data)

    if await db.is_banned(user.id):
        return None

    flags = await get_runtime_flags()
    if flags["maint"]:
        text = (
            "<b>Swag Gift — технический перерыв</b>\n\n"
            "Уже чиним. Скоро крутим снова 🔧"
        )
        if event.message:
            await event.message.answer(text)
        elif event.callback_query:
            await event.callback_query.answer(text, show_alert=True)
        return None

    return await handler(event, data)


@dp.message(Command("start"))
async def cmd_start(message: Message) -> None:
    user = message.from_user
    await db.ensure_user(user.id, user.username or "", user.first_name or "")

    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(
            text="🎰 Запустить Swag Gift",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )
    )

    await message.answer(
        (
            f"🎁 <b>Swag Gift</b>\n\n"
            f"Настоящие Telegram-подарки. Реальные шансы. Без воды.\n\n"
            f"Крути барабан → выигрывай → забирай.\n"
            f"<i>Один бесплатный спин уже ждёт тебя.</i>"
        ),
        reply_markup=builder.as_markup(),
    )


@dp.message(Command("admin"))
async def cmd_admin(message: Message) -> None:
    if not is_owner(message.from_user.id):
        return
    flags = await get_runtime_flags()
    await message.answer(await render_owner_panel(), reply_markup=owner_keyboard(flags))


@dp.callback_query(F.data == "owner_panel")
async def cb_owner_panel(callback: CallbackQuery) -> None:
    if not is_owner(callback.from_user.id):
        return
    flags = await get_runtime_flags()
    await callback.message.edit_text(await render_owner_panel(), reply_markup=owner_keyboard(flags))
    await callback.answer()


async def handle_flag_toggle(callback: CallbackQuery, key: str, label: str) -> None:
    if not is_owner(callback.from_user.id):
        return
    value = await set_runtime_flag(key)
    await callback.answer(f"{label}: {'ВКЛ' if value else 'ВЫКЛ'}", show_alert=True)
    await cb_owner_panel(callback)


@dp.callback_query(F.data == "own_demo")
async def cb_own_demo(callback: CallbackQuery) -> None:
    await handle_flag_toggle(callback, "demo", "Демо")


@dp.callback_query(F.data == "own_gifts")
async def cb_own_gifts(callback: CallbackQuery) -> None:
    await handle_flag_toggle(callback, "gifts", "Подарки")


@dp.callback_query(F.data == "own_maint")
async def cb_own_maint(callback: CallbackQuery) -> None:
    await handle_flag_toggle(callback, "maint", "Техрежим")


@dp.callback_query(F.data == "own_testpay")
async def cb_own_testpay(callback: CallbackQuery) -> None:
    await handle_flag_toggle(callback, "testpay", "Тест-оплата")


@dp.callback_query(F.data == "own_stars")
async def cb_own_stars(callback: CallbackQuery) -> None:
    if not is_owner(callback.from_user.id):
        return
    stars = await db.total_stars()
    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(text="Назад", callback_data="owner_panel"))
    await callback.message.edit_text(
        (
            "<b>Финансы</b>\n\n"
            f"Накоплено звёзд: <b>{stars} ⭐</b>\n"
            "Возврат: <code>/refund &lt;charge_id&gt;</code>"
        ),
        reply_markup=builder.as_markup(),
    )
    await callback.answer()


@dp.callback_query(F.data.startswith("own_users_"))
async def cb_own_users(callback: CallbackQuery) -> None:
    if not is_owner(callback.from_user.id):
        return
    offset = int(callback.data.rsplit("_", 1)[-1])
    users = await db.get_users_list(limit=10, offset=offset)
    lines = [
        f"<b>{esc(user['first_name'] or user['username'] or 'Игрок')}</b> "
        f"<code>{user['user_id']}</code> | spins {user['spins']} | wins {user['wins']}"
        for user in users
    ] or ["Пока пусто."]
    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(text="Назад", callback_data="owner_panel"))
    await callback.message.edit_text("<b>Игроки</b>\n\n" + "\n".join(lines), reply_markup=builder.as_markup())
    await callback.answer()


@dp.callback_query(F.data == "own_payments")
async def cb_own_payments(callback: CallbackQuery) -> None:
    if not is_owner(callback.from_user.id):
        return
    rows = await db.recent_payments(limit=8)
    lines = [
        f"<b>{esc(row.get('first_name') or row.get('username') or 'Игрок')}</b>: "
        f"{row['amount']}⭐ | <code>…{row['charge_id'][-6:]}</code>"
        for row in rows
    ] or ["Платежей пока нет."]
    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(text="Назад", callback_data="owner_panel"))
    await callback.message.edit_text("<b>Платежи</b>\n\n" + "\n".join(lines), reply_markup=builder.as_markup())
    await callback.answer()


@dp.callback_query(F.data == "own_gift_ids")
async def cb_own_gift_ids(callback: CallbackQuery) -> None:
    if not is_owner(callback.from_user.id):
        return
    lines = [
        f"{'✅' if prize.get('gift_id') else '❌'} {prize['emoji']} {esc(prize['name'])}"
        for prize in PRIZES
        if prize["type"] == "gift"
    ]
    builder = InlineKeyboardBuilder()
    builder.row(InlineKeyboardButton(text="Обновить", callback_data="own_reload_gifts"))
    builder.row(InlineKeyboardButton(text="Назад", callback_data="owner_panel"))
    await callback.message.edit_text("<b>Gift IDs</b>\n\n" + "\n".join(lines), reply_markup=builder.as_markup())
    await callback.answer()


@dp.callback_query(F.data == "own_reload_gifts")
async def cb_own_reload_gifts(callback: CallbackQuery) -> None:
    if not is_owner(callback.from_user.id):
        return
    await populate_gift_ids()
    await callback.answer("Список обновлён", show_alert=True)
    await cb_own_gift_ids(callback)


@dp.pre_checkout_query()
async def pre_checkout(pre_checkout_query: PreCheckoutQuery) -> None:
    await pre_checkout_query.answer(ok=True)


@dp.message(F.successful_payment)
async def on_paid(message: Message) -> None:
    user = message.from_user
    payment = message.successful_payment
    payload_str = payment.invoice_payload or ""

    await db.ensure_user(user.id, user.username or "", user.first_name or "")

    # Detect topup payment: payload starts with "sg_topup_"
    if payload_str.startswith("sg_topup_"):
        amount = payment.total_amount
        new_balance = await db.add_balance(user.id, amount)
        log.info("Topup | uid=%s amount=%s new_balance=%s", user.id, amount, new_balance)
        return

    # Legacy spin payment
    flags = await get_runtime_flags()
    prize = pick_prize()
    is_demo = flags["demo"]

    await db.record_spin(
        user.id,
        prize,
        is_demo=is_demo,
        stars=payment.total_amount,
        charge_id=payment.telegram_payment_charge_id,
    )
    await db.set_spin_result_by_uid(
        user.id,
        {
            "winner": prize,
            "charge_id": payment.telegram_payment_charge_id,
            "is_demo": is_demo,
        },
    )

    if flags["gifts"] and prize["type"] == "gift" and prize.get("gift_id"):
        sent = await api_send_gift(user.id, prize["gift_id"], "Подарок из Swagging Gift")
        log.info("Gift delivery for %s: %s", user.id, sent)

    log.info(
        "Payment | uid=%s amount=%s prize=%s",
        user.id, payment.total_amount, prize["key"],
    )


@dp.message(Command("refund"))
async def cmd_refund(message: Message) -> None:
    if not is_owner(message.from_user.id):
        return
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Использование: <code>/refund charge_id</code>")
        return

    charge_id = parts[1].strip()
    payment = await db.get_payment(charge_id)
    if not payment:
        await message.answer("Платёж не найден.")
        return
    if payment["refunded"]:
        await message.answer("Этот платёж уже возвращён.")
        return

    if await api_refund_stars(payment["user_id"], charge_id):
        await db.mark_refunded(charge_id)
        await message.answer("Возврат выполнен.")
        return

    await message.answer("Не удалось выполнить возврат.")


@dp.message(Command("broadcast"))
async def cmd_broadcast(message: Message) -> None:
    if not is_owner(message.from_user.id):
        return
    parts = (message.text or "").split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Использование: <code>/broadcast текст</code>")
        return

    text = parts[1].strip()
    user_ids = await db.all_user_ids()
    delivered = 0
    for uid in user_ids:
        try:
            await bot.send_message(uid, f"📣 {text}")
            delivered += 1
        except Exception:
            continue
        await asyncio.sleep(0.04)
    await message.answer(f"Рассылка завершена. Доставлено: <b>{delivered}</b>")


@dp.message(Command("ban"))
async def cmd_ban(message: Message) -> None:
    if not is_owner(message.from_user.id):
        return
    parts = (message.text or "").split()
    if len(parts) < 2 or not parts[1].isdigit():
        await message.answer("Использование: <code>/ban user_id</code>")
        return
    uid = int(parts[1])
    await db.set_ban(uid, True)
    await message.answer(f"Пользователь <code>{uid}</code> забанен.")


@dp.message(Command("unban"))
async def cmd_unban(message: Message) -> None:
    if not is_owner(message.from_user.id):
        return
    parts = (message.text or "").split()
    if len(parts) < 2 or not parts[1].isdigit():
        await message.answer("Использование: <code>/unban user_id</code>")
        return
    uid = int(parts[1])
    await db.set_ban(uid, False)
    await message.answer(f"Пользователь <code>{uid}</code> разбанен.")


async def main() -> None:
    global DB_READY
    await db.setup()
    DB_READY = True
    await populate_gift_ids()
    await bot.set_my_commands(
        [
            types.BotCommand(command="start", description="Открыть главное меню"),
            types.BotCommand(command="admin", description="Панель владельца"),
        ]
    )
    log.info("Bot started | spin_cost=%s | webapp=%s | channel=%s", DEFAULT_SPIN_COST, WEBAPP_URL, CHANNEL_URL)
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
