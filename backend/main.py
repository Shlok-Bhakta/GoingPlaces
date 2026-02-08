"""
Custom Python backend for Going Places chat.
- WebSocket rooms per trip_id so multiple devices share the same chat.
- SQLite for message persistence and history.
- When a message contains @gemini, call Google Gemini (Gemma) with full chat context
  and optionally extract an itinerary for the Plan tab.
"""
import asyncio
import json
import logging
import os
import re
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import (
    init_db,
    add_message,
    get_messages,
    get_itinerary,
    set_itinerary,
    register_code,
    resolve_code,
)

# Load .env.local from project root so EXPO_PUBLIC_GEMINI_API_KEY is available
_load_env_paths = [
    os.path.join(os.path.dirname(__file__), "..", ".env.local"),
    os.path.join(os.path.dirname(__file__), ".env"),
]
for _p in _load_env_paths:
    if os.path.isfile(_p):
        load_dotenv(_p)
        break
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("EXPO_PUBLIC_GEMINI_API_KEY")

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
    if GEMINI_API_KEY:
        logger.info("Gemini: API key loaded (length=%d)", len(GEMINI_API_KEY))
    else:
        logger.warning("Gemini: no API key (set GEMINI_API_KEY or EXPO_PUBLIC_GEMINI_API_KEY in .env.local)")


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
def api_resolve_code(code: str = Query(..., min_length=4, max_length=4)) -> dict[str, Any]:
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


# --- Gemini (@gemini) integration: use Gemma to avoid 429 on gemini-2.0-flash free tier ---
GEMINI_MODEL = "gemma-3-27b-it"  # Gemma 3 27B via Gemini API; fallback: gemma-3-12b-it, gemini-2.0-flash

SYSTEM_INSTRUCTION = """You are a helpful trip-planning assistant in a group chat. When users mention you with @gemini, respond in a friendly, concise way. Use the full chat context to answer.

CRITICAL - Itinerary and Plan tab:
- When the conversation clearly suggests a trip plan (destination, dates, activities, preferences), you MUST output a valid itinerary so the app can add it to the Plan tab.
- The app will parse ONLY a single ```json ... ``` block from your response and add it to the Plan tab. Do NOT put the itinerary in chat text—put it ONLY inside one ```json ... ``` block.
- Your chat message to the user should be SHORT (1–2 sentences), e.g. "I've added your SF itinerary to the Plan tab! Check the Plan tab to see the full schedule." Then on the next line output the JSON block.
- If you include an itinerary, use this EXACT structure inside a single fenced block (no other text inside the block):

```json
[
  {"id": "day-1", "dayNumber": 1, "title": "Day 1", "date": "YYYY-MM-DD", "activities": [{"id": "act-1", "time": "9:00 AM", "title": "Activity name", "description": "Optional", "location": "Optional"}]}
]
```

- Each day must have: id, dayNumber, title, date (optional), activities (array).
- Each activity must have: id, time (optional), title, description (optional), location (optional).
- Output valid JSON only inside the block (no trailing commas, no comments). If there isn't enough info for a plan, reply in text only and do not output any JSON block."""


def _build_gemini_contents(history: list[dict]) -> list[dict]:
    """Build contents list for Gemini API from chat history."""
    contents = []
    for m in history:
        role = "model" if m.get("is_ai") else "user"
        name = (m.get("user_name") or "User").strip()
        text = (m.get("content") or "").strip()
        if not text:
            continue
        if role == "user":
            contents.append({"role": "user", "parts": [{"text": f"{name}: {text}"}]})
        else:
            contents.append({"role": "model", "parts": [{"text": f"{name}: {text}"}]})
    return contents


ITINERARY_DONE_MESSAGE = "I've added your itinerary to the Plan tab! Check the Plan tab to see the full schedule."

JSON_ONLY_PROMPT = """Output ONLY a valid JSON array for the trip itinerary. No markdown, no code fence, no other text. Format: [{"id":"day-1","dayNumber":1,"title":"Day 1","date":"YYYY-MM-DD","activities":[{"id":"act-1","time":"9:00 AM","title":"Title","description":"","location":""}]}]. Each day: id, dayNumber, title, date, activities. Each activity: id, time, title, description, location."""


def _call_gemini_sync(contents: list[dict], extra_user_message: str | None = None) -> str:
    """Call Gemini API (sync, run in thread). Returns response text."""
    if not GEMINI_API_KEY:
        logger.warning("Gemini: no API key set")
        return "Gemini is not configured. Set GEMINI_API_KEY or EXPO_PUBLIC_GEMINI_API_KEY in .env.local."
    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=GEMINI_API_KEY)
        # Build SDK Content objects: alternating user/model parts as text
        sdk_contents = []
        for c in contents:
            role = c.get("role", "user")
            parts = c.get("parts") or []
            text = " ".join(p.get("text", "") for p in parts if isinstance(p, dict) and p.get("text"))
            if not text:
                continue
            if role == "user":
                sdk_contents.append(types.Content(role="user", parts=[types.Part.from_text(text=text)]))
            else:
                sdk_contents.append(types.Content(role="model", parts=[types.Part.from_text(text=text)]))
        if not sdk_contents:
            return "No chat history to send. Say something and mention @gemini again."
        if extra_user_message:
            sdk_contents = sdk_contents + [
                types.Content(role="user", parts=[types.Part.from_text(text=extra_user_message)])
            ]
        # Gemma (gemma-3-27b-it) does not support system_instruction; fold into first user message
        uses_gemma = "gemma" in GEMINI_MODEL.lower()
        if uses_gemma and contents and (contents[0].get("role") == "user") and not extra_user_message:
            first_parts = contents[0].get("parts") or []
            first_text = " ".join(p.get("text", "") for p in first_parts if isinstance(p, dict) and p.get("text"))
            sdk_contents[0] = types.Content(
                role="user",
                parts=[types.Part.from_text(text=SYSTEM_INSTRUCTION + "\n\n---\n\nConversation:\n" + first_text)],
            )
        logger.info("Gemini: calling model=%s with %d turns", GEMINI_MODEL, len(sdk_contents))
        config_kwargs = {"max_output_tokens": 2048, "temperature": 0.7}
        if not uses_gemma:
            config_kwargs["system_instruction"] = SYSTEM_INSTRUCTION
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=sdk_contents,
            config=types.GenerateContentConfig(**config_kwargs),
        )
        out = ""
        if response:
            if getattr(response, "text", None):
                out = (response.text or "").strip()
            elif getattr(response, "candidates", None) and response.candidates:
                cand = response.candidates[0]
                content = getattr(cand, "content", None)
                parts = getattr(content, "parts", None) or [] if content else []
                out = " ".join(getattr(p, "text", "") or "" for p in parts).strip()
        if out:
            logger.info("Gemini: got response length=%d", len(out))
            return out
        logger.warning("Gemini: empty or no .text on response: %s", type(response).__name__ if response else "None")
        return "I couldn't generate a response. Please try again."
    except Exception as e:
        logger.exception("Gemini API error: %s", e)
        return f"Something went wrong while calling Gemini: {str(e)}"


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
            out.append({
                "id": day.get("id") or f"day-{i+1}",
                "dayNumber": int(day.get("dayNumber", i + 1)),
                "title": str(day.get("title") or f"Day {i + 1}"),
                "date": str(day.get("date", "")).strip() or None,
                "activities": [
                    {
                        "id": a.get("id") or f"act-{j+1}",
                        "time": str(a.get("time", "")).strip() or None,
                        "title": str(a.get("title") or ""),
                        "description": str(a.get("description", "")).strip() or None,
                        "location": str(a.get("location", "")).strip() or None,
                    }
                    for j, a in enumerate(activities) if isinstance(a, dict)
                ],
            })
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
        await websocket.send_json({
            "type": "history",
            "messages": history,
            **({"itinerary": itinerary_list} if itinerary_list else {}),
        })

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

            # If user mentioned @gemini, show typing, call Gemini, then add to Plan tab and notify
            if "@gemini" in content.lower():
                logger.info("Gemini: mention detected for trip_id=%s", trip_id)
                # Broadcast typing indicator so clients show "Gemini is typing..."
                for ws in room:
                    try:
                        await ws.send_json({"type": "typing", "user_name": "Gemini"})
                    except Exception:
                        pass
                history_after = get_messages(trip_id)
                contents = _build_gemini_contents(history_after)
                if not contents:
                    logger.warning("Gemini: no contents built from history")
                    continue
                try:
                    ai_text = await asyncio.to_thread(_call_gemini_sync, contents)
                except Exception as e:
                    logger.exception("Gemini: thread error %s", e)
                    ai_text = f"Something went wrong: {e}"
                itinerary_list = _extract_itinerary_from_response(ai_text)
                # Retry with JSON-only prompt if response had a code block but parse failed
                if itinerary_list is None and ("```json" in ai_text or "```" in ai_text):
                    logger.info("Gemini: retrying with JSON-only prompt")
                    try:
                        retry_text = await asyncio.to_thread(
                            _call_gemini_sync, contents, JSON_ONLY_PROMPT
                        )
                        itinerary_list = _parse_itinerary_json(retry_text.strip())
                        if itinerary_list is None and "```" in retry_text:
                            itinerary_list = _extract_itinerary_from_response(retry_text)
                    except Exception as retry_err:
                        logger.warning("Gemini: JSON retry failed: %s", retry_err)
                if itinerary_list:
                    set_itinerary(trip_id, json.dumps(itinerary_list))
                    payload_it = {"type": "itinerary", "trip_id": trip_id, "itinerary": itinerary_list}
                    for ws in room:
                        try:
                            await ws.send_json(payload_it)
                        except Exception:
                            pass
                    # Save short "done" message so chat shows Plan tab update, not the long JSON
                    chat_message = ITINERARY_DONE_MESSAGE
                else:
                    chat_message = ai_text
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
                        logger.warning("Gemini: failed to send AI message to client: %s", send_err)
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
