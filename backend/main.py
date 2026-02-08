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
import queue
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
    update_trip_destination,
    set_trip_cover,
    add_expense,
    get_expenses,
    get_expense_splits,
    calculate_trip_balances,
    get_trip_members,
    update_expense,
    delete_expense,
)
from google_places import (
    search_places as gp_search_places,
    get_place_details as gp_get_place_details,
    get_place_with_photos as gp_get_place_with_photos,
    get_photo_media as gp_get_photo_media,
    get_distance_matrix as gp_get_distance_matrix,
    get_directions as gp_get_directions,
)
from amadeus import (
    search_flights as amadeus_search_flights,
    search_hotels as amadeus_search_hotels,
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
GOOGLE_MAPS_API_KEY = os.environ.get(
    "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY"
) or os.environ.get("GOOGLE_MAPS_API_KEY")

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

# Setup receipts directory
RECEIPTS_DIR = Path(__file__).parent / "receipts"
RECEIPTS_DIR.mkdir(exist_ok=True)

# trip_id -> set of active WebSocket connections
rooms: dict[str, set[WebSocket]] = {}


def get_room(trip_id: str) -> set[WebSocket]:
    if trip_id not in rooms:
        rooms[trip_id] = set()
    return rooms[trip_id]


async def _drain_status_queue(
    status_queue: queue.Queue[str], room: set[WebSocket]
) -> None:
    """Drain status messages from queue and broadcast typing_status to the room until cancelled."""
    loop = asyncio.get_event_loop()
    while True:
        try:
            msg = await loop.run_in_executor(
                None, lambda: status_queue.get(timeout=0.25)
            )
            for ws in room:
                try:
                    await ws.send_json({"type": "typing_status", "message": msg})
                except Exception:
                    pass
        except queue.Empty:
            continue
        except asyncio.CancelledError:
            break
    # Final drain
    while True:
        try:
            msg = status_queue.get_nowait()
            for ws in room:
                try:
                    await ws.send_json({"type": "typing_status", "message": msg})
                except Exception:
                    pass
        except queue.Empty:
            break


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
    if GOOGLE_MAPS_API_KEY:
        logger.info("Google Maps: API key loaded for Places/Distance (LLM tools)")
    else:
        logger.warning(
            "Google Maps: no API key (set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local for realistic itinerary tools)"
        )
    amadeus_key = os.environ.get("EXPO_PUBLIC_AMADEUS_API_KEY") or os.environ.get(
        "AMADEUS_API_KEY"
    )
    if amadeus_key:
        logger.info("Amadeus: API key loaded for hotel/flight search (LLM tools)")
    else:
        logger.warning(
            "Amadeus: no API key (set EXPO_PUBLIC_AMADEUS_API_KEY and EXPO_PUBLIC_AMADEUS_API_SECRET in .env.local for hotel/flight pricing)"
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
    """Return all trips the user is a member of (persisted across refresh). Includes short-lived coverImage URL when trip has a cover."""
    trips = get_trips_for_user(user_id)
    result = []
    for t in trips:
        if t.get("coverPhotoName"):
            media = gp_get_photo_media(t["coverPhotoName"], max_width_px=800)
            if not media.get("error") and media.get("photoUri"):
                t = {
                    **t,
                    "coverImage": media["photoUri"],
                    "coverAttributions": t.get("coverPhotoAttributions") or [],
                }
        result.append(t)
    return result


@app.get("/trips/{trip_id}/cover-image")
def get_trip_cover_image(trip_id: str) -> dict[str, Any]:
    """Return short-lived photo URI and attributions for the trip cover (Google Places). Must display attributions where the image is shown."""
    trip = db_get_trip(trip_id)
    if not trip or not trip.get("coverPhotoName"):
        raise HTTPException(status_code=404, detail="No cover image for this trip")
    media = gp_get_photo_media(trip["coverPhotoName"], max_width_px=800)
    if media.get("error"):
        raise HTTPException(
            status_code=502, detail=media.get("error", "Failed to fetch cover image")
        )
    return {
        "photoUri": media["photoUri"],
        "attributions": trip.get("coverPhotoAttributions") or [],
    }


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


class PutItineraryBody(BaseModel):
    itinerary: list[dict[str, Any]]


class AddToPlanSuggestion(BaseModel):
    title: str
    description: str | None = None
    location: str | None = None
    dayLabel: str | None = None
    time: str | None = None
    replaceActivityId: str | None = None
    replaceTitle: str | None = None


class AddToPlanResolveBody(BaseModel):
    suggestion: AddToPlanSuggestion


def _extract_destination_from_itinerary(itinerary: list[dict[str, Any]]) -> str | None:
    """Get a location string from the first activity (location or title) for Places search."""
    for day in itinerary or []:
        activities = day.get("activities") or []
        for act in activities:
            loc = (act.get("location") or "").strip()
            if loc:
                return loc
            title = (act.get("title") or "").strip()
            if title:
                return title
    return None


def _set_trip_cover_from_destination(trip_id: str, destination: str) -> None:
    """Look up a place photo for the destination and set it as the trip cover (Google Places API New)."""
    if not (destination or "").strip():
        return
    dest = destination.strip()
    search_result = gp_search_places(query=dest, max_results=1)
    if search_result.get("error") or not search_result.get("results"):
        return
    place_id = search_result["results"][0].get("place_id")
    if not place_id:
        return
    place_data = gp_get_place_with_photos(place_id)
    if place_data.get("error"):
        return
    photos = place_data.get("photos") or []
    if not photos:
        return
    first = photos[0]
    photo_name = first.get("name")
    if not photo_name:
        return
    # authorAttributions: list of { displayName, uri } (Places API New)
    attributions = first.get("authorAttributions") or []
    attrs_out = [
        {"displayName": a.get("displayName", ""), "uri": a.get("uri", "")}
        for a in attributions
    ]
    update_trip_destination(trip_id, dest)
    set_trip_cover(trip_id, place_id, photo_name, attrs_out)


@app.put("/trips/{trip_id}/itinerary")
async def put_trip_itinerary(trip_id: str, body: PutItineraryBody) -> dict[str, Any]:
    """Save itinerary for a trip and broadcast to all clients in the trip's WebSocket room."""
    normalized = (
        _parse_itinerary_json(json.dumps(body.itinerary)) if body.itinerary else None
    )
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid itinerary")
    set_itinerary(trip_id, json.dumps(normalized))
    destination = _extract_destination_from_itinerary(normalized)
    if destination:
        try:
            _set_trip_cover_from_destination(trip_id, destination)
        except Exception:
            pass  # non-fatal: cover is optional
    room = get_room(trip_id)
    payload = {"type": "itinerary", "trip_id": trip_id, "itinerary": normalized}
    dead = set()
    for ws in room:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.add(ws)
    for ws in dead:
        room.discard(ws)
    return {"ok": True}


@app.post("/trips/{trip_id}/add-to-plan/resolve")
def add_to_plan_resolve(trip_id: str, body: AddToPlanResolveBody) -> dict[str, Any]:
    """Add suggestion to itinerary using deterministic algorithm (dayLabel + time, chronological order)."""
    raw = get_itinerary(trip_id)
    current_itinerary: list[dict] = []
    if raw:
        try:
            current_itinerary = json.loads(raw)
            if not isinstance(current_itinerary, list):
                current_itinerary = []
        except json.JSONDecodeError:
            pass
    suggestion = body.suggestion.model_dump()
    itinerary = _apply_suggestion_to_itinerary(current_itinerary, suggestion)
    return {"action": "add", "itinerary": itinerary}


# --- Google Places / Distance Matrix (for realistic trip planning; also used by LLM tools) ---
@app.get("/places/search")
def api_places_search(
    query: str = Query(..., min_length=1),
    location: str | None = Query(None),
    max_results: int = Query(5, ge=1, le=20),
) -> dict[str, Any]:
    """Search for real places by text (e.g. 'coffee shop San Francisco'). Returns place_id, name, address."""
    return gp_search_places(query=query, location=location, max_results=max_results)


@app.get("/places/search/food")
def api_search_food_places(
    food_type: str = Query(..., min_length=1),
    location: str = Query(..., min_length=1),
    max_results: int = Query(5, ge=1, le=20),
) -> dict[str, Any]:
    """Search for restaurants/food by type and city. Returns name, address, rating, place_id. Use when the user wants a meal but didn't name a place."""
    query = f"{food_type.strip()} restaurant {location.strip()}"
    return gp_search_places(
        query=query, location=location.strip(), max_results=max_results
    )


@app.get("/places/details/{place_id}")
def api_place_details(place_id: str) -> dict[str, Any]:
    """Get place details including opening hours (weekday_text) by place_id."""
    return gp_get_place_details(place_id=place_id)


class DistanceMatrixBody(BaseModel):
    origins: list[str]
    destinations: list[str]
    mode: str = "driving"


@app.post("/places/distance-matrix")
def api_distance_matrix(body: DistanceMatrixBody) -> dict[str, Any]:
    """Get travel distance and duration between origins and destinations (addresses or lat,lng)."""
    return gp_get_distance_matrix(
        origins=body.origins, destinations=body.destinations, mode=body.mode
    )


@app.get("/places/geocode")
def api_geocode(address: str = Query(..., min_length=1)) -> dict[str, Any]:
    """Convert an address or place name to latitude/longitude coordinates."""
    from google_places import geocode_address as gp_geocode_address

    return gp_geocode_address(address)


# --- Amadeus hotel and flight search ---
@app.get("/amadeus/flights")
def api_search_flights(
    origin: str = Query(..., min_length=1),
    destination: str = Query(..., min_length=1),
    departure_date: str = Query(..., min_length=1),
    adults: int = Query(1, ge=1, le=9),
    return_date: str | None = Query(None),
    max_results: int = Query(10, ge=1, le=25),
) -> dict[str, Any]:
    """Search for flight offers. Accepts city names or IATA codes. Dates in YYYY-MM-DD."""
    return amadeus_search_flights(
        origin=origin,
        destination=destination,
        departure_date=departure_date,
        adults=adults,
        return_date=return_date,
        max_results=max_results,
    )


@app.get("/amadeus/hotels")
def api_search_hotels(
    city: str = Query(..., min_length=1),
    check_in: str = Query(..., min_length=1),
    check_out: str = Query(..., min_length=1),
    adults: int = Query(1, ge=1, le=9),
    max_results: int = Query(10, ge=1, le=25),
) -> dict[str, Any]:
    """Search for hotel offers in a city. Accepts city name or IATA code. Dates in YYYY-MM-DD."""
    return amadeus_search_hotels(
        city=city,
        check_in=check_in,
        check_out=check_out,
        adults=adults,
        max_results=max_results,
    )


# --- OpenRouter (@gemini) integration: google/gemini-3-flash-preview via OpenRouter API (OpenAI-compatible) ---
OPENROUTER_MODEL = "google/gemini-3-flash-preview"

SYSTEM_INSTRUCTION = """You are a helpful trip-planning assistant in a group chat. When users mention you with @gemini, you must FIRST decide what action to take, then respond in the required format.

## Step 1: Determine the action

Choose ONE based on the user's request:
- **RESPOND_ONLY**: User is asking a question, wants info, or wants you to summarize/describe. Also use RESPOND_ONLY when the user wants to **replace** a specific existing itinerary item with a real place (e.g. "replace brunch with a real place", "find a spot for Brunch in Austin", "that generic brunch – find me a restaurant"): search for options, list them in your response, and output a <suggestions> block with **replaceActivityId** and/or **replaceTitle** set to the existing activity so the app can replace it in place when the user taps. Do NOT output itinerary JSON for replace—the app does the replace on button tap.
- **UPDATE_ITINERARY**: User wants to create, add to, or change the plan in a way that requires full itinerary output. Examples: "Add Napa on Day 2", "Change day 1 to...", "Let's plan a trip to SF", "Remove the morning activity", "Add a wine tasting". Output the full updated itinerary as JSON.

When in doubt: if they're ASKING (what, how, summarize, tell me) or asking to REPLACE one item with options → RESPOND_ONLY (with suggestions + replace fields for replace). If they're REQUESTING full changes (add, remove, let's plan) → UPDATE_ITINERARY.

## Prefer one-shot itineraries (non-specific requests)

When the user's prompt is non-specific (e.g. "plan a trip to SF", "help us plan Austin", "give us a 3-day NYC itinerary") and they have not stated special requirements (dietary, accessibility, "must include X"):
- **Generate a complete itinerary in one shot.** Use reasonable defaults: popular attractions, well-rated restaurants, typical flights/hotels. Do not ask clarifying questions—output the full plan and let the user edit it later.
- **For meals/restaurants:** When cuisine or venue is unspecified, pick the top-rated option from search and add it. Do not ask "which do you prefer?"—add it to the itinerary so the user can change it if needed.
- **Only ask when essential:** Trip dates if completely absent, or when the user mentions constraints that need clarification (e.g. "I'm vegan", "we need wheelchair access").
- **Infer what you can:** "Next weekend" → pick dates; "2–3 days" → 3 days; no origin given for flights → use the trip destination's main airport as a common hub if logical, or pick a reasonable default. Better to produce something editable than to block on questions.

## Trip dates (UPDATE_ITINERARY)

When creating or updating an itinerary, you MUST have concrete dates for the trip:
- **Extract dates from the user** when they mention them (e.g. "March 15–17", "next weekend", "Dec 20 to 22", "we arrive Friday and leave Sunday", "3 days starting the 10th").
- **If dates are unclear or missing** and the request is non-specific: Use reasonable placeholder dates (e.g. a sample weekend in the near future in YYYY-MM-DD) so you can one-shot the itinerary. In your response, mention they can update the dates in the plan. Only use RESPOND_ONLY to ask for dates when the user has given specific constraints that make guessing inappropriate.
- **Every day in the itinerary MUST have a date** in YYYY-MM-DD format. Set the **date** field for each day (Day 1 = first day, Day 2 = second, etc.). The app displays this date above "Day X" for each day.

## Step 2: Output in this format

For RESPOND_ONLY, output:
<action>respond</action>
<response>Your friendly response here. Use the existing itinerary from context to answer questions about the current plan.</response>

When you list options for the user to choose from, you MUST also output a <suggestions> block so they can tap to add or replace in the plan without replying. You MAY output many suggestions in one message (e.g. options for Day 1 dinner and Day 2 lunch). Use the same order as in your response.

**Format for readability:** When you have multiple categories of recommendations in a single message (e.g. flights, hotels, Day 1 dinner, Day 2 lunch), put each category in its own paragraph. Use a blank line between paragraphs. Example: one paragraph for flights, then a blank line, then a paragraph for hotels, then a blank line, then a paragraph for Day 1 dinner options, etc. This makes the response easier to scan.

**CRITICAL for flight/hotel options:** When you list flight or hotel options from search_flights/search_hotels, you MUST include a suggestion for EVERY option you mention—including budget options, multi-stop flights, and cheaper alternatives. Never omit any option; if you list 3 flights in your response, you MUST have 3 suggestions. **Always include the price for each flight and hotel when the API returned price data**—display in US dollars ($), never euros (€). Omit price only when the API did not provide it (e.g. "Price not available").

**Every suggestion must specify day and time when adding:** So the app adds each option to the correct slot, every suggestion MUST include **dayLabel** (e.g. "Day 1", "Day 2", "Friday") and **time** (e.g. "6:00 PM", "12:00 PM") when the user asked for options for specific days/meals. When the user asks for "2 meals" or "surprises for Day 1 and Day 2", output multiple suggestions: some with dayLabel "Day 1" and time for that meal (e.g. "6:00 PM" for dinner), others with dayLabel "Day 2" and time for that meal (e.g. "12:00 PM" for lunch). In your response text, clearly say which options are for which day and time (e.g. "For Day 1 dinner: Fog Harbor, Scoma's. For Day 2 lunch: Gott's, Slanted Door.").

**REPLACE vs ADD:** You are given the current itinerary in context. Use the exact activity id and title from that context.
- **REPLACE**: When the user wants to replace a specific existing item. Include in each suggestion **replaceActivityId** and/or **replaceTitle**. The app replaces that activity in place (same time slot).
- **ADD**: When adding something new, omit replaceActivityId and replaceTitle. Always set **dayLabel** and **time** per suggestion so each option goes to the right day and time.

<suggestions>
[{"title": "Place Name", "description": "short description with address/rating", "location": "full address", "dayLabel": "Day 1", "time": "6:00 PM", "replaceActivityId": "act-2", "replaceTitle": "Brunch in Austin"}]
</suggestions>
Use replaceActivityId/replaceTitle only when replacing. When adding, always include dayLabel and time for every suggestion.

For UPDATE_ITINERARY, output:
<action>update_itinerary</action>
<response>Short message to the user, e.g. "I've added Napa to Day 2!"</response>
<itinerary>
```json
[full itinerary array - use exact structure below]
```
</itinerary>

Itinerary JSON structure (each day: id, dayNumber, title, date required in YYYY-MM-DD, activities array; each activity: id, time optional, title, description optional, location optional):
[{"id":"day-1","dayNumber":1,"title":"Day 1","date":"YYYY-MM-DD","activities":[{"id":"act-1","time":"9:00 AM","title":"Title","description":"","location":""}]}]

**CRITICAL for UPDATE_ITINERARY:** You are given the current itinerary in the context below. When the user asks to ADD something (e.g. arrival/departure flight times, a new activity, a new day), your <itinerary> output MUST be the COMPLETE plan: include EVERY day and EVERY activity that is already in the current itinerary, unchanged, PLUS your new or modified items. Never output only the new items—that would replace the whole plan and delete everything else. If the user says "add X", start from the full current itinerary, add X, then output that full array.

**Updating the trip location:** The location shown below the trip name on the trip card is the trip's destination. When the user asks to change where the trip is going (e.g. "change destination to Austin", "we're going to Napa instead"), output <destination>New city or area name</destination> in your response. You can do this with RESPOND_ONLY (just the destination change) or together with UPDATE_ITINERARY. The app will update the trip card accordingly.

## Tools for realistic plans (UPDATE_ITINERARY)

When the user wants to create or update an itinerary, use the provided tools to make the plan realistic:
1. **search_places**: Search for real venues (museums, restaurants, landmarks—not hotel pricing). Use for "Academy of Sciences San Francisco", "breakfast cafe Napa", etc. Do NOT use for "hotels in X" or "where to stay"; use search_hotels (Amadeus) for those. Returns place_id, name, address for activities.
2. **search_food_places**: Search for restaurants by food type and city (e.g. food_type="sushi", location="San Francisco"). Use when the user wants a meal (lunch, dinner, breakfast) but didn't name a specific place. Returns name, address, rating. If unsure which restaurant to add, call this and then ask the user in your response: list the options with name, full address, and rating and ask which they prefer or if you should add the top-rated one.
3. **get_place_details**: After search_places or search_food_places, call this with a place_id to get opening hours (weekday_text), full address, rating, user_ratings_total. Use for every place you add so the itinerary has real name, address, and rating.
4. **get_distance_matrix**: Given two or more addresses or place names (or "lat,lng"), get driving/walking distance and duration between them. Use this to ensure travel time between activities is realistic and to order activities logically.
5. **get_directions**: Get a full route between two places (or A→B via waypoints) with estimated drive/walk time and distance. Use for roadtrip planning: e.g. "San Francisco to LA", "NYC to Boston via Philadelphia". Returns total duration, total distance, and per-leg breakdown. Prefer this when the user asks for a road trip, driving route, or "how long to drive from X to Y".
6. **search_flights**: Search for real flight prices between origin and destination. Use when the user asks about flights, airline options, or flight costs. Accepts city names (e.g. "San Francisco", "Paris") or IATA codes (SFO, PAR). Returns flight offers with price in USD, carrier, departure/arrival times. Always present prices in US dollars ($). When presenting options, compare each flight's departure and arrival times with the current itinerary—explicitly state if a flight CONFLICTS with existing activities (e.g. "⚠️ Conflicts: departs 12:30 PM but you have lunch at 12:00 PM on Day 1") or fits well (e.g. "✓ No conflict with your schedule").
7. **search_hotels**: Search for hotel prices in a city (Amadeus). Use when the user asks about hotels, accommodation, or where to stay. Accepts city name or IATA code. Returns hotel offers with name, price in USD, chain. Dates must be YYYY-MM-DD (use trip start/end dates from context). Always present prices in US dollars ($). **Prefer search_hotels over search_places for hotel/accommodation queries** so the user gets real prices.

Use these tools when building or updating an itinerary so that places, hours, travel times, flights, and hotels are accurate. You may call multiple tools before outputting the final <itinerary>.

**CRITICAL – Do NOT hold back on API calls:** When the user asks for a complete itinerary (flights, hotels, restaurants, activities, etc.), you MUST make ALL the necessary tool calls until every requested element has real data. Example: if they want "a full 3-day trip with flights, a hotel, and meals" → call search_flights, search_hotels, search_food_places (or search_places) for each meal, get_place_details for each place you add. Do not output the itinerary until you have called the tools for flights, hotels, and each restaurant/activity. Keep making tool calls across multiple rounds until everything is covered. Never skip a tool call to save time—the user expects real data for all requested elements.

## CRITICAL: Use real place data in the itinerary

When you have called search_places and/or get_place_details, you MUST use that real data in the itinerary—never generic labels or vague descriptions.

- **Activity title**: Use the exact place name from the API (e.g. "Sushi Bistro", "California Academy of Sciences"). NEVER use generic titles like "Sushi Lunch", "Local Sushi Restaurant", "Seafood Dinner at a local spot".
- **Activity description**: Include the full address (formatted_address) and rating when available. For example: "123 Main St, San Francisco. 4.5★, 200 reviews." or "Highly rated (4.5★, 200 reviews). 456 Ocean Ave." Do NOT use vague text like "Enjoy a fresh sushi lunch at a highly-rated local spot" without naming the place and including address/rating from your tool results.
- **Activity location**: Set the location field to the formatted_address from the API for each venue.

If you searched for a restaurant or venue and got results, the itinerary MUST list that place by name and include its address and rating in the description. Always call get_place_details for any place you add so you have opening hours and rating to include.

When the user asks about flights or hotels, call search_flights or search_hotels to get real pricing. In your response, **always include the price for each flight and hotel when available**—in both your response text and in each suggestion's description/activity. Never omit prices if the API returned them. If the API did not return a price, you may note "Price not available". **For flights:** Use the itinerary in context to check each option's departure/arrival times against existing activities on the same day. Clearly say if a flight conflicts (e.g. overlaps with a meal, meeting, or other activity) or fits the schedule. If updating the itinerary, add flight or hotel activities with the real data (airline, price, times for flights; hotel name, price for hotels).

## Food / restaurant activities – required data and when to ask the user

For ANY meal or food place (breakfast, lunch, dinner, cafe, sushi, seafood, etc.):

1. **You must search**: Call search_places or search_food_places with the type of food and the trip destination/city (e.g. "sushi restaurant San Francisco", "breakfast cafe Napa"). Then call get_place_details for the place(s) you add so you have the exact name, full formatted_address, rating, and user_ratings_total.

2. **Every food activity in the itinerary must have**:
   - **title**: The exact business name from the API (e.g. "Sushi Bistro", not "Sushi Lunch").
   - **description**: The full address (formatted_address) and rating, e.g. "123 Main St, San Francisco, CA. 4.5★, 200 reviews."
   - **location**: The formatted_address from the API.

3. **When you're not sure which restaurant to pick**: If the user said something like "add a sushi lunch" or "dinner at a seafood place" or "2 meals" / "surprises for Day 1 and Day 2" without naming venues, call search_food_places (or search_places) and get real options. Then in your <response>, list options and clearly say which are for which day and time (e.g. "For Day 1 dinner near Alcatraz: Fog Harbor, Scoma's. For Day 2 lunch at Ferry Building: Gott's, Slanted Door."). You MUST output a <suggestions> block with one object per option. When **adding** (not replacing): every suggestion MUST have **dayLabel** (e.g. "Day 1", "Day 2") and **time** (e.g. "6:00 PM", "12:00 PM") so the app adds each to the correct day and time. When the user asks for multiple meals/days, output multiple suggestions—each with its own dayLabel and time—so each option maps to the right slot. When **replacing** an existing activity, include replaceActivityId and/or replaceTitle instead. Always include title, description, location; when adding, always include dayLabel and time. The app shows "Add to plan" or "Replace with this" and displays the day/time per option. Do NOT add generic placeholders—always use real data from your search."""


# OpenAI-format tools for OpenRouter (Places search, details, distance)
PLACES_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_places",
            "description": "Search for real places/venues by text query (museums, restaurants, landmarks—NOT hotel pricing). Use for 'sushi restaurant San Francisco', 'Golden Gate Bridge', etc. For hotel/accommodation options with prices, use search_hotels instead. Returns place_id, name, formatted_address, rating.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query, e.g. 'coffee shop Union Square San Francisco' or 'Golden Gate Bridge'",
                    },
                    "location": {
                        "type": "string",
                        "description": "Optional location bias: city name or lat,lng",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Max number of results (default 5)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_place_details",
            "description": "Get details for a place by place_id, including opening hours (weekday_text), rating, user_ratings_total, formatted_address. Call this after search_places for each place you add to the itinerary so you can include real name, address, rating, and hours.",
            "parameters": {
                "type": "object",
                "properties": {
                    "place_id": {
                        "type": "string",
                        "description": "Place ID from search_places",
                    },
                },
                "required": ["place_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_food_places",
            "description": "Search for restaurants/food venues by type of food and city. Use when the user wants a meal (e.g. 'sushi lunch', 'seafood dinner', 'breakfast') but did not name a specific place. Returns name, formatted_address, rating, user_ratings_total, place_id. If you're not sure which restaurant to add, call this, then in your response list the options with name, full address, and rating and ask the user which they prefer or if you should add the top-rated one.",
            "parameters": {
                "type": "object",
                "properties": {
                    "food_type": {
                        "type": "string",
                        "description": "Type of food or meal, e.g. 'sushi', 'seafood', 'breakfast', 'Italian', 'brunch'",
                    },
                    "location": {
                        "type": "string",
                        "description": "City or area, e.g. 'San Francisco', 'Napa'. Use trip destination when possible.",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Max results to return (default 5)",
                        "default": 5,
                    },
                },
                "required": ["food_type", "location"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_distance_matrix",
            "description": "Get travel distance and duration between origins and destinations. Use addresses or place names. Ensures the plan has realistic travel times between activities.",
            "parameters": {
                "type": "object",
                "properties": {
                    "origins": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of origin addresses or 'lat,lng'",
                    },
                    "destinations": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of destination addresses or 'lat,lng'",
                    },
                    "mode": {
                        "type": "string",
                        "description": "Travel mode: driving, walking, bicycling, transit",
                        "default": "driving",
                    },
                },
                "required": ["origins", "destinations"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_directions",
            "description": "Get a route between two places with estimated travel time and distance (Google Directions API). Use for roadtrip planning: driving/walking from origin to destination, optionally via waypoints. Returns total_duration_text, total_duration_seconds, total_distance_text, total_distance_meters, and legs (per segment). Prefer when user asks for a road trip, driving route, or 'how long to drive from X to Y'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {
                        "type": "string",
                        "description": "Start address, city name, or 'lat,lng' (e.g. 'San Francisco', 'NYC', '37.7749,-122.4194')",
                    },
                    "destination": {
                        "type": "string",
                        "description": "End address, city name, or 'lat,lng' (e.g. 'Los Angeles', 'Boston')",
                    },
                    "mode": {
                        "type": "string",
                        "description": "Travel mode: driving (default), walking, bicycling, transit",
                        "default": "driving",
                    },
                    "waypoints": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of intermediate stops (addresses or city names) for multi-stop roadtrips",
                    },
                },
                "required": ["origin", "destination"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_flights",
            "description": "Search for flight offers with real prices between origin and destination. Use when the user asks about flights, airline options, flight costs, or wants to add flights to the itinerary. Accepts city names (e.g. 'San Francisco', 'Paris') or IATA codes (SFO, PAR). Returns offers with price, currency, carrier, departure/arrival times. Always include the price for each flight in your response when the API returns it. After getting results, compare each flight's times with the current itinerary and clearly state conflicts (e.g. overlaps with lunch at 12 PM) or that it fits the schedule.",
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {
                        "type": "string",
                        "description": "Origin city or airport, e.g. 'San Francisco', 'SFO', 'NYC'",
                    },
                    "destination": {
                        "type": "string",
                        "description": "Destination city or airport, e.g. 'Paris', 'PAR', 'CDG'",
                    },
                    "departure_date": {
                        "type": "string",
                        "description": "Departure date in YYYY-MM-DD format",
                    },
                    "adults": {
                        "type": "integer",
                        "description": "Number of adult passengers (default 1)",
                        "default": 1,
                    },
                    "return_date": {
                        "type": "string",
                        "description": "Return date for round trip in YYYY-MM-DD (optional)",
                    },
                },
                "required": ["origin", "destination", "departure_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_hotels",
            "description": "Search for hotel offers with real prices in a city (Amadeus). Use when the user asks about hotels, accommodation, where to stay, or 'highly rated hotels'. Prefer this over search_places for any hotel query. Accepts city name or IATA code; use trip start/end dates for check_in and check_out when available. Always include the price for each hotel in your response when the API returns it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "City name or IATA code, e.g. 'San Francisco', 'Paris', 'NYC'",
                    },
                    "check_in": {
                        "type": "string",
                        "description": "Check-in date YYYY-MM-DD. Use the first day date from the trip itinerary when available.",
                    },
                    "check_out": {
                        "type": "string",
                        "description": "Check-out date YYYY-MM-DD. Use the last day date from the trip itinerary when available.",
                    },
                    "adults": {
                        "type": "integer",
                        "description": "Number of adults (default 1)",
                        "default": 1,
                    },
                },
                "required": ["city", "check_in", "check_out"],
            },
        },
    },
]


def _log_tool_result(name: str, arguments: dict[str, Any], out: dict[str, Any]) -> None:
    """Log API call args and result for debugging (Google Maps, Amadeus, etc.)."""
    try:
        result_str = json.dumps(out, indent=2, default=str)
        if len(result_str) > 3000:
            result_str = result_str[:3000] + "\n... (truncated)"
        logger.info(
            "[API] %s | args=%s | result=%s",
            name,
            json.dumps(arguments, default=str),
            result_str,
        )
    except Exception:
        logger.info("[API] %s | args=%s | result=(serialize failed)", name, arguments)


def _execute_tool(name: str, arguments: dict[str, Any]) -> str:
    """Run a single tool by name and return JSON string result for the LLM."""
    try:
        if name == "search_places":
            out = gp_search_places(
                query=arguments.get("query", ""),
                location=arguments.get("location"),
                max_results=int(arguments.get("max_results", 5)),
            )
            _log_tool_result(name, arguments, out)
        elif name == "search_food_places":
            food_type = (arguments.get("food_type") or "").strip()
            location = (arguments.get("location") or "").strip()
            if not food_type or not location:
                out = {"error": "food_type and location are required", "results": []}
            else:
                query = f"{food_type} restaurant {location}"
                out = gp_search_places(
                    query=query,
                    location=location,
                    max_results=int(arguments.get("max_results", 5)),
                )
            _log_tool_result(name, arguments, out)
        elif name == "get_place_details":
            out = gp_get_place_details(place_id=arguments.get("place_id", ""))
            _log_tool_result(name, arguments, out)
        elif name == "get_distance_matrix":
            out = gp_get_distance_matrix(
                origins=arguments.get("origins") or [],
                destinations=arguments.get("destinations") or [],
                mode=arguments.get("mode", "driving"),
            )
            _log_tool_result(name, arguments, out)
        elif name == "get_directions":
            out = gp_get_directions(
                origin=arguments.get("origin", ""),
                destination=arguments.get("destination", ""),
                mode=arguments.get("mode", "driving"),
                waypoints=arguments.get("waypoints"),
            )
            _log_tool_result(name, arguments, out)
        elif name == "search_flights":
            out = amadeus_search_flights(
                origin=arguments.get("origin", ""),
                destination=arguments.get("destination", ""),
                departure_date=arguments.get("departure_date", ""),
                adults=int(arguments.get("adults", 1)),
                return_date=arguments.get("return_date"),
                max_results=10,
            )
            _log_tool_result(name, arguments, out)
        elif name == "search_hotels":
            out = amadeus_search_hotels(
                city=arguments.get("city", ""),
                check_in=arguments.get("check_in", ""),
                check_out=arguments.get("check_out", ""),
                adults=int(arguments.get("adults", 1)),
                max_results=10,
            )
            _log_tool_result(name, arguments, out)
        else:
            out = {"error": f"Unknown tool: {name}"}
            _log_tool_result(name, arguments, out)
        return json.dumps(out)
    except Exception as e:
        logger.exception("Tool %s failed: %s", name, e)
        _log_tool_result(name, arguments, {"error": str(e)})
        return json.dumps({"error": str(e)})


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

JSON_ONLY_PROMPT = """Output ONLY a valid JSON array for the COMPLETE trip itinerary. Include ALL days and activities from the current itinerary in the context above, plus any additions you are making (e.g. flight times). No markdown, no code fence, no other text. Format: [{"id":"day-1","dayNumber":1,"title":"Day 1","date":"YYYY-MM-DD","activities":[{"id":"act-1","time":"9:00 AM","title":"Title","description":"","location":""}]}]. Each day: id, dayNumber, title, date (required, YYYY-MM-DD), activities. Each activity: id, time, title, description, location."""

TRIP_INFO_PREFIX = """=== CONTEXT ===
This conversation is about the trip "{name}".
Location (shown below the trip name on the trip card): {destination}. You can read and update this location. When the user asks to change where the trip is going (e.g. "change destination to Austin", "we're going to Napa instead"), output <destination>New location</destination> with the new city/area name so the app updates it.

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

ADD_TO_PLAN_RESOLVE_PROMPT = """You are resolving an "add to plan" action. The user tapped a button to add or replace an activity in their trip itinerary.

**Current itinerary (JSON):**
{current_itinerary_json}

**Suggested activity to add or replace:**
- title: {title}
- description: {description}
- location: {location}
- dayLabel: {day_label}
- time: {time}
- replaceActivityId: {replace_activity_id}
- replaceTitle: {replace_title}

**Your task — check the full sequence, not just the slot:**
1. Look at the target day and the **events before and after** the slot being added or replaced. Decide if the change makes sense in context.
2. **Conflicts to detect:**
   - Same time slot already has another activity, or times overlap.
   - **Logical/temporal conflicts with earlier or later events.** Examples:
     - Replacing an event at 10:00 AM with a "Flight lands at 10:00 AM" means the user cannot be elsewhere at 10. If there is an event **before** 10 (e.g. 9:00 AM "Meeting downtown" or "Breakfast at hotel"), that prior event may be impossible or may need to change/be removed (e.g. they can't be at a meeting at 9 if they're on a plane landing at 10).
     - Adding a "Flight departs 8:00 AM" when there is already a 9:00 AM activity elsewhere means the 9:00 AM event may need to move or be removed.
     - Adding a long activity (e.g. "Wine tasting 2–5 PM") when the next event is at 3 PM creates an overlap; the next event may need to move or be removed.
3. If there is **no conflict** (slot free and sequence still makes sense): output <resolution>add</resolution> and the full <itinerary> with the new/replaced activity.
4. If there **is** a conflict (same slot, overlap, or sequence doesn't make sense): output <resolution>conflict</resolution>, a clear <message> that mentions both the direct conflict and any **previous/next** events that need to change or be removed (e.g. "Flight lands at 10:00 AM conflicts with the 10:00 AM slot; the event before (9:00 AM Meeting) may need to be moved or removed."), and <resolution_options> as a JSON array. Each option must have "id" and "label". Always include: {{"id": "add_anyway", "label": "Add anyway"}} and {{"id": "cancel", "label": "Cancel"}}. For resolutions that fix the conflict, add options with "id", "label", and "itinerary" (the full resolved itinerary). Examples: {{"id": "remove_previous", "label": "Remove 9:00 AM event and add flight", "itinerary": [...]}}, {{"id": "move_previous", "label": "Move 9:00 AM event to after landing", "itinerary": [...]}}, {{"id": "move_new", "label": "Move flight to 2:00 PM", "itinerary": [...]}}.

**Output format (use only these tags):**
- No conflict: <resolution>add</resolution><itinerary>\\n```json\\n[full itinerary array]\\n```\\n</itinerary>
- Conflict: <resolution>conflict</resolution><message>Clear explanation including any prior/next events that need to change or be removed.</message><resolution_options>[JSON array of {{"id":"...","label":"..."}} or {{"id":"...","label":"...","itinerary":[...]}}]</resolution_options>

Itinerary format: list of days, each with id, dayNumber, title, date (optional), activities (list of id, time, title, description, location). Preserve existing activity ids when not replacing. Generate new id for new activities (e.g. act-1234567890-abc).
"""


def _call_add_to_plan_resolve_sync(
    current_itinerary: list[dict],
    suggestion: dict[str, Any],
    trip_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Call LLM to check add-to-plan conflicts and return either add itinerary or conflict + resolution options."""
    if not OPENROUTER_API_KEY:
        logger.warning("OpenRouter: no API key set for add-to-plan resolve")
        return {
            "action": "add",
            "itinerary": _apply_suggestion_to_itinerary(current_itinerary, suggestion),
        }
    try:
        from openai import OpenAI

        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY,
        )
        prompt = ADD_TO_PLAN_RESOLVE_PROMPT.format(
            current_itinerary_json=json.dumps(current_itinerary, indent=2),
            title=suggestion.get("title") or "",
            description=suggestion.get("description") or "",
            location=suggestion.get("location") or "",
            day_label=suggestion.get("dayLabel") or "",
            time=suggestion.get("time") or "",
            replace_activity_id=suggestion.get("replaceActivityId") or "",
            replace_title=suggestion.get("replaceTitle") or "",
        )
        api_messages = [
            {
                "role": "system",
                "content": "You output only the requested XML tags and JSON. No other text.",
            },
            {"role": "user", "content": prompt},
        ]
        response = client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=api_messages,
            max_tokens=4096,
            temperature=0.3,
        )
        if not response or not response.choices:
            return {
                "action": "add",
                "itinerary": _apply_suggestion_to_itinerary(
                    current_itinerary, suggestion
                ),
            }
        text = (response.choices[0].message.content or "").strip()
        return _parse_add_to_plan_resolve_response(text, current_itinerary, suggestion)
    except Exception as e:
        logger.exception("Add-to-plan resolve LLM error: %s", e)
        return {
            "action": "add",
            "itinerary": _apply_suggestion_to_itinerary(current_itinerary, suggestion),
        }


def _apply_suggestion_to_itinerary(
    current_itinerary: list[dict], suggestion: dict[str, Any]
) -> list[dict]:
    """Apply suggestion to itinerary using deterministic algorithm.
    Inserts new activities at the correct chronological position within the day.
    Uses dayLabel and time from the suggestion; does not rely on LLM placement."""
    new_act = {
        "id": f"act-{uuid.uuid4().hex[:12]}",
        "time": (suggestion.get("time") or "").strip() or None,
        "title": (suggestion.get("title") or "").strip() or "Activity",
        "description": (suggestion.get("description") or "").strip() or None,
        "location": (suggestion.get("location") or "").strip() or None,
    }
    replace_id = (suggestion.get("replaceActivityId") or "").strip()
    replace_title = (suggestion.get("replaceTitle") or "").strip()
    if replace_id or replace_title:
        for day in current_itinerary:
            for a in day.get("activities") or []:
                if (replace_id and a.get("id") == replace_id) or (
                    replace_title
                    and (a.get("title") or "").strip().lower() == replace_title.lower()
                ):
                    a.update(new_act)
                    a["id"] = a.get("id") or new_act["id"]
                    day["activities"] = _sort_activities_chronologically(
                        day.get("activities") or []
                    )
                    return current_itinerary
        # replace target not found, add to first day
        if current_itinerary:
            acts = current_itinerary[0].setdefault("activities", [])
            acts.append(new_act)
            current_itinerary[0]["activities"] = _sort_activities_chronologically(acts)
        else:
            current_itinerary = [
                {
                    "id": "day-1",
                    "dayNumber": 1,
                    "title": "Day 1",
                    "date": None,
                    "activities": [new_act],
                }
            ]
        return current_itinerary
    day_label = (suggestion.get("dayLabel") or "").strip().lower()
    target_day = None
    for d in current_itinerary:
        if day_label and (
            (d.get("title") or "").lower().find(day_label) >= 0
            or ((d.get("date") or "") or "").lower().find(day_label) >= 0
        ):
            target_day = d
            break
    if not target_day and current_itinerary:
        target_day = current_itinerary[0]
    if not target_day:
        return [
            {
                "id": "day-1",
                "dayNumber": 1,
                "title": "Day 1",
                "date": None,
                "activities": [new_act],
            }
        ]
    acts = target_day.setdefault("activities", [])
    acts.append(new_act)
    target_day["activities"] = _sort_activities_chronologically(acts)
    return current_itinerary


def _parse_add_to_plan_resolve_response(
    text: str, current_itinerary: list[dict], suggestion: dict[str, Any]
) -> dict[str, Any]:
    """Parse LLM response into action 'add' with itinerary or 'conflict' with message and resolutionOptions."""
    if not text:
        return {
            "action": "add",
            "itinerary": _apply_suggestion_to_itinerary(current_itinerary, suggestion),
        }
    resolution_match = re.search(
        r"<resolution>\s*(.+?)\s*</resolution>", text, re.DOTALL | re.IGNORECASE
    )
    resolution = (
        resolution_match.group(1).strip().lower() if resolution_match else ""
    ).replace(" ", "_")
    if resolution == "conflict":
        message_match = re.search(
            r"<message>\s*([\s\S]*?)\s*</message>", text, re.DOTALL | re.IGNORECASE
        )
        message = (
            message_match.group(1).strip()
            if message_match
            else "This time slot is already used."
        ).strip()
        options_match = re.search(
            r"<resolution_options>\s*([\s\S]*?)\s*</resolution_options>",
            text,
            re.DOTALL | re.IGNORECASE,
        )
        options_raw = (
            options_match.group(1).strip() if options_match else "[]"
        ).strip()
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", options_raw)
        if json_match:
            options_raw = json_match.group(1).strip()
        try:
            options_data = json.loads(options_raw)
        except json.JSONDecodeError:
            options_data = []
        if not isinstance(options_data, list):
            options_data = []
        resolution_options = []
        for opt in options_data:
            if not isinstance(opt, dict):
                continue
            oid = (opt.get("id") or "").strip()
            label = (opt.get("label") or "").strip()
            if not oid or not label:
                continue
            item = {"id": oid, "label": label}
            if (
                "itinerary" in opt
                and isinstance(opt["itinerary"], list)
                and len(opt["itinerary"]) > 0
            ):
                parsed = _parse_itinerary_json(json.dumps(opt["itinerary"]))
                if parsed:
                    item["itinerary"] = parsed
            resolution_options.append(item)
        if not resolution_options:
            resolution_options = [
                {"id": "add_anyway", "label": "Add anyway"},
                {"id": "cancel", "label": "Cancel"},
            ]
        return {
            "action": "conflict",
            "message": message,
            "resolutionOptions": resolution_options,
        }
    # resolution add or missing: try to extract itinerary
    itinerary_match = re.search(
        r"<itinerary>\s*([\s\S]*?)\s*</itinerary>", text, re.DOTALL | re.IGNORECASE
    )
    if itinerary_match:
        raw = itinerary_match.group(1).strip()
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
        raw = json_match.group(1).strip() if json_match else raw
        parsed = _parse_itinerary_json(raw)
        if parsed:
            return {"action": "add", "itinerary": parsed}
    return {
        "action": "add",
        "itinerary": _apply_suggestion_to_itinerary(current_itinerary, suggestion),
    }


def _call_openrouter_sync(
    messages: list[dict],
    extra_user_message: str | None = None,
    existing_itinerary: list[dict] | None = None,
    trip_info: dict[str, Any] | None = None,
    status_queue: queue.Queue[str] | None = None,
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
        max_tool_rounds = 25
        out = ""
        for _round in range(max_tool_rounds):
            if status_queue is not None:
                try:
                    status_queue.put_nowait(
                        "Planning your itinerary..."
                        if _round == 0
                        else "Writing your response..."
                    )
                except queue.Full:
                    pass
            logger.info(
                "OpenRouter: calling model=%s with %d messages (round %d)",
                OPENROUTER_MODEL,
                len(api_messages),
                _round + 1,
            )
            kwargs: dict[str, Any] = {
                "model": OPENROUTER_MODEL,
                "messages": api_messages,
                "max_tokens": 2048,
                "temperature": 0.7,
            }
            kwargs["tools"] = PLACES_TOOLS
            kwargs["tool_choice"] = "auto"
            response = client.chat.completions.create(**kwargs)
            if not response or not response.choices:
                break
            msg = response.choices[0].message
            if not msg:
                break
            if msg.content:
                out = (msg.content or "").strip()
            tool_calls = getattr(msg, "tool_calls", None) or []
            if not tool_calls:
                break
            # Append assistant message with tool_calls
            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": msg.content or None,
            }
            if tool_calls:
                assistant_msg["tool_calls"] = [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in tool_calls
                ]
            api_messages.append(assistant_msg)
            # Execute each tool and append tool results; push status for UI
            for tc in tool_calls:
                if status_queue is not None:
                    try:
                        if (
                            tc.function.name == "search_places"
                            or tc.function.name == "search_food_places"
                        ):
                            status_queue.put_nowait("Searching for places...")
                        elif tc.function.name == "get_place_details":
                            status_queue.put_nowait("Checking opening hours...")
                        elif tc.function.name == "get_distance_matrix":
                            status_queue.put_nowait("Getting travel times...")
                        elif tc.function.name == "get_directions":
                            status_queue.put_nowait("Getting route...")
                        elif tc.function.name == "search_flights":
                            status_queue.put_nowait("Searching for flights...")
                        elif tc.function.name == "search_hotels":
                            status_queue.put_nowait("Searching for hotels...")
                        else:
                            status_queue.put_nowait("Fetching info...")
                    except queue.Full:
                        pass
                try:
                    args = (
                        json.loads(tc.function.arguments)
                        if isinstance(tc.function.arguments, str)
                        else (tc.function.arguments or {})
                    )
                except json.JSONDecodeError:
                    args = {}
                result = _execute_tool(tc.function.name, args)
                api_messages.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": result}
                )
        if out:
            logger.info("OpenRouter: got response length=%d", len(out))
            return out
        logger.warning("OpenRouter: empty or no content on response")
        return "I couldn't generate a response. Please try again."
    except Exception as e:
        logger.exception("OpenRouter API error: %s", e)
        return f"Something went wrong while calling the AI: {str(e)}"


def _parse_suggestions(text: str) -> list[dict] | None:
    """Extract <suggestions> JSON array from AI response for add-to-plan options."""
    if not text:
        return None
    match = re.search(
        r"<suggestions>\s*([\s\S]*?)\s*</suggestions>", text, re.DOTALL | re.IGNORECASE
    )
    if not match:
        return None
    raw = match.group(1).strip()
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if json_match:
        raw = json_match.group(1).strip()
    try:
        data = json.loads(raw)
        if not isinstance(data, list) or len(data) == 0:
            return None
        out = []
        for item in data:
            if not isinstance(item, dict):
                continue
            title = item.get("title") or item.get("name") or ""
            if not title:
                continue
            out.append(
                {
                    "title": str(title),
                    "description": str(item.get("description", "")).strip() or None,
                    "location": str(item.get("location", "")).strip() or None,
                    "dayLabel": str(item.get("dayLabel", "")).strip() or None,
                    "time": str(item.get("time", "")).strip() or None,
                    "replaceActivityId": str(item.get("replaceActivityId", "")).strip()
                    or None,
                    "replaceTitle": str(item.get("replaceTitle", "")).strip() or None,
                }
            )
        return out if out else None
    except (json.JSONDecodeError, TypeError):
        return None


def _parse_destination(text: str) -> str | None:
    """Extract <destination>...</destination> from AI response. Returns stripped value or None."""
    if not text or not text.strip():
        return None
    match = re.search(
        r"<destination>\s*([\s\S]*?)\s*</destination>", text, re.DOTALL | re.IGNORECASE
    )
    if not match:
        return None
    value = (match.group(1) or "").strip()
    return value if value else None


def _parse_structured_response(
    text: str,
) -> tuple[str, list[dict] | None, list[dict] | None, str | None]:
    """
    Parse the AI's structured response. Returns (chat_message, itinerary_list_or_none, suggestions_list_or_none, destination_or_none).
    - If <action>respond</action>: return (content of <response>, None, suggestions if present, destination if present)
    - If <action>update_itinerary</action>: return (content of <response>, parsed itinerary list, suggestions if present, destination if present)
    - Fallback: return (raw text, extracted itinerary if any, None, destination if present)
    """
    if not text:
        return ("", None, None, None)
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
    destination = _parse_destination(text)
    action = (action_match.group(1).strip().lower() if action_match else "").replace(
        " ", "_"
    )
    response_text = response_match.group(1).strip() if response_match else text
    suggestions = _parse_suggestions(text)
    if action == "update_itinerary" and itinerary_match:
        itinerary_block = itinerary_match.group(1).strip()
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", itinerary_block)
        raw_json = json_match.group(1).strip() if json_match else itinerary_block
        parsed = _parse_itinerary_json(raw_json)
        return (response_text, parsed, suggestions, destination)
    if action == "respond" or action == "respond_only":
        return (response_text, None, suggestions, destination)
    # Fallback: no structured format, try to extract itinerary from raw response
    parsed = _extract_itinerary_from_response(text)
    return (text, parsed, None, destination)


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


def _parse_time_to_minutes(time_str: str) -> int:
    """Parse time string (e.g. '9:00 AM', '14:30', '6:00 PM') to minutes since midnight.
    Returns 9999 for unparseable so activities without times sort to the end."""
    if not time_str or not isinstance(time_str, str):
        return 9999
    s = time_str.strip().upper()
    if not s:
        return 9999
    # Match "9:00 AM", "9:00AM", "12:30 PM"
    m = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)?", s, re.IGNORECASE)
    if m:
        h, mn, ampm = int(m.group(1)), int(m.group(2)), (m.group(3) or "").upper()
        if ampm == "PM" and h != 12:
            h += 12
        elif ampm == "AM" and h == 12:
            h = 0
        elif not ampm and h < 24:
            pass  # 24h format
        elif not ampm and h >= 12:
            pass  # ambiguous, assume 24h
        return h * 60 + min(mn, 59)
    # Match "9 AM", "6 PM"
    m = re.match(r"(\d{1,2})\s*(AM|PM)", s, re.IGNORECASE)
    if m:
        h, ampm = int(m.group(1)), (m.group(2) or "").upper()
        if ampm == "PM" and h != 12:
            h += 12
        elif ampm == "AM" and h == 12:
            h = 0
        return h * 60
    return 9999


def _sort_activities_chronologically(activities: list[dict]) -> list[dict]:
    """Sort activities by time of day. Activities without time go at the end."""
    return sorted(activities, key=lambda a: _parse_time_to_minutes(a.get("time") or ""))


# --- Expenses and Bill Splitting ---


@app.get("/trips/{trip_id}/expenses")
def api_get_expenses(trip_id: str) -> list[dict[str, Any]]:
    """Get all expenses for a trip."""
    return get_expenses(trip_id)


@app.get("/trips/{trip_id}/members")
def api_get_trip_members(trip_id: str) -> list[dict[str, Any]]:
    """Get all members of a trip with their user details."""
    return get_trip_members(trip_id)


class AddExpenseBody(BaseModel):
    paid_by_user_id: str
    description: str
    amount: float
    expense_date: str
    currency: str = "USD"
    category: str | None = None
    receipt_image_url: str | None = None
    splits: list[dict[str, Any]] | None = None  # [{"user_id": str, "amount": float}]


@app.post("/trips/{trip_id}/expenses")
def api_add_expense(trip_id: str, body: AddExpenseBody) -> dict[str, Any]:
    """Add an expense to a trip with optional splits."""
    splits_tuples = None
    if body.splits:
        splits_tuples = [(s["user_id"], float(s["amount"])) for s in body.splits]

    expense = add_expense(
        trip_id=trip_id,
        paid_by_user_id=body.paid_by_user_id,
        description=body.description,
        amount=body.amount,
        expense_date=body.expense_date,
        currency=body.currency,
        category=body.category,
        receipt_image_url=body.receipt_image_url,
        splits=splits_tuples,
    )
    return expense


class UpdateExpenseBody(BaseModel):
    description: str | None = None
    amount: float | None = None
    expense_date: str | None = None


@app.patch("/expenses/{expense_id}")
def api_update_expense(expense_id: str, body: UpdateExpenseBody) -> dict[str, Any]:
    """Update an expense."""
    updated = update_expense(
        expense_id=expense_id,
        description=body.description,
        amount=body.amount,
        expense_date=body.expense_date,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Expense not found or no changes")
    return {"success": True}


@app.delete("/expenses/{expense_id}")
def api_delete_expense(expense_id: str) -> dict[str, Any]:
    """Delete an expense and its splits."""
    deleted = delete_expense(expense_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"success": True}


@app.get("/trips/{trip_id}/balances")
def api_get_trip_balances(trip_id: str) -> dict[str, Any]:
    """Calculate and return trip balances and suggested settlements."""
    return calculate_trip_balances(trip_id)


@app.post("/trips/{trip_id}/receipts/upload")
async def upload_receipt_and_ocr(
    trip_id: str,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """
    Upload a receipt image, save it, and use OpenRouter Gemini 2.0 Flash for OCR.
    Returns parsed receipt data (description, amount, date, items).
    """
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")

    # Generate unique filename
    file_ext = Path(file.filename or "receipt.jpg").suffix
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    file_path = RECEIPTS_DIR / unique_filename

    # Save file
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Convert image to base64 for OpenRouter
    import base64

    with open(file_path, "rb") as img_file:
        img_data = base64.b64encode(img_file.read()).decode("utf-8")

    # Determine mime type
    mime_type = file.content_type or "image/jpeg"
    if not mime_type.startswith("image/"):
        mime_type = "image/jpeg"

    # Call OpenRouter with Gemini 2.0 Flash for OCR
    try:
        from openai import OpenAI

        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=OPENROUTER_API_KEY,
        )

        response = client.chat.completions.create(
            model="google/gemini-2.0-flash-001",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """Analyze this receipt and extract the following information in JSON format:
{
  "merchant": "store/restaurant name",
  "total": 0.00,
  "date": "YYYY-MM-DD",
  "items": [
    {"name": "item name", "price": 0.00, "quantity": 1}
  ],
  "currency": "USD"
}

Return ONLY valid JSON, no other text.""",
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime_type};base64,{img_data}"},
                        },
                    ],
                }
            ],
            max_tokens=1000,
            temperature=0.2,
        )

        result_text = response.choices[0].message.content or ""

        # Try to parse JSON from response
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", result_text)
        if json_match:
            result_text = json_match.group(1).strip()

        try:
            parsed_data = json.loads(result_text)
        except json.JSONDecodeError:
            parsed_data = {
                "merchant": "Unknown",
                "total": 0.0,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "items": [],
                "currency": "USD",
            }

        receipt_url = f"/receipts/{unique_filename}"

        return {
            "receipt_url": receipt_url,
            "receipt_data": parsed_data,
        }

    except Exception as e:
        logger.exception("Receipt OCR failed: %s", e)
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


@app.get("/receipts/{filename}")
async def serve_receipt(filename: str) -> FileResponse:
    """Serve uploaded receipt images."""
    file_path = RECEIPTS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Receipt not found")
    return FileResponse(file_path)


@app.get("/trips/{trip_id}/receipts")
def api_get_trip_receipts(trip_id: str) -> list[dict[str, Any]]:
    """Get all receipts (expenses with receipt_image_url) for a trip."""
    expenses = get_expenses(trip_id)
    receipts = [e for e in expenses if e.get("receipt_image_url")]
    return receipts


def _parse_itinerary_json(raw: str) -> list[dict] | None:
    """Parse and normalize itinerary JSON string to our schema.
    Activities within each day are sorted chronologically by time."""
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
            activities = [
                {
                    "id": a.get("id") or f"act-{j + 1}",
                    "time": str(a.get("time", "")).strip() or None,
                    "title": str(a.get("title") or ""),
                    "description": str(a.get("description", "")).strip() or None,
                    "location": str(a.get("location", "")).strip() or None,
                }
                for j, a in enumerate(day.get("activities") or [])
                if isinstance(a, dict)
            ]
            activities = _sort_activities_chronologically(activities)
            out.append(
                {
                    "id": day.get("id") or f"day-{i + 1}",
                    "dayNumber": int(day.get("dayNumber", i + 1)),
                    "title": str(day.get("title") or f"Day {i + 1}"),
                    "date": str(day.get("date", "")).strip() or None,
                    "activities": activities,
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
                status_queue: queue.Queue[str] = queue.Queue()
                drain_task = asyncio.create_task(
                    _drain_status_queue(status_queue, room)
                )
                try:
                    ai_text = await asyncio.to_thread(
                        _call_openrouter_sync,
                        messages,
                        None,
                        existing_itinerary,
                        trip_info,
                        status_queue,
                    )
                except Exception as e:
                    logger.exception("OpenRouter: thread error %s", e)
                    ai_text = f"Something went wrong: {e}"
                finally:
                    drain_task.cancel()
                    try:
                        await drain_task
                    except asyncio.CancelledError:
                        pass
                chat_message, itinerary_list, suggestions_list, destination_update = (
                    _parse_structured_response(ai_text)
                )
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
                            None,
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
                if destination_update:
                    update_trip_destination(trip_id, destination_update)
                if itinerary_list:
                    set_itinerary(trip_id, json.dumps(itinerary_list))
                    payload_it = {
                        "type": "itinerary",
                        "trip_id": trip_id,
                        "itinerary": itinerary_list,
                    }
                    if destination_update:
                        payload_it["destination"] = destination_update
                    for ws in room:
                        try:
                            await ws.send_json(payload_it)
                        except Exception:
                            pass
                elif destination_update:
                    for ws in room:
                        try:
                            await ws.send_json(
                                {
                                    "type": "trip_update",
                                    "trip_id": trip_id,
                                    "destination": destination_update,
                                }
                            )
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
                message_payload = dict(ai_saved)
                if suggestions_list:
                    message_payload["suggestions"] = suggestions_list
                payload_ai = {"type": "message", "message": message_payload}
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
