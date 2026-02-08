"""SQLite persistence for trips, members, chat, join codes, users, trip images, and expenses."""

import os
import random
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Iterator, Optional


def _parse_created_at(created_at: Optional[str]) -> int:
    """Convert SQLite datetime or ISO string to ms since epoch. Returns 0 if invalid."""
    if not created_at:
        return 0
    try:
        if "T" in created_at:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        else:
            dt = datetime.strptime(created_at[:19], "%Y-%m-%d %H:%M:%S")
        return int(dt.timestamp() * 1000)
    except (ValueError, TypeError):
        return 0


DB_PATH = os.environ.get(
    "DB_PATH",
    os.environ.get(
        "CHAT_DB_PATH", os.path.join(os.path.dirname(__file__), "goingplaces.db")
    ),
)


@contextmanager
def get_db() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _migrate_trips_columns(conn: sqlite3.Connection) -> None:
    """Add trip detail columns if missing (for existing DBs)."""
    cur = conn.execute("PRAGMA table_info(trips)")
    existing = {row[1] for row in cur.fetchall()}
    for col, spec in [
        ("name", "TEXT"),
        ("destination", "TEXT"),
        ("status", "TEXT DEFAULT 'planning'"),
        ("created_by", "TEXT"),
        ("created_at", "TEXT DEFAULT (datetime('now'))"),
    ]:
        if col not in existing:
            conn.execute(f"ALTER TABLE trips ADD COLUMN {col} {spec}")


def init_db() -> None:
    with get_db() as conn:
        # --- Core: trips (id + details; details added by migration for existing DBs) ---
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trips (
                id TEXT PRIMARY KEY,
                name TEXT,
                destination TEXT,
                status TEXT DEFAULT 'planning',
                created_by TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        _migrate_trips_columns(conn)

        # --- Trip members: who is in each trip ---
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trip_members (
                trip_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                joined_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (trip_id, user_id),
                FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members(user_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members(trip_id)"
        )

        # --- Users (referenced by trip_members, messages, trip_images, expenses) ---
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                avatar_url TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")

        # --- Messages: one chat per trip; user_id can reference users.id ---
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id TEXT NOT NULL,
                user_id TEXT,
                user_name TEXT NOT NULL,
                content TEXT NOT NULL,
                is_ai INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_trip ON messages(trip_id)"
        )

        # --- Trip codes ---
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

        # --- Trip itinerary ---
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trip_itinerary (
                trip_id TEXT PRIMARY KEY,
                itinerary_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)

        # --- Trip images (links to trips and users; store URLs, not binary) ---
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trip_images (
                id TEXT PRIMARY KEY,
                trip_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                image_url TEXT NOT NULL,
                caption TEXT,
                location TEXT,
                taken_at TEXT,
                uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trip_images_trip ON trip_images(trip_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trip_images_user ON trip_images(user_id)"
        )

        # --- Expenses ---
        conn.execute("""
            CREATE TABLE IF NOT EXISTS expenses (
                id TEXT PRIMARY KEY,
                trip_id TEXT NOT NULL,
                paid_by_user_id TEXT NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT DEFAULT 'USD',
                category TEXT,
                receipt_image_url TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                expense_date TEXT NOT NULL,
                FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
                FOREIGN KEY (paid_by_user_id) REFERENCES users(id)
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by_user_id)"
        )

        # --- Expense splits (who owes what per expense) ---
        conn.execute("""
            CREATE TABLE IF NOT EXISTS expense_splits (
                id TEXT PRIMARY KEY,
                expense_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                amount REAL NOT NULL,
                is_settled INTEGER NOT NULL DEFAULT 0,
                settled_at TEXT,
                FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(expense_id, user_id)
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_expense_splits_expense ON expense_splits(expense_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_expense_splits_user ON expense_splits(user_id)"
        )

        # --- Settlements (direct payments between users) ---
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settlements (
                id TEXT PRIMARY KEY,
                trip_id TEXT NOT NULL,
                from_user_id TEXT NOT NULL,
                to_user_id TEXT NOT NULL,
                amount REAL NOT NULL,
                settled_at TEXT NOT NULL DEFAULT (datetime('now')),
                note TEXT,
                FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
                FOREIGN KEY (from_user_id) REFERENCES users(id),
                FOREIGN KEY (to_user_id) REFERENCES users(id)
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements(trip_id)"
        )


def _random_4_digit() -> str:
    return str(random.randint(1000, 9999))


def _ensure_trip(conn: sqlite3.Connection, trip_id: str) -> None:
    """Ensure a trip row exists (for FK integrity). Idempotent."""
    conn.execute("INSERT OR IGNORE INTO trips (id) VALUES (?)", (trip_id,))


def register_code(trip_id: str) -> str:
    """Get or create a 4-digit code for this trip. Returns the code."""
    with get_db() as conn:
        _ensure_trip(conn, trip_id)
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


def add_trip_member(conn: sqlite3.Connection, trip_id: str, user_id: str) -> None:
    """Add a user to a trip. Idempotent."""
    conn.execute(
        "INSERT OR IGNORE INTO trip_members (trip_id, user_id) VALUES (?, ?)",
        (trip_id, user_id),
    )


def get_trip(trip_id: str) -> Optional[dict[str, Any]]:
    """Return trip row as dict (createdAt in ms), or None."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name, destination, status, created_by, created_at FROM trips WHERE id = ?",
            (trip_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "name": (row["name"] or "").strip() or "Trip",
        "destination": (row["destination"] or "").strip() or "TBD",
        "status": (row["status"] or "planning").strip(),
        "createdBy": row["created_by"] or "",
        "createdAt": _parse_created_at(row["created_at"]),
    }


def create_trip(
    name: str,
    created_by_user_id: str,
    *,
    destination: str = "TBD",
    status: str = "planning",
) -> dict[str, Any]:
    """Create a trip, add creator as member, register code. Returns trip dict with code."""
    trip_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO trips (id, name, destination, status, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            """,
            (
                trip_id,
                (name or "Trip").strip(),
                (destination or "TBD").strip(),
                status or "planning",
                created_by_user_id,
            ),
        )
        add_trip_member(conn, trip_id, created_by_user_id)
        code = _register_code_conn(conn, trip_id)
    trip = get_trip(trip_id)
    assert trip is not None
    trip["code"] = code
    return trip


def _register_code_conn(conn: sqlite3.Connection, trip_id: str) -> str:
    """Get or create 4-digit code for trip (caller holds conn)."""
    row = conn.execute(
        "SELECT code FROM trip_codes WHERE trip_id = ?", (trip_id,)
    ).fetchone()
    if row:
        return row["code"]
    code = _random_4_digit()
    while conn.execute("SELECT 1 FROM trip_codes WHERE code = ?", (code,)).fetchone():
        code = _random_4_digit()
    conn.execute(
        "INSERT INTO trip_codes (code, trip_id) VALUES (?, ?)", (code, trip_id)
    )
    return code


def get_trip_members(trip_id: str) -> list[dict[str, Any]]:
    """Return list of { user_id } for trip (for future expansion with names)."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT user_id FROM trip_members WHERE trip_id = ? ORDER BY joined_at ASC",
            (trip_id,),
        ).fetchall()
    return [{"user_id": r["user_id"]} for r in rows]


def get_trips_for_user(user_id: str) -> list[dict[str, Any]]:
    """Return all trips the user is a member of, with trip details."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT t.id, t.name, t.destination, t.status, t.created_by, t.created_at
            FROM trips t
            INNER JOIN trip_members m ON m.trip_id = t.id
            WHERE m.user_id = ?
            ORDER BY t.created_at DESC
            """,
            (user_id,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "name": (r["name"] or "").strip() or "Trip",
            "destination": (r["destination"] or "").strip() or "TBD",
            "status": (r["status"] or "planning").strip(),
            "createdBy": r["created_by"] or "",
            "createdAt": _parse_created_at(r["created_at"]),
        }
        for r in rows
    ]


def join_trip_by_code(code: str, user_id: str) -> Optional[dict[str, Any]]:
    """Resolve code, add user to trip_members, return trip or None."""
    trip_id = resolve_code(code)
    if not trip_id:
        return None
    with get_db() as conn:
        _ensure_trip(conn, trip_id)
        add_trip_member(conn, trip_id, user_id)
    return get_trip(trip_id)


def add_message(
    trip_id: str,
    content: str,
    is_ai: bool,
    user_id: Optional[str] = None,
    user_name: str = "Unknown",
) -> dict:
    with get_db() as conn:
        _ensure_trip(conn, trip_id)
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


# --- Users ---


def create_user(
    email: str,
    first_name: str,
    last_name: str,
    *,
    username: Optional[str] = None,
    avatar_url: Optional[str] = None,
    user_id: Optional[str] = None,
) -> dict[str, Any]:
    """Create a user. Returns user dict. Uses user_id if provided, else generates UUID."""
    uid = user_id or str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO users (id, email, username, first_name, last_name, avatar_url)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (uid, email, username, first_name, last_name, avatar_url),
        )
        row = conn.execute(
            "SELECT id, email, username, first_name, last_name, avatar_url, created_at, updated_at FROM users WHERE id = ?",
            (uid,),
        ).fetchone()
    return _row_to_user(row)


def get_user(user_id: str) -> Optional[dict[str, Any]]:
    """Get user by id."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, username, first_name, last_name, avatar_url, created_at, updated_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return _row_to_user(row) if row else None


def _row_to_user(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"],
        "email": r["email"],
        "username": r["username"],
        "first_name": r["first_name"],
        "last_name": r["last_name"],
        "avatar_url": r["avatar_url"],
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
    }


# --- Trip images ---


def add_trip_image(
    trip_id: str,
    user_id: str,
    image_url: str,
    *,
    caption: Optional[str] = None,
    location: Optional[str] = None,
    taken_at: Optional[str] = None,
) -> dict[str, Any]:
    """Add a trip image. Ensures trip exists. User must exist (FK)."""
    img_id = str(uuid.uuid4())
    with get_db() as conn:
        _ensure_trip(conn, trip_id)
        conn.execute(
            """
            INSERT INTO trip_images (id, trip_id, user_id, image_url, caption, location, taken_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (img_id, trip_id, user_id, image_url, caption, location, taken_at),
        )
        row = conn.execute(
            "SELECT ti.*, u.first_name, u.last_name FROM trip_images ti JOIN users u ON ti.user_id = u.id WHERE ti.id = ?",
            (img_id,),
        ).fetchone()
    return _row_to_trip_image(row)


def get_trip_images(trip_id: str) -> list[dict[str, Any]]:
    """Get all trip images with uploader names."""
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT ti.*, u.first_name, u.last_name
            FROM trip_images ti
            JOIN users u ON ti.user_id = u.id
            WHERE ti.trip_id = ?
            ORDER BY ti.uploaded_at DESC
            """,
            (trip_id,),
        ).fetchall()
    return [_row_to_trip_image(r) for r in rows]


def _row_to_trip_image(r: sqlite3.Row) -> dict[str, Any]:
    d = dict(r)
    return {
        "id": d["id"],
        "trip_id": d["trip_id"],
        "user_id": d["user_id"],
        "image_url": d["image_url"],
        "caption": d["caption"],
        "location": d["location"],
        "taken_at": d["taken_at"],
        "uploaded_at": d["uploaded_at"],
        "first_name": d.get("first_name"),
        "last_name": d.get("last_name"),
    }


# --- Expenses ---


def add_expense(
    trip_id: str,
    paid_by_user_id: str,
    description: str,
    amount: float,
    expense_date: str,
    *,
    currency: str = "USD",
    category: Optional[str] = None,
    receipt_image_url: Optional[str] = None,
    splits: Optional[list[tuple[str, float]]] = None,
) -> dict[str, Any]:
    """
    Add an expense and optionally expense_splits.
    splits: [(user_id, amount), ...] – if None, no splits are created.
    """
    exp_id = str(uuid.uuid4())
    with get_db() as conn:
        _ensure_trip(conn, trip_id)
        conn.execute(
            """
            INSERT INTO expenses (id, trip_id, paid_by_user_id, description, amount, currency, category, receipt_image_url, expense_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                exp_id,
                trip_id,
                paid_by_user_id,
                description,
                amount,
                currency,
                category,
                receipt_image_url,
                expense_date,
            ),
        )
        if splits:
            for user_id, amt in splits:
                conn.execute(
                    "INSERT INTO expense_splits (id, expense_id, user_id, amount) VALUES (?, ?, ?, ?)",
                    (str(uuid.uuid4()), exp_id, user_id, amt),
                )
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (exp_id,)).fetchone()
    return _row_to_expense(row)


def get_expenses(trip_id: str) -> list[dict[str, Any]]:
    """Get all expenses for a trip."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM expenses WHERE trip_id = ? ORDER BY expense_date DESC, created_at DESC",
            (trip_id,),
        ).fetchall()
    return [_row_to_expense(r) for r in rows]


def _row_to_expense(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"],
        "trip_id": r["trip_id"],
        "paid_by_user_id": r["paid_by_user_id"],
        "description": r["description"],
        "amount": float(r["amount"]),
        "currency": r["currency"],
        "category": r["category"],
        "receipt_image_url": r["receipt_image_url"],
        "created_at": r["created_at"],
        "expense_date": r["expense_date"],
    }


def settle_expense_split(split_id: str) -> bool:
    """Mark an expense split as settled. Returns True if updated."""
    with get_db() as conn:
        cur = conn.execute(
            "UPDATE expense_splits SET is_settled = 1, settled_at = datetime('now') WHERE id = ? AND is_settled = 0",
            (split_id,),
        )
    return cur.rowcount > 0


def add_settlement(
    trip_id: str,
    from_user_id: str,
    to_user_id: str,
    amount: float,
    note: Optional[str] = None,
) -> dict[str, Any]:
    """Record a direct payment between users."""
    sid = str(uuid.uuid4())
    with get_db() as conn:
        _ensure_trip(conn, trip_id)
        conn.execute(
            "INSERT INTO settlements (id, trip_id, from_user_id, to_user_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)",
            (sid, trip_id, from_user_id, to_user_id, amount, note),
        )
        row = conn.execute("SELECT * FROM settlements WHERE id = ?", (sid,)).fetchone()
    return {
        "id": row["id"],
        "trip_id": row["trip_id"],
        "from_user_id": row["from_user_id"],
        "to_user_id": row["to_user_id"],
        "amount": float(row["amount"]),
        "settled_at": row["settled_at"],
        "note": row["note"],
    }


def get_user_balance(trip_id: str, user_id: str) -> dict[str, float]:
    """
    Get what user owes (from unsettled expense_splits) and what user paid (from expenses).
    Returns {"owes": float, "paid": float}.
    """
    with get_db() as conn:
        owes_row = conn.execute(
            """
            SELECT COALESCE(SUM(es.amount), 0) as owes
            FROM expense_splits es
            JOIN expenses e ON es.expense_id = e.id
            WHERE es.user_id = ? AND e.trip_id = ? AND es.is_settled = 0
            """,
            (user_id, trip_id),
        ).fetchone()
        paid_row = conn.execute(
            "SELECT COALESCE(SUM(amount), 0) as paid FROM expenses WHERE paid_by_user_id = ? AND trip_id = ?",
            (user_id, trip_id),
        ).fetchone()
    return {
        "owes": float(owes_row["owes"] or 0),
        "paid": float(paid_row["paid"] or 0),
    }
