"""
Custom Python backend for Going Places chat.
- WebSocket rooms per trip_id so multiple devices share the same chat.
- SQLite for message persistence and history.
"""

import json
import logging
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import (
    init_db,
    add_message,
    get_messages,
    register_code,
    resolve_code,
    add_trip_membership,
    get_user_trips,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Going Places Chat API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# trip_id -> set of active WebSocket connections
rooms: dict[str, set[WebSocket]] = {}


def get_room(trip_id: str) -> set[WebSocket]:
    if trip_id not in rooms:
        rooms[trip_id] = set()
    return rooms[trip_id]


@app.on_event("startup")
def startup() -> None:
    init_db()
    logger.info("Chat backend started; DB initialized.")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class RegisterCodeBody(BaseModel):
    trip_id: str


@app.post("/register-code")
def api_register_code(body: RegisterCodeBody) -> dict[str, str]:
    """Create or return existing 4-digit code for a trip. Same trip always gets same code."""
    code = register_code(body.trip_id)
    return {"code": code}


@app.get("/resolve-code")
def api_resolve_code(
    code: str = Query(..., min_length=4, max_length=4),
) -> dict[str, Any]:
    """Resolve 4-digit code to trip_id. Returns 404 if invalid."""
    trip_id = resolve_code(code)
    if not trip_id:
        raise HTTPException(status_code=404, detail="Invalid or expired code")
    return {"trip_id": trip_id}


@app.get("/trips/{trip_id}/messages")
def list_messages(
    trip_id: str,
    limit: int = Query(200, ge=1, le=500),
) -> list[dict[str, Any]]:
    """REST fallback: fetch message history for a trip."""
    return get_messages(trip_id, limit=limit)


class JoinTripBody(BaseModel):
    trip_id: str
    user_id: str
    name: str | None = None
    destination: str | None = None


@app.post("/trips/join")
def api_join_trip(body: JoinTripBody) -> dict[str, str]:
    """Register a user as a member of a trip."""
    add_trip_membership(body.trip_id, body.user_id, body.name, body.destination)
    return {"status": "ok"}


@app.get("/users/{user_id}/trips")
def api_get_user_trips(user_id: str) -> list[dict[str, Any]]:
    """Get all trips for a user."""
    return get_user_trips(user_id)


@app.websocket("/ws/{trip_id}")
async def websocket_chat(
    websocket: WebSocket,
    trip_id: str,
    user_id: str = Query(""),
    user_name: str = Query("You"),
) -> None:
    await websocket.accept()
    room = get_room(trip_id)
    room.add(websocket)
    logger.info("Client joined trip_id=%s (connections=%d)", trip_id, len(room))

    try:
        # Send existing messages so new joiners get history
        history = get_messages(trip_id)
        await websocket.send_json({"type": "history", "messages": history})

        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            content = (msg.get("content") or "").strip()
            if not content:
                continue

            is_ai = bool(msg.get("is_ai", False))
            saved = add_message(
                trip_id=trip_id,
                content=content,
                is_ai=is_ai,
                user_id=user_id or None,
                user_name=user_name or "You",
            )

            # Broadcast to everyone in the room (including sender)
            payload = {"type": "message", "message": saved}
            dead = set()
            for ws in room:
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.add(ws)
            for ws in dead:
                room.discard(ws)

    except WebSocketDisconnect:
        pass
    finally:
        room.discard(websocket)
        if not room:
            del rooms[trip_id]
        logger.info("Client left trip_id=%s (connections=%d)", trip_id, len(room))
