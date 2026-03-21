import aiosqlite
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any
from pathlib import Path

log = logging.getLogger("swagging_gift.db")

class Database:
    def __init__(self, path: Path):
        self.path = str(path)

    async def setup(self) -> None:
        async with aiosqlite.connect(self.path) as db:
            await db.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id     INTEGER PRIMARY KEY,
                    username    TEXT    DEFAULT '',
                    first_name  TEXT    DEFAULT '',
                    spins       INTEGER DEFAULT 0,
                    wins        INTEGER DEFAULT 0,
                    stars_spent INTEGER DEFAULT 0,
                    is_banned   INTEGER DEFAULT 0,
                    free_used   INTEGER DEFAULT 0,
                    joined_at   TEXT    NOT NULL
                );
                CREATE TABLE IF NOT EXISTS prizes (
                    id         INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id    INTEGER NOT NULL,
                    prize_key  TEXT    NOT NULL,
                    prize_name TEXT    NOT NULL,
                    rarity     TEXT    NOT NULL,
                    is_demo    INTEGER DEFAULT 0,
                    is_free    INTEGER DEFAULT 0,
                    won_at     TEXT    NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(user_id)
                );
                CREATE TABLE IF NOT EXISTS payments (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id   INTEGER NOT NULL,
                    charge_id TEXT    NOT NULL UNIQUE,
                    amount    INTEGER NOT NULL,
                    refunded  INTEGER DEFAULT 0,
                    paid_at   TEXT    NOT NULL
                );
                CREATE TABLE IF NOT EXISTS pending_spins (
                    uid INTEGER, 
                    charge_id TEXT UNIQUE, 
                    result TEXT, 
                    created_at TEXT
                );
            """)
            await db.commit()
            
            # Migrations
            for table, col, dfn in [
                ("users", "stars_spent", "INTEGER DEFAULT 0"),
                ("users", "is_banned",   "INTEGER DEFAULT 0"),
                ("users", "free_used",   "INTEGER DEFAULT 0"),
                ("prizes", "is_free",    "INTEGER DEFAULT 0"),
            ]:
                try:
                    await db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {dfn}")
                    await db.commit()
                except Exception:
                    pass
        log.info(f"Database ready: {self.path}")

    async def ensure_user(self, uid: int, username: str, first_name: str) -> None:
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                "INSERT OR IGNORE INTO users (user_id,username,first_name,joined_at) VALUES (?,?,?,?)",
                (uid, username or "", first_name or "", datetime.now().isoformat()),
            )
            await db.commit()

    async def get_user(self, uid: int) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM users WHERE user_id=?", (uid,)) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def is_banned(self, uid: int) -> bool:
        user = await self.get_user(uid)
        return bool(user.get("is_banned", 0)) if user else False

    async def set_ban(self, uid: int, state: bool) -> None:
        async with aiosqlite.connect(self.path) as db:
            await db.execute("UPDATE users SET is_banned=? WHERE user_id=?", (int(state), uid))
            await db.commit()

    async def has_used_free(self, uid: int) -> bool:
        user = await self.get_user(uid)
        return bool(user.get("free_used", 0)) if user else False

    async def get_global_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT p.*, u.first_name, u.username FROM prizes p "
                "JOIN users u ON p.user_id = u.user_id "
                "WHERE p.is_demo = 0 ORDER BY p.won_at DESC LIMIT ?", (limit,)
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    # Existing methods follow...

    async def record_spin(self, uid: int, prize: Dict[str, Any],
                          is_demo: bool = False, is_free: bool = False,
                          stars: int = 0, charge_id: str = "") -> None:
        won = prize["type"] != "nothing"
        async with aiosqlite.connect(self.path) as db:
            await db.execute(
                "UPDATE users SET spins=spins+1, stars_spent=stars_spent+? WHERE user_id=?",
                (stars, uid),
            )
            if won:
                await db.execute("UPDATE users SET wins=wins+1 WHERE user_id=?", (uid,))
                await db.execute(
                    "INSERT INTO prizes (user_id,prize_key,prize_name,rarity,is_demo,is_free,won_at) "
                    "VALUES (?,?,?,?,?,?,?)",
                    (uid, prize["key"], prize["name"], prize["rarity"],
                     int(is_demo), int(is_free), datetime.now().isoformat()),
                )
            if charge_id:
                await db.execute(
                    "INSERT OR IGNORE INTO payments (user_id,charge_id,amount,paid_at) VALUES (?,?,?,?)",
                    (uid, charge_id, stars, datetime.now().isoformat()),
                )
            await db.commit()

    async def get_prizes(self, uid: int, limit: int = 20) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.path) as db:
            async with db.execute(
                "SELECT prize_name,rarity,is_demo,is_free,won_at FROM prizes "
                "WHERE user_id=? ORDER BY won_at DESC LIMIT ?", (uid, limit)
            ) as cur:
                return [
                    {"name": r[0], "rarity": r[1],
                     "demo": bool(r[2]), "free": bool(r[3]),
                     "date": r[4][5:16].replace("T", " ")}
                    for r in await cur.fetchall()
                ]

    async def get_payment(self, charge_id: str) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM payments WHERE charge_id=?", (charge_id,)) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def mark_refunded(self, charge_id: str) -> bool:
        async with aiosqlite.connect(self.path) as db:
            cur = await db.execute(
                "UPDATE payments SET refunded=1 WHERE charge_id=? AND refunded=0", (charge_id,)
            )
            await db.commit()
            return cur.rowcount > 0

    async def total_stars(self) -> int:
        async with aiosqlite.connect(self.path) as db:
            async with db.execute(
                "SELECT COALESCE(SUM(amount),0) FROM payments WHERE refunded=0"
            ) as cur:
                row = await cur.fetchone()
                return int(row[0]) if row else 0

    async def total_users(self) -> int:
        async with aiosqlite.connect(self.path) as db:
            async with db.execute("SELECT COUNT(*) FROM users") as cur:
                row = await cur.fetchone()
                return int(row[0]) if row else 0

    async def total_spins(self) -> int:
        async with aiosqlite.connect(self.path) as db:
            async with db.execute("SELECT COALESCE(SUM(spins),0) FROM users") as cur:
                row = await cur.fetchone()
                return int(row[0]) if row else 0

    async def wins_today(self) -> int:
        today = datetime.now().strftime("%Y-%m-%d")
        async with aiosqlite.connect(self.path) as db:
            async with db.execute(
                "SELECT COUNT(*) FROM prizes WHERE won_at LIKE ? AND is_demo=0", (f"{today}%",)
            ) as cur:
                row = await cur.fetchone()
                return int(row[0]) if row else 0

    async def leaderboard(self, limit: int = 10) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM users WHERE is_banned=0 ORDER BY wins DESC LIMIT ?", (limit,)
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def get_users_list(self, limit: int = 10, offset: int = 0) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT user_id,username,first_name,spins,wins,stars_spent,is_banned "
                "FROM users ORDER BY joined_at DESC LIMIT ? OFFSET ?", (limit, offset)
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def recent_payments(self, limit: int = 8) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT p.*, u.first_name, u.username FROM payments p "
                "LEFT JOIN users u ON p.user_id=u.user_id "
                "ORDER BY p.paid_at DESC LIMIT ?", (limit,)
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def all_user_ids(self) -> List[int]:
        async with aiosqlite.connect(self.path) as db:
            async with db.execute("SELECT user_id FROM users WHERE is_banned=0") as cur:
                return [r[0] for r in await cur.fetchall()]

    # Pending Spins logic
    async def set_spin_result_by_uid(self, uid: int, result: Dict[str, Any]) -> None:
        async with aiosqlite.connect(self.path) as db:
            # We insert a new pending result for the user
            await db.execute(
                "INSERT INTO pending_spins (uid, result, created_at) VALUES (?,?,?)",
                (uid, json.dumps(result, ensure_ascii=False), datetime.now().isoformat())
            )
            await db.commit()

    async def get_spin_result(self, uid: int) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.path) as db:
            async with db.execute(
                "SELECT result, created_at FROM pending_spins WHERE uid=? AND result IS NOT NULL "
                "ORDER BY created_at DESC LIMIT 1", (uid,)
            ) as cur:
                row = await cur.fetchone()
                if row and row[0]:
                    # Delete the one we just retrieved to avoid double-processing
                    await db.execute(
                        "DELETE FROM pending_spins WHERE uid=?", (uid,)
                    )
                    await db.commit()
                    return json.loads(row[0])
        return None
