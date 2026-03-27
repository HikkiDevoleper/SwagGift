import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List, Optional

import aiosqlite

log = logging.getLogger("swagging_gift.db")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Database:
    _setup_locks: Dict[str, asyncio.Lock] = {}
    _setup_done: set[str] = set()

    def __init__(self, path: Path):
        self.path = str(path)
        self.journal_mode = os.environ.get("DB_JOURNAL_MODE", "DELETE").upper()

    @asynccontextmanager
    async def _connection(self) -> AsyncIterator[aiosqlite.Connection]:
        db = await aiosqlite.connect(self.path, timeout=30)
        try:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys = ON")
            await db.execute("PRAGMA synchronous = NORMAL")
            await db.execute("PRAGMA busy_timeout = 15000")
            yield db
        finally:
            await db.close()

    async def setup(self) -> None:
        lock = self._setup_locks.setdefault(self.path, asyncio.Lock())
        async with lock:
            if self.path in self._setup_done:
                return

            async with self._connection() as db:
                await db.execute(f"PRAGMA journal_mode = {self.journal_mode}")
                await db.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        user_id INTEGER PRIMARY KEY,
                        username TEXT DEFAULT '',
                        first_name TEXT DEFAULT '',
                        spins INTEGER DEFAULT 0,
                        wins INTEGER DEFAULT 0,
                        stars_spent INTEGER DEFAULT 0,
                        is_banned INTEGER DEFAULT 0,
                        free_used INTEGER DEFAULT 0,
                        joined_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS prizes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        prize_key TEXT NOT NULL,
                        prize_name TEXT NOT NULL,
                        rarity TEXT NOT NULL,
                        is_demo INTEGER DEFAULT 0,
                        is_free INTEGER DEFAULT 0,
                        won_at TEXT NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS payments (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        charge_id TEXT NOT NULL UNIQUE,
                        amount INTEGER NOT NULL,
                        refunded INTEGER DEFAULT 0,
                        paid_at TEXT NOT NULL,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS pending_spins (
                        uid INTEGER PRIMARY KEY,
                        result TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        FOREIGN KEY (uid) REFERENCES users(user_id) ON DELETE CASCADE
                    );

                    CREATE INDEX IF NOT EXISTS idx_prizes_user_won_at ON prizes(user_id, won_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_prizes_won_at ON prizes(won_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_users_joined_at ON users(joined_at DESC);

                    CREATE TABLE IF NOT EXISTS kv_store (
                        key   TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    );
                    """
                )

                for table, col, dfn in [
                    ("users", "stars_spent", "INTEGER DEFAULT 0"),
                    ("users", "is_banned", "INTEGER DEFAULT 0"),
                    ("users", "free_used", "INTEGER DEFAULT 0"),
                    ("users", "updated_at", f"TEXT NOT NULL DEFAULT '{utc_now_iso()}'"),
                    ("users", "balance", "INTEGER DEFAULT 0"),
                    ("users", "photo_url", "TEXT DEFAULT ''"),
                    ("prizes", "is_free", "INTEGER DEFAULT 0"),
                    ("prizes", "status", "TEXT DEFAULT 'active'"),
                ]:
                    try:
                        await db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {dfn}")
                    except Exception:
                        pass

                await db.commit()

            self._setup_done.add(self.path)
            log.info("Database ready: %s | journal_mode=%s", self.path, self.journal_mode)

    # ── KV Store ──────────────────────────────────────

    async def get_kv(self, key: str) -> Optional[str]:
        async with self._connection() as db:
            async with db.execute("SELECT value FROM kv_store WHERE key = ?", (key,)) as cur:
                row = await cur.fetchone()
                return row[0] if row else None

    async def set_kv(self, key: str, value: str) -> None:
        async with self._connection() as db:
            await db.execute(
                "INSERT INTO kv_store (key, value) VALUES (?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )
            await db.commit()

    async def ensure_user(self, uid: int, username: str, first_name: str, photo_url: str = "") -> None:
        async with self._connection() as db:
            now = utc_now_iso()
            await db.execute(
                """
                INSERT INTO users (user_id, username, first_name, photo_url, joined_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    username = excluded.username,
                    first_name = excluded.first_name,
                    photo_url = excluded.photo_url,
                    updated_at = excluded.updated_at
                """,
                (uid, username or "", first_name or "", photo_url or "", now, now),
            )
            await db.commit()

    async def get_user(self, uid: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            async with db.execute("SELECT * FROM users WHERE user_id = ?", (uid,)) as cur:
                row = await cur.fetchone()
                if not row:
                    return None
                d = dict(row)
                if "balance" not in d:
                    d["balance"] = 0
                return d

    async def get_balance(self, uid: int) -> int:
        user = await self.get_user(uid)
        return int(user.get("balance", 0)) if user else 0

    async def add_balance(self, uid: int, amount: int) -> int:
        """Add stars to user balance. Returns new balance."""
        async with self._connection() as db:
            await db.execute(
                "UPDATE users SET balance = balance + ?, updated_at = ? WHERE user_id = ?",
                (amount, utc_now_iso(), uid),
            )
            await db.commit()
        return await self.get_balance(uid)

    async def deduct_balance(self, uid: int, amount: int) -> bool:
        """Deduct from balance. Returns False if insufficient."""
        async with self._connection() as db:
            cur = await db.execute(
                "UPDATE users SET balance = balance - ?, updated_at = ? WHERE user_id = ? AND balance >= ?",
                (amount, utc_now_iso(), uid, amount),
            )
            await db.commit()
            return cur.rowcount > 0

    async def sell_prize(self, uid: int, prize_id: int, sell_value: int) -> bool:
        """Mark prize as sold, credit balance."""
        async with self._connection() as db:
            cur = await db.execute(
                "UPDATE prizes SET status = 'sold' WHERE id = ? AND user_id = ? AND status = 'active'",
                (prize_id, uid),
            )
            if cur.rowcount == 0:
                await db.commit()
                return False
            await db.execute(
                "UPDATE users SET balance = balance + ?, updated_at = ? WHERE user_id = ?",
                (sell_value, utc_now_iso(), uid),
            )
            await db.commit()
            return True

    async def withdraw_prize(self, uid: int, prize_id: int) -> bool:
        """Mark prize as 'withdrawing'."""
        async with self._connection() as db:
            cur = await db.execute(
                "UPDATE prizes SET status = 'withdrawing' WHERE id = ? AND user_id = ? AND status = 'active'",
                (prize_id, uid),
            )
            await db.commit()
            return cur.rowcount > 0

    async def is_banned(self, uid: int) -> bool:
        user = await self.get_user(uid)
        return bool(user["is_banned"]) if user else False

    async def set_ban(self, uid: int, state: bool) -> None:
        async with self._connection() as db:
            await db.execute(
                "UPDATE users SET is_banned = ?, updated_at = ? WHERE user_id = ?",
                (int(state), utc_now_iso(), uid),
            )
            await db.commit()

    async def has_used_free(self, uid: int) -> bool:
        user = await self.get_user(uid)
        return bool(user["free_used"]) if user else False

    async def mark_free_used(self, uid: int) -> None:
        async with self._connection() as db:
            await db.execute(
                "UPDATE users SET free_used = 1, updated_at = ? WHERE user_id = ?",
                (utc_now_iso(), uid),
            )
            await db.commit()

    async def record_spin(
        self,
        uid: int,
        prize: Dict[str, Any],
        *,
        is_demo: bool = False,
        is_free: bool = False,
        stars: int = 0,
        charge_id: str = "",
    ) -> int:
        """Returns inserted prize ID (0 if miss)."""
        won = prize["type"] != "nothing"
        prize_id = 0
        async with self._connection() as db:
            await db.execute(
                """
                UPDATE users
                SET spins = spins + 1,
                    wins = wins + ?,
                    stars_spent = stars_spent + ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (1 if won else 0, stars, utc_now_iso(), uid),
            )

            if won:
                cur = await db.execute(
                    """
                    INSERT INTO prizes (user_id, prize_key, prize_name, rarity, is_demo, is_free, won_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        uid,
                        prize["key"],
                        prize["name"],
                        prize["rarity"],
                        int(is_demo),
                        int(is_free),
                        utc_now_iso(),
                    ),
                )
                prize_id = cur.lastrowid or 0

            if charge_id:
                await db.execute(
                    """
                    INSERT INTO payments (user_id, charge_id, amount, paid_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(charge_id) DO NOTHING
                    """,
                    (uid, charge_id, stars, utc_now_iso()),
                )

            await db.commit()
        return prize_id

    async def get_prizes(self, uid: int, limit: int = 20) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            async with db.execute(
                """
                SELECT id, prize_key, prize_name, rarity, is_demo, is_free, won_at,
                       COALESCE(status, 'active') AS status
                FROM prizes
                WHERE user_id = ? AND COALESCE(status, 'active') IN ('active', 'withdrawing')
                ORDER BY won_at DESC
                LIMIT ?
                """,
                (uid, limit),
            ) as cur:
                rows = await cur.fetchall()
                return [
                    {
                        "id": row["id"],
                        "key": row["prize_key"],
                        "name": row["prize_name"],
                        "rarity": row["rarity"],
                        "demo": bool(row["is_demo"]),
                        "free": bool(row["is_free"]),
                        "date": row["won_at"],
                        "status": row["status"],
                    }
                    for row in rows
                ]

    async def get_global_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            async with db.execute(
                """
                SELECT p.*, u.first_name, u.username, u.photo_url
                FROM prizes p
                JOIN users u ON u.user_id = p.user_id
                WHERE p.is_demo = 0
                ORDER BY p.won_at DESC
                LIMIT ?
                """,
                (limit,),
            ) as cur:
                return [dict(row) for row in await cur.fetchall()]

    async def get_payment(self, charge_id: str) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            async with db.execute("SELECT * FROM payments WHERE charge_id = ?", (charge_id,)) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def mark_refunded(self, charge_id: str) -> bool:
        async with self._connection() as db:
            cur = await db.execute(
                "UPDATE payments SET refunded = 1 WHERE charge_id = ? AND refunded = 0",
                (charge_id,),
            )
            await db.commit()
            return cur.rowcount > 0

    async def total_stars(self) -> int:
        async with self._connection() as db:
            async with db.execute(
                "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE refunded = 0"
            ) as cur:
                row = await cur.fetchone()
                return int(row["total"]) if row else 0

    async def total_users(self) -> int:
        async with self._connection() as db:
            async with db.execute("SELECT COUNT(*) AS total FROM users") as cur:
                row = await cur.fetchone()
                return int(row["total"]) if row else 0

    async def total_spins(self) -> int:
        async with self._connection() as db:
            async with db.execute("SELECT COALESCE(SUM(spins), 0) AS total FROM users") as cur:
                row = await cur.fetchone()
                return int(row["total"]) if row else 0

    async def wins_today(self) -> int:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        async with self._connection() as db:
            async with db.execute(
                """
                SELECT COUNT(*) AS total
                FROM prizes
                WHERE won_at LIKE ? AND is_demo = 0
                """,
                (f"{today}%",),
            ) as cur:
                row = await cur.fetchone()
                return int(row["total"]) if row else 0

    async def leaderboard(self, limit: int = 10) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            async with db.execute(
                """
                SELECT user_id, username, first_name, photo_url, spins, wins, stars_spent
                FROM users
                WHERE is_banned = 0
                ORDER BY wins DESC, spins DESC, updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ) as cur:
                return [dict(row) for row in await cur.fetchall()]

    async def get_users_list(self, limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            async with db.execute(
                """
                SELECT user_id, username, first_name, spins, wins, stars_spent, is_banned
                FROM users
                ORDER BY joined_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ) as cur:
                return [dict(row) for row in await cur.fetchall()]

    async def recent_payments(self, limit: int = 8) -> List[Dict[str, Any]]:
        async with self._connection() as db:
            async with db.execute(
                """
                SELECT p.*, u.first_name, u.username
                FROM payments p
                LEFT JOIN users u ON u.user_id = p.user_id
                ORDER BY p.paid_at DESC
                LIMIT ?
                """,
                (limit,),
            ) as cur:
                return [dict(row) for row in await cur.fetchall()]

    async def all_user_ids(self) -> List[int]:
        async with self._connection() as db:
            async with db.execute("SELECT user_id FROM users WHERE is_banned = 0") as cur:
                rows = await cur.fetchall()
                return [int(row["user_id"]) for row in rows]

    async def set_spin_result_by_uid(self, uid: int, result: Dict[str, Any]) -> None:
        async with self._connection() as db:
            await db.execute(
                """
                INSERT INTO pending_spins (uid, result, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(uid) DO UPDATE SET
                    result = excluded.result,
                    created_at = excluded.created_at
                """,
                (uid, json.dumps(result, ensure_ascii=False), utc_now_iso()),
            )
            await db.commit()

    async def get_spin_result(self, uid: int) -> Optional[Dict[str, Any]]:
        async with self._connection() as db:
            async with db.execute("SELECT result FROM pending_spins WHERE uid = ?", (uid,)) as cur:
                row = await cur.fetchone()
                if not row:
                    return None

            await db.execute("DELETE FROM pending_spins WHERE uid = ?", (uid,))
            await db.commit()
            return json.loads(row["result"])

    async def get_dashboard_stats(self) -> Dict[str, int]:
        total_users = await self.total_users()
        total_spins = await self.total_spins()
        total_stars = await self.total_stars()
        wins_today = await self.wins_today()
        return {
            "users": total_users,
            "spins": total_spins,
            "stars": total_stars,
            "wins_today": wins_today,
        }
