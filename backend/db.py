"""SQLite persistence for chat messages and 4-digit join codes."""

import os
import random
import sqlite3
from contextlib import contextmanager
from typing import Iterator, Optional

DB_PATH = os.environ.get(
    "CHAT_DB_PATH", os.path.join(os.path.dirname(__file__), "chat.db")
)


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
            CREATE TABLE IF NOT EXISTS trip_memberships (
                trip_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                name TEXT,
                destination TEXT,
                joined_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (trip_id, user_id)
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trip_memberships_user ON trip_memberships(user_id)"
        )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trip_media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id TEXT NOT NULL,
                uri TEXT NOT NULL,
                type TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trip_media_trip ON trip_media(trip_id)"
        )


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


def add_trip_membership(
    trip_id: str,
    user_id: str,
    name: Optional[str] = None,
    destination: Optional[str] = None,
) -> None:
    """Add a user to a trip (idempotent)."""
    with get_db() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO trip_memberships (trip_id, user_id, name, destination)
            VALUES (?, ?, ?, ?)
            """,
            (trip_id, user_id, name, destination),
        )


def get_user_trips(user_id: str) -> list[dict]:
    """Get all trips for a user."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT trip_id, name, destination, joined_at
            FROM trip_memberships
            WHERE user_id = ?
            ORDER BY joined_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "trip_id": r["trip_id"],
            "name": r["name"] or "Joined Trip",
            "destination": r["destination"] or "TBD",
            "joined_at": r["joined_at"],
        }
        for r in rows
    ]


def add_trip_media(trip_id: str, uri: str, media_type: str) -> dict:
    """Add one media item for a trip. type is 'image' or 'video'."""
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO trip_media (trip_id, uri, type)
            VALUES (?, ?, ?)
            """,
            (trip_id, uri, media_type),
        )
        row_id = cur.lastrowid
        row = conn.execute(
            "SELECT id, trip_id, uri, type, created_at FROM trip_media WHERE id = ?",
            (row_id,),
        ).fetchone()
    return {
        "id": str(row["id"]),
        "trip_id": row["trip_id"],
        "uri": row["uri"],
        "type": row["type"],
        "created_at": row["created_at"],
    }


def get_trip_media(trip_id: str) -> list[dict]:
    """Return all media for a trip, oldest first."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, trip_id, uri, type, created_at
            FROM trip_media
            WHERE trip_id = ?
            ORDER BY created_at ASC
            """,
            (trip_id,),
        ).fetchall()
    return [
        {
            "id": str(r["id"]),
            "trip_id": r["trip_id"],
            "uri": r["uri"],
            "type": r["type"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]
