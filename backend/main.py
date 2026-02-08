"""
Custom Python backend for Going Places chat.
- WebSocket rooms per trip_id so multiple devices share the same chat.
- SQLite for message persistence and history.
- When a message contains @gemini, call OpenRouter (openai/gpt-5-nano) with full chat context
  and optionally extract an itinerary for the Plan tab.
"""

import asyncio
import json
import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    Query,
    File,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from db import (
    init_db,
    add_message,
    get_messages,
    get_itinerary,
    set_itinerary,
    register_code,
    resolve_code,
    create_trip as db_create_trip,
    join_trip_by_code,
    get_trips_for_user,
    get_trip as db_get_trip,
    add_trip_media,
    get_trip_media,
    create_user as db_create_user,
)

# Load .env.local from project root so EXPO_PUBLIC_OPENROUTER_API_KEY is available
_load_env_paths = [
    os.path.join(os.path.dirname(__file__), "..", ".env.local"),
    os.path.join(os.path.dirname(__file__), ".env"),
]
for _p in _load_env_paths:
    if os.path.isfile(_p):
        load_dotenv(_p)
        break
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY") or os.environ.get(
    "EXPO_PUBLIC_OPENROUTER_API_KEY"
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

# Setup uploads directory
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

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
    if OPENROUTER_API_KEY:
        logger.info("OpenRouter: API key loaded (length=%d)", len(OPENROUTER_API_KEY))
    else:
        logger.warning(
            "OpenRouter: no API key (set OPENROUTER_API_KEY or EXPO_PUBLIC_OPENROUTER_API_KEY in .env.local)"
        )


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


class CreateTripBody(BaseModel):
    name: str
    created_by: str
    destination: str = "TBD"
    status: str = "planning"


@app.post("/trips")
def api_create_trip(body: CreateTripBody) -> dict[str, Any]:
    """Create a trip, add creator as member, return trip with code."""
    trip = db_create_trip(
        name=body.name,
        created_by_user_id=body.created_by,
        destination=body.destination or "TBD",
        status=body.status or "planning",
    )
    return trip


class JoinTripBody(BaseModel):
    code: str
    user_id: str


@app.post("/trips/join")
def api_join_trip(body: JoinTripBody) -> dict[str, Any]:
    """Join a trip by 4-digit code; record user as member. Returns trip or 404."""
    code = (body.code or "").strip()
    if len(code) != 4 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Invalid code")
    trip = join_trip_by_code(code, body.user_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Invalid or expired code")
    return trip


class CreateUserBody(BaseModel):
    user_id: str
    email: str
    first_name: str
    last_name: str
    username: str = ""
    avatar_url: str = ""


@app.post("/users")
def api_create_user(body: CreateUserBody) -> dict[str, Any]:
    """Create a user account. Returns user object or 400 if user already exists."""
    try:
        user = db_create_user(
            email=body.email,
            first_name=body.first_name,
            last_name=body.last_name,
            username=body.username or None,
            avatar_url=body.avatar_url or None,
            user_id=body.user_id,
        )
        return user
    except Exception as e:
        # Handle duplicate email/username errors
        err_msg = str(e).lower()
        if "unique" in err_msg or "duplicate" in err_msg:
            raise HTTPException(
                status_code=400,
                detail="User with this email or username already exists",
            )
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")


@app.get("/users/{user_id}/trips")
def api_my_trips(user_id: str) -> list[dict[str, Any]]:
    """Return all trips the user is a member of (persisted across refresh)."""
    return get_trips_for_user(user_id)


@app.get("/trips/{trip_id}/messages")
def list_messages(
    trip_id: str,
    limit: int = Query(200, ge=1, le=500),
) -> list[dict[str, Any]]:
    """REST fallback: fetch message history for a trip."""
    return get_messages(trip_id, limit=limit)


class TripMediaItem(BaseModel):
    uri: str
    type: str  # 'image' | 'video'


class TripMediaBody(BaseModel):
    items: list[TripMediaItem]


@app.get("/trips/{trip_id}/media")
def list_trip_media(trip_id: str) -> list[dict[str, Any]]:
    """List all media (photos/videos) for a trip. Persisted in DB."""
    return get_trip_media(trip_id)


@app.post("/trips/{trip_id}/media/upload")
async def upload_trip_media(
    trip_id: str,
    files: list[UploadFile] = File(...),
) -> list[dict[str, Any]]:
    """Upload media files for a trip. Returns list of media records with URLs."""
    added = []
    for file in files:
        # Generate unique filename
        file_ext = Path(file.filename or "image.jpg").suffix
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = UPLOADS_DIR / unique_filename

        # Save file
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Determine media type
        content_type = file.content_type or ""
        media_type = "video" if "video" in content_type else "image"

        # Store in DB with URL path
        uri = f"/uploads/{unique_filename}"
        added.append(add_trip_media(trip_id, uri, media_type))

    return added


@app.get("/uploads/{filename}")
async def serve_upload(filename: str) -> FileResponse:
    """Serve uploaded media files."""
    file_path = UPLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)


@app.post("/trips/{trip_id}/media")
def api_add_trip_media(trip_id: str, body: TripMediaBody) -> list[dict[str, Any]]:
    """Add media items to a trip. Each item has uri and type ('image' or 'video')."""
    added = []
    for item in body.items:
        t = (item.type or "image").lower()
        if t not in ("image", "video"):
            t = "image"
        added.append(add_trip_media(trip_id, item.uri, t))
    return added


@app.get("/trips/{trip_id}/itinerary")
def get_trip_itinerary(trip_id: str) -> dict[str, Any]:
    """Return stored itinerary for a trip, or empty."""
    raw = get_itinerary(trip_id)
    if not raw:
        return {"itinerary": None}
    try:
        return {"itinerary": json.loads(raw)}
    except json.JSONDecodeError:
        return {"itinerary": None}


# --- OpenRouter (@gemini) integration: google/gemini-3-flash-preview via OpenRouter API (OpenAI-compatible) ---
OPENROUTER_MODEL = "google/gemini-3-flash-preview"

SYSTEM_INSTRUCTION = """You are a helpful trip-planning assistant in a group chat. When users mention you with @gemini, you must FIRST decide what action to take, then respond in the required format.

## Step 1: Determine the action

Choose ONE based on the user's request:
- **RESPOND_ONLY**: User is asking a question, wants info, or wants you to summarize/describe. Examples: "What's our plan?", "What have we got so far?", "Summarize our itinerary", "What are we doing on Day 2?", "Tell me more about that". Answer using the conversation and existing itinerary context. Do NOT output any itinerary JSON.
- **UPDATE_ITINERARY**: User wants to create, change, or add to the plan. Examples: "Add Napa on Day 2", "Change day 1 to...", "Let's plan a trip to SF", "Remove the morning activity", "Add a wine tasting". Output the full updated itinerary as JSON.

When in doubt: if they're ASKING (what, how, summarize, tell me) → RESPOND_ONLY. If they're REQUESTING changes (add, remove, change, let's plan) → UPDATE_ITINERARY.

## Step 2: Output in this format

For RESPOND_ONLY, output:
<action>respond</action>
<response>Your friendly response here. Use the existing itinerary from context to answer questions about the current plan.</response>

For UPDATE_ITINERARY, output:
<action>update_itinerary</action>
<response>Short message to the user, e.g. "I've added Napa to Day 2!"</response>
<itinerary>
```json
[full itinerary array - use exact structure below]
```
</itinerary>

Itinerary JSON structure (each day: id, dayNumber, title, date optional, activities array; each activity: id, time optional, title, description optional, location optional):
[{"id":"day-1","dayNumber":1,"title":"Day 1","date":"YYYY-MM-DD","activities":[{"id":"act-1","time":"9:00 AM","title":"Title","description":"","location":""}]}]

**CRITICAL for UPDATE_ITINERARY:** You are given the current itinerary in the context below. When the user asks to ADD something (e.g. arrival/departure flight times, a new activity, a new day), your <itinerary> output MUST be the COMPLETE plan: include EVERY day and EVERY activity that is already in the current itinerary, unchanged, PLUS your new or modified items. Never output only the new items—that would replace the whole plan and delete everything else. If the user says "add X", start from the full current itinerary, add X, then output that full array."""


def _build_chat_messages(history: list[dict]) -> list[dict]:
    """Build messages list for OpenRouter/OpenAI chat API from chat history. Includes message timestamps."""
    messages = []
    for m in history:
        role = "assistant" if m.get("is_ai") else "user"
        name = (m.get("user_name") or "User").strip()
        text = (m.get("content") or "").strip()
        if not text:
            continue
        ts = m.get("created_at", "")
        prefix = f"[{ts}] " if ts else ""
        msg_text = f"{prefix}{name}: {text}"
        messages.append({"role": role, "content": msg_text})
    return messages


ITINERARY_DONE_MESSAGE = "I've added your itinerary to the Plan tab! Check the Plan tab to see the full schedule."

JSON_ONLY_PROMPT = """Output ONLY a valid JSON array for the COMPLETE trip itinerary. Include ALL days and activities from the current itinerary in the context above, plus any additions you are making (e.g. flight times). No markdown, no code fence, no other text. Format: [{"id":"day-1","dayNumber":1,"title":"Day 1","date":"YYYY-MM-DD","activities":[{"id":"act-1","time":"9:00 AM","title":"Title","description":"","location":""}]}]. Each day: id, dayNumber, title, date, activities. Each activity: id, time, title, description, location."""

TRIP_INFO_PREFIX = """=== CONTEXT ===
This conversation is about the trip "{name}" (destination: {destination}).

"""

ITINERARY_CONTEXT_PREFIX = """=== CONTEXT ===
This is the FULL current itinerary in the Plan tab. Use it to answer "what's our plan?" etc.

When the user asks to ADD or CHANGE something (e.g. "add arrival and departure flight times"):
- Your task is to ADD or edit within this existing plan, not replace it.
- Your <itinerary> output must contain ALL of the following days and activities, plus whatever you add or change.
- Do NOT output only the new items—that would delete the rest of the plan.

Current itinerary (JSON):

```json
"""

ITINERARY_CONTEXT_SUFFIX = """
```

--- End context. Conversation: ---

"""


def _call_openrouter_sync(
    messages: list[dict],
    extra_user_message: str | None = None,
    existing_itinerary: list[dict] | None = None,
    trip_info: dict[str, Any] | None = None,
) -> str:
    """Call OpenRouter API (google/gemini-3-flash-preview) via OpenAI-compatible chat completions. Returns response text."""
    if not OPENROUTER_API_KEY:
        logger.warning("OpenRouter: no API key set")
        return "The AI assistant is not configured. Set OPENROUTER_API_KEY or EXPO_PUBLIC_OPENROUTER_API_KEY in .env.local."
    try:
        from openai import OpenAI

        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY,
        )
        # Build context: trip name/destination first, then itinerary
        trip_prefix = ""
        if trip_info:
            name = trip_info.get("name") or "Trip"
            destination = trip_info.get("destination") or "TBD"
            trip_prefix = TRIP_INFO_PREFIX.format(name=name, destination=destination)
        # Prepend itinerary context (existing plan or "none") to first user message
        if existing_itinerary:
            itinerary_context = (
                trip_prefix
                + ITINERARY_CONTEXT_PREFIX
                + json.dumps(existing_itinerary, indent=2)
                + ITINERARY_CONTEXT_SUFFIX
            )
        else:
            itinerary_context = (
                trip_prefix
                + "=== CONTEXT ===\nThere is no itinerary in the Plan tab yet. If the user asks what the plan is, say they don't have one yet and offer to help create one.\n\n--- Conversation: ---\n\n"
            )
        # Build OpenAI-format messages with system instruction
        api_messages: list[dict] = [{"role": "system", "content": SYSTEM_INSTRUCTION}]
        for i, m in enumerate(messages):
            role = m.get("role", "user")
            content = m.get("content", "")
            if not content:
                continue
            if i == 0 and role == "user" and itinerary_context:
                content = itinerary_context + content
            api_messages.append({"role": role, "content": content})
        if len(api_messages) <= 1:
            return "No chat history to send. Say something and mention @gemini again."
        if extra_user_message:
            api_messages.append({"role": "user", "content": extra_user_message})
        logger.info(
            "OpenRouter: calling model=%s with %d messages",
            OPENROUTER_MODEL,
            len(api_messages),
        )
        response = client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=api_messages,
            max_tokens=2048,
            temperature=0.7,
        )
        out = ""
        if response and response.choices:
            msg = response.choices[0].message
            if msg and msg.content:
                out = msg.content.strip()
        if out:
            logger.info("OpenRouter: got response length=%d", len(out))
            return out
        logger.warning("OpenRouter: empty or no content on response")
        return "I couldn't generate a response. Please try again."
    except Exception as e:
        logger.exception("OpenRouter API error: %s", e)
        return f"Something went wrong while calling the AI: {str(e)}"


def _parse_structured_response(text: str) -> tuple[str, list[dict] | None]:
    """
    Parse the AI's structured response. Returns (chat_message, itinerary_list_or_none).
    - If <action>respond</action>: return (content of <response>, None)
    - If <action>update_itinerary</action>: return (content of <response>, parsed itinerary list)
    - Fallback: return (raw text, extracted itinerary if any)
    """
    if not text:
        return ("", None)
    text = text.strip()
    action_match = re.search(
        r"<action>\s*(.+?)\s*</action>", text, re.DOTALL | re.IGNORECASE
    )
    response_match = re.search(
        r"<response>\s*([\s\S]*?)\s*</response>", text, re.DOTALL | re.IGNORECASE
    )
    itinerary_match = re.search(
        r"<itinerary>\s*([\s\S]*?)\s*</itinerary>", text, re.DOTALL | re.IGNORECASE
    )
    action = (action_match.group(1).strip().lower() if action_match else "").replace(
        " ", "_"
    )
    response_text = response_match.group(1).strip() if response_match else text
    if action == "update_itinerary" and itinerary_match:
        itinerary_block = itinerary_match.group(1).strip()
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", itinerary_block)
        raw_json = json_match.group(1).strip() if json_match else itinerary_block
        parsed = _parse_itinerary_json(raw_json)
        return (response_text, parsed)
    if action == "respond" or action == "respond_only":
        return (response_text, None)
    # Fallback: no structured format, try to extract itinerary from raw response
    parsed = _extract_itinerary_from_response(text)
    return (text, parsed)


def _extract_itinerary_from_response(text: str) -> list[dict] | None:
    """Extract itinerary JSON from model response (e.g. ```json ... ```)."""
    if not text:
        return None
    # Match ```json ... ``` or ``` ... ``` block (greedy to get full block)
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        raw = match.group(1).strip()
    else:
        raw = text.strip()
    return _parse_itinerary_json(raw)


def _parse_itinerary_json(raw: str) -> list[dict] | None:
    """Parse and normalize itinerary JSON string to our schema."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if not isinstance(data, list) or len(data) == 0:
            return None
        out = []
        for i, day in enumerate(data):
            if not isinstance(day, dict):
                continue
            activities = day.get("activities") or []
            out.append(
                {
                    "id": day.get("id") or f"day-{i + 1}",
                    "dayNumber": int(day.get("dayNumber", i + 1)),
                    "title": str(day.get("title") or f"Day {i + 1}"),
                    "date": str(day.get("date", "")).strip() or None,
                    "activities": [
                        {
                            "id": a.get("id") or f"act-{j + 1}",
                            "time": str(a.get("time", "")).strip() or None,
                            "title": str(a.get("title") or ""),
                            "description": str(a.get("description", "")).strip()
                            or None,
                            "location": str(a.get("location", "")).strip() or None,
                        }
                        for j, a in enumerate(activities)
                        if isinstance(a, dict)
                    ],
                }
            )
        return out if out else None
    except (json.JSONDecodeError, TypeError):
        return None


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
        # Send existing messages and itinerary so new joiners get full state
        history = get_messages(trip_id)
        itinerary_raw = get_itinerary(trip_id)
        itinerary_list = None
        if itinerary_raw:
            try:
                itinerary_list = json.loads(itinerary_raw)
            except json.JSONDecodeError:
                pass
        await websocket.send_json(
            {
                "type": "history",
                "messages": history,
                **({"itinerary": itinerary_list} if itinerary_list else {}),
            }
        )

        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            # Handle typing indicator events
            msg_type = msg.get("type", "")
            if msg_type == "typing":
                # Broadcast typing indicator to others in the room
                typing_payload = {
                    "type": "typing",
                    "user_id": msg.get("user_id", ""),
                    "user_name": msg.get("user_name", "Unknown"),
                }
                for ws in room:
                    if ws != websocket:  # Don't send back to sender
                        try:
                            await ws.send_json(typing_payload)
                        except Exception:
                            pass
                continue
            elif msg_type == "stop_typing":
                # Could broadcast stop_typing, but we handle timeout on frontend
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

            # If user mentioned @gemini, show typing, call Gemini, then add to Plan tab and notify
            if "@gemini" in content.lower():
                logger.info(
                    "OpenRouter: @gemini mention detected for trip_id=%s", trip_id
                )
                # Broadcast typing indicator so clients show "Gemini is typing..."
                for ws in room:
                    try:
                        await ws.send_json({"type": "typing", "user_name": "Gemini"})
                    except Exception:
                        pass
                history_after = get_messages(trip_id)
                messages = _build_chat_messages(history_after)
                if not messages:
                    logger.warning("OpenRouter: no messages built from history")
                    continue
                # Fetch trip info and existing itinerary for LLM context
                trip_info = db_get_trip(trip_id)
                itinerary_raw = get_itinerary(trip_id)
                existing_itinerary = None
                if itinerary_raw:
                    try:
                        existing_itinerary = json.loads(itinerary_raw)
                    except json.JSONDecodeError:
                        pass
                try:
                    ai_text = await asyncio.to_thread(
                        _call_openrouter_sync,
                        messages,
                        None,
                        existing_itinerary,
                        trip_info,
                    )
                except Exception as e:
                    logger.exception("OpenRouter: thread error %s", e)
                    ai_text = f"Something went wrong: {e}"
                chat_message, itinerary_list = _parse_structured_response(ai_text)
                # Retry with JSON-only prompt if update_itinerary was intended but parse failed
                if itinerary_list is None and (
                    "```json" in ai_text
                    or "```" in ai_text
                    or "<itinerary>" in ai_text.lower()
                ):
                    logger.info("OpenRouter: retrying with JSON-only prompt")
                    try:
                        retry_text = await asyncio.to_thread(
                            _call_openrouter_sync,
                            messages,
                            JSON_ONLY_PROMPT,
                            existing_itinerary,
                            trip_info,
                        )
                        itinerary_list = _parse_itinerary_json(retry_text.strip())
                        if itinerary_list is None and "```" in retry_text:
                            itinerary_list = _extract_itinerary_from_response(
                                retry_text
                            )
                        if itinerary_list and not chat_message:
                            chat_message = ITINERARY_DONE_MESSAGE
                    except Exception as retry_err:
                        logger.warning("OpenRouter: JSON retry failed: %s", retry_err)
                if itinerary_list:
                    set_itinerary(trip_id, json.dumps(itinerary_list))
                    payload_it = {
                        "type": "itinerary",
                        "trip_id": trip_id,
                        "itinerary": itinerary_list,
                    }
                    for ws in room:
                        try:
                            await ws.send_json(payload_it)
                        except Exception:
                            pass
                if not chat_message:
                    chat_message = (
                        ai_text or "I couldn't generate a response. Please try again."
                    )
                ai_saved = add_message(
                    trip_id=trip_id,
                    content=chat_message,
                    is_ai=True,
                    user_id=None,
                    user_name="Gemini",
                )
                payload_ai = {"type": "message", "message": ai_saved}
                dead_ai = set()
                for ws in room:
                    try:
                        await ws.send_json(payload_ai)
                    except Exception as send_err:
                        logger.warning(
                            "OpenRouter: failed to send AI message to client: %s",
                            send_err,
                        )
                        dead_ai.add(ws)
                for ws in dead_ai:
                    room.discard(ws)

    except WebSocketDisconnect:
        pass
    finally:
        room.discard(websocket)
        if not room:
            del rooms[trip_id]
        logger.info("Client left trip_id=%s (connections=%d)", trip_id, len(room))
