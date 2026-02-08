"""
Google Maps/Places API helpers for trip planning: search places, place details (hours), distance matrix.
Uses legacy Places API and Distance Matrix API; key from EXPO_PUBLIC_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY.
"""

import logging
import os
from typing import Any
from urllib.parse import quote_plus
import requests

logger = logging.getLogger(__name__)

BASE_PLACES = "https://maps.googleapis.com/maps/api/place"
BASE_DISTANCE = "https://maps.googleapis.com/maps/api/distancematrix/json"
BASE_GEOCODE = "https://maps.googleapis.com/maps/api/geocode/json"


def _get_api_key() -> str | None:
    return os.environ.get("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY") or os.environ.get(
        "GOOGLE_MAPS_API_KEY"
    )


def search_places(
    query: str, location: str | None = None, max_results: int = 5
) -> dict[str, Any]:
    """
    Text search for places (e.g. "coffee shop San Francisco", "Golden Gate Bridge").
    Returns list of places with place_id, name, formatted_address, and optionally location bias.
    """
    key = _get_api_key()
    if not key:
        return {"error": "Google Maps API key not configured", "results": []}
    query = (query or "").strip()
    if not query:
        return {"error": "query is required", "results": []}
    try:
        params: dict[str, str | int] = {"query": query, "key": key}
        if location:
            params["location"] = (
                location  # optional bias, e.g. "37.7749,-122.4194" or "San Francisco"
            )
        url = f"{BASE_PLACES}/textsearch/json"
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data.get("status") != "OK" and data.get("status") != "ZERO_RESULTS":
            return {"error": data.get("status", "UNKNOWN"), "results": []}
        results = []
        for i, p in enumerate((data.get("results") or [])[:max_results]):
            results.append(
                {
                    "place_id": p.get("place_id"),
                    "name": p.get("name"),
                    "formatted_address": p.get("formatted_address"),
                    "vicinity": p.get("vicinity"),
                    "rating": p.get("rating"),
                    "user_ratings_total": p.get("user_ratings_total"),
                }
            )
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
        url = f"{BASE_PLACES}/details/json"
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
                    row_data.append(
                        {"status": el.get("status"), "distance": None, "duration": None}
                    )
                else:
                    d = el.get("distance") or {}
                    dur = el.get("duration") or {}
                    row_data.append(
                        {
                            "distance": {
                                "text": d.get("text"),
                                "value_meters": d.get("value"),
                            },
                            "duration": {
                                "text": dur.get("text"),
                                "value_seconds": dur.get("value"),
                            },
                        }
                    )
            rows.append(row_data)
        return {
            "rows": rows,
            "origin_addresses": data.get("origin_addresses", []),
            "destination_addresses": data.get("destination_addresses", []),
        }
    except requests.RequestException as e:
        logger.exception("Distance matrix failed: %s", e)
        return {"error": str(e), "rows": []}
    except Exception as e:
        logger.exception("Distance matrix error: %s", e)
        return {"error": str(e), "rows": []}


def geocode_address(address: str) -> dict[str, Any]:
    """
    Convert an address or place name to latitude/longitude coordinates.
    Returns lat, lng, and formatted_address.
    """
    key = _get_api_key()
    if not key:
        return {"error": "Google Maps API key not configured"}
    address = (address or "").strip()
    if not address:
        return {"error": "address is required"}
    try:
        params = {"address": address, "key": key}
        r = requests.get(BASE_GEOCODE, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data.get("status") != "OK":
            return {"error": data.get("status", "UNKNOWN")}
        results = data.get("results") or []
        if not results:
            return {"error": "No results found"}
        result = results[0]
        location = result.get("geometry", {}).get("location", {})
        return {
            "lat": location.get("lat"),
            "lng": location.get("lng"),
            "formatted_address": result.get("formatted_address"),
        }
    except requests.RequestException as e:
        logger.exception("Geocoding failed: %s", e)
        return {"error": str(e)}
    except Exception as e:
        logger.exception("Geocoding error: %s", e)
        return {"error": str(e)}
    except Exception as e:
        logger.exception("Distance matrix error: %s", e)
        return {"error": str(e), "rows": []}
