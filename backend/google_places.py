"""
Google Maps/Places API helpers for trip planning: search places, place details (hours), distance matrix.
Uses Places API (New) for text search; legacy for details/distance; key from EXPO_PUBLIC_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY.
"""
import logging
import os
import re
from typing import Any
from urllib.parse import quote_plus
import requests

logger = logging.getLogger(__name__)

# Places API (New) – text search (legacy endpoint disabled by Google for new projects)
BASE_PLACES_NEW = "https://places.googleapis.com/v1/places:searchText"
# Legacy (for details and distance matrix)
BASE_PLACES_LEGACY = "https://maps.googleapis.com/maps/api/place"
BASE_DISTANCE = "https://maps.googleapis.com/maps/api/distancematrix/json"
BASE_DIRECTIONS = "https://maps.googleapis.com/maps/api/directions/json"


def _get_api_key() -> str | None:
    return os.environ.get("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_MAPS_API_KEY")


def _parse_lat_lng(location: str) -> tuple[float, float] | None:
    """Parse 'lat,lng' or 'lat, lng' into (lat, lng) or None."""
    if not location or not isinstance(location, str):
        return None
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$", location.strip())
    if m:
        return (float(m.group(1)), float(m.group(2)))
    return None


def search_places(query: str, location: str | None = None, max_results: int = 5) -> dict[str, Any]:
    """
    Text search for places using Places API (New) (e.g. "coffee shop San Francisco", "Golden Gate Bridge").
    Returns list of places with place_id, name, formatted_address, rating when available.
    """
    key = _get_api_key()
    if not key:
        return {"error": "Google Maps API key not configured", "results": []}
    query = (query or "").strip()
    if not query:
        return {"error": "query is required", "results": []}
    try:
        body: dict[str, Any] = {
            "textQuery": query,
            "pageSize": min(max(1, max_results), 20),
        }
        coords = _parse_lat_lng(location) if location else None
        if coords:
            body["locationBias"] = {
                "circle": {
                    "center": {"latitude": coords[0], "longitude": coords[1]},
                    "radius": 50000.0,
                }
            }
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount",
        }
        r = requests.post(BASE_PLACES_NEW, json=body, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.json()
        places_raw = data.get("places") or []
        results = []
        for p in places_raw[:max_results]:
            place_id = p.get("id") or ""
            if place_id.startswith("places/"):
                place_id = place_id[7:]
            display = p.get("displayName") or {}
            name = display.get("text") if isinstance(display, dict) else str(display)
            results.append({
                "place_id": place_id,
                "name": name,
                "formatted_address": p.get("formattedAddress"),
                "vicinity": p.get("formattedAddress"),
                "rating": p.get("rating"),
                "user_ratings_total": p.get("userRatingCount"),
            })
        return {"results": results}
    except requests.RequestException as e:
        logger.exception("Places text search failed: %s", e)
        return {"error": str(e), "results": []}
    except Exception as e:
        logger.exception("Places text search error: %s", e)
        return {"error": str(e), "results": []}


def get_place_details(place_id: str) -> dict[str, Any]:
    """
    Get details for a place by place_id, including opening_hours (weekday_text) when available.
    """
    key = _get_api_key()
    if not key:
        return {"error": "Google Maps API key not configured"}
    place_id = (place_id or "").strip()
    if not place_id:
        return {"error": "place_id is required"}
    try:
        params = {
            "place_id": place_id,
            "fields": "name,formatted_address,opening_hours,vicinity,rating,user_ratings_total",
            "key": key,
        }
        url = f"{BASE_PLACES_LEGACY}/details/json"
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data.get("status") != "OK":
            return {"error": data.get("status", "UNKNOWN")}
        result = data.get("result") or {}
        out = {
            "place_id": place_id,
            "name": result.get("name"),
            "formatted_address": result.get("formatted_address"),
            "vicinity": result.get("vicinity"),
            "rating": result.get("rating"),
            "user_ratings_total": result.get("user_ratings_total"),
        }
        opening = result.get("opening_hours")
        if opening is not None:
            out["open_now"] = opening.get("open_now")
            out["weekday_text"] = opening.get("weekday_text") or []
        else:
            out["open_now"] = None
            out["weekday_text"] = []
        return out
    except requests.RequestException as e:
        logger.exception("Place details failed: %s", e)
        return {"error": str(e)}
    except Exception as e:
        logger.exception("Place details error: %s", e)
        return {"error": str(e)}


def get_distance_matrix(
    origins: list[str],
    destinations: list[str],
    mode: str = "driving",
) -> dict[str, Any]:
    """
    Get travel distance and duration between origins and destinations.
    origins and destinations can be addresses or "lat,lng" or place_id (prefix with place_id:).
    mode: driving, walking, bicycling, transit.
    Returns rows of elements: distance.text, distance.value (meters), duration.text, duration.value (seconds).
    """
    key = _get_api_key()
    if not key:
        return {"error": "Google Maps API key not configured", "rows": []}
    if not origins or not destinations:
        return {"error": "origins and destinations are required", "rows": []}
    try:
        # API accepts pipe-separated origins/destinations
        origins_str = "|".join(quote_plus(o) for o in origins)
        destinations_str = "|".join(quote_plus(d) for d in destinations)
        params = {
            "origins": origins_str,
            "destinations": destinations_str,
            "mode": mode,
            "key": key,
        }
        r = requests.get(BASE_DISTANCE, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        if data.get("status") != "OK":
            return {"error": data.get("status", "UNKNOWN"), "rows": []}
        rows = []
        for row in data.get("rows") or []:
            row_data = []
            for el in row.get("elements") or []:
                if el.get("status") != "OK":
                    row_data.append({"status": el.get("status"), "distance": None, "duration": None})
                else:
                    d = el.get("distance") or {}
                    dur = el.get("duration") or {}
                    row_data.append({
                        "distance": {"text": d.get("text"), "value_meters": d.get("value")},
                        "duration": {"text": dur.get("text"), "value_seconds": dur.get("value")},
                    })
            rows.append(row_data)
        return {"rows": rows, "origin_addresses": data.get("origin_addresses", []), "destination_addresses": data.get("destination_addresses", [])}
    except requests.RequestException as e:
        logger.exception("Distance matrix failed: %s", e)
        return {"error": str(e), "rows": []}
    except Exception as e:
        logger.exception("Distance matrix error: %s", e)
        return {"error": str(e), "rows": []}


def get_directions(
    origin: str,
    destination: str,
    mode: str = "driving",
    waypoints: list[str] | None = None,
) -> dict[str, Any]:
    """
    Get a route between two places with estimated travel time and distance (Google Directions API).
    Use for roadtrip planning: driving/walking/bicycling from A to B, optionally via waypoints.
    origin and destination can be addresses, "lat,lng", or place_id (prefix with place_id:).
    mode: driving (default), walking, bicycling, transit.
    waypoints: optional list of intermediate stops (addresses or place_id:...).
    Returns total duration (text + seconds), total distance (text + meters), and legs (per segment).
    """
    key = _get_api_key()
    if not key:
        return {"error": "Google Maps API key not configured"}
    origin = (origin or "").strip()
    destination = (destination or "").strip()
    if not origin or not destination:
        return {"error": "origin and destination are required"}
    try:
        params: dict[str, Any] = {
            "origin": origin,
            "destination": destination,
            "mode": mode.lower() if mode else "driving",
            "key": key,
        }
        if waypoints:
            params["waypoints"] = "|".join(quote_plus(w.strip()) for w in waypoints if (w or "").strip())
        r = requests.get(BASE_DIRECTIONS, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        status = data.get("status")
        if status != "OK":
            return {"error": status, "routes": []}
        routes = data.get("routes") or []
        if not routes:
            return {"error": "No route found", "routes": []}
        route = routes[0]
        legs = route.get("legs") or []
        total_duration_seconds = 0
        total_distance_meters = 0
        legs_out = []
        for leg in legs:
            dur = leg.get("duration") or {}
            dist = leg.get("distance") or {}
            total_duration_seconds += int(dur.get("value") or 0)
            total_distance_meters += int(dist.get("value") or 0)
            legs_out.append({
                "start_address": leg.get("start_address"),
                "end_address": leg.get("end_address"),
                "duration_text": dur.get("text"),
                "duration_seconds": dur.get("value"),
                "distance_text": dist.get("text"),
                "distance_meters": dist.get("value"),
            })
        # Google doesn't return total duration/distance in the response; we sum legs
        total_duration_text = _format_duration(total_duration_seconds)
        total_distance_text = _format_distance(total_distance_meters)
        return {
            "origin": origin,
            "destination": destination,
            "mode": params["mode"],
            "total_duration_text": total_duration_text,
            "total_duration_seconds": total_duration_seconds,
            "total_distance_text": total_distance_text,
            "total_distance_meters": total_distance_meters,
            "legs": legs_out,
        }
    except requests.RequestException as e:
        logger.exception("Directions request failed: %s", e)
        return {"error": str(e)}
    except Exception as e:
        logger.exception("Directions error: %s", e)
        return {"error": str(e)}


def _format_duration(seconds: int) -> str:
    """Format seconds as human-readable duration (e.g. '2 hours 15 mins')."""
    if seconds < 60:
        return f"{seconds} sec"
    mins, secs = divmod(seconds, 60)
    if mins < 60:
        return f"{mins} min" if secs == 0 else f"{mins} min {secs} sec"
    hours, mins = divmod(mins, 60)
    if mins == 0:
        return f"{hours} hour" if hours == 1 else f"{hours} hours"
    return f"{hours} h {mins} min"


def _format_distance(meters: int) -> str:
    """Format meters as human-readable distance (km or mi would need locale; use km for consistency)."""
    if meters < 1000:
        return f"{meters} m"
    km = meters / 1000.0
    if km < 1:
        return f"{meters} m"
    return f"{km:.1f} km" if km < 10 else f"{int(round(km))} km"
