"""SQLite persistence for chat messages and 4-digit join codes."""
import os
import random
import sqlite3
from contextlib import contextmanager
from typing import Iterator, Optional

DB_PATH = os.environ.get("CHAT_DB_PATH", os.path.join(os.path.dirname(__file__), "chat.db"))


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id TEXT NOT NULL,
                user_id TEXT,
                user_name TEXT NOT NULL,
                content TEXT NOT NULL,
                is_ai INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_trip ON messages(trip_id)"
        )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trip_codes (
                code TEXT PRIMARY KEY,
                trip_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trip_codes_trip_id ON trip_codes(trip_id)"
        )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trip_itinerary (
                trip_id TEXT PRIMARY KEY,
                itinerary_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)


def _random_4_digit() -> str:
    return str(random.randint(1000, 9999))


def register_code(trip_id: str) -> str:
    """Get or create a 4-digit code for this trip. Returns the code."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT code FROM trip_codes WHERE trip_id = ?", (trip_id,)
        ).fetchone()
        if row:
            return row["code"]
        code = _random_4_digit()
        while True:
            existing = conn.execute(
                "SELECT 1 FROM trip_codes WHERE code = ?", (code,)
            ).fetchone()
            if not existing:
                break
            code = _random_4_digit()
        conn.execute(
            "INSERT INTO trip_codes (code, trip_id) VALUES (?, ?)",
            (code, trip_id),
        )
    return code


def resolve_code(code: str) -> Optional[str]:
    """Resolve a 4-digit code to trip_id, or None if invalid."""
    normalized = (code or "").strip()
    if len(normalized) != 4 or not normalized.isdigit():
        return None
    with get_db() as conn:
        row = conn.execute(
            "SELECT trip_id FROM trip_codes WHERE code = ?", (normalized,)
        ).fetchone()
    return row["trip_id"] if row else None


def add_message(
    trip_id: str,
    content: str,
    is_ai: bool,
    user_id: Optional[str] = None,
    user_name: str = "Unknown",
) -> dict:
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO messages (trip_id, user_id, user_name, content, is_ai)
            VALUES (?, ?, ?, ?, ?)
            """,
            (trip_id, user_id or "", user_name, content, 1 if is_ai else 0),
        )
        row_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, trip_id, user_id, user_name, content, is_ai, created_at FROM messages WHERE id = ?",
            (row_id,),
        ).fetchone()
    return {
        "id": str(row["id"]),
        "trip_id": row["trip_id"],
        "user_id": row["user_id"] or None,
        "user_name": row["user_name"],
        "content": row["content"],
        "is_ai": bool(row["is_ai"]),
        "created_at": row["created_at"],
    }


def get_itinerary(trip_id: str) -> Optional[str]:
    """Return stored itinerary JSON for a trip, or None."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT itinerary_json FROM trip_itinerary WHERE trip_id = ?",
            (trip_id,),
        ).fetchone()
    return row["itinerary_json"] if row else None


def set_itinerary(trip_id: str, itinerary_json: str) -> None:
    """Store itinerary JSON for a trip."""
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO trip_itinerary (trip_id, itinerary_json)
            VALUES (?, ?)
            ON CONFLICT(trip_id) DO UPDATE SET
                itinerary_json = excluded.itinerary_json,
                updated_at = datetime('now')
            """,
            (trip_id, itinerary_json),
        )


def get_messages(trip_id: str, limit: int = 200) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, trip_id, user_id, user_name, content, is_ai, created_at
            FROM messages
            WHERE trip_id = ?
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (trip_id, limit),
        ).fetchall()
    return [
        {
            "id": str(r["id"]),
            "trip_id": r["trip_id"],
            "user_id": r["user_id"] or None,
            "user_name": r["user_name"],
            "content": r["content"],
            "is_ai": bool(r["is_ai"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]
