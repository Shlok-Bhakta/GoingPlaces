"""
Amadeus API helpers for hotel and flight search.
Uses API key + secret from EXPO_PUBLIC_AMADEUS_API_KEY and EXPO_PUBLIC_AMADEUS_API_SECRET.
"""
import logging
import os
import time
from typing import Any

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://test.api.amadeus.com"
TOKEN_URL = f"{BASE_URL}/v1/security/oauth2/token"

_token_cache: dict[str, tuple[str, float]] = {}
TOKEN_EXPIRY_BUFFER = 60  # refresh 60s before expiry


def _get_credentials() -> tuple[str, str] | None:
    api_key = (
        os.environ.get("EXPO_PUBLIC_AMADEUS_API_KEY")
        or os.environ.get("AMADEUS_API_KEY")
    )
    api_secret = (
        os.environ.get("EXPO_PUBLIC_AMADEUS_API_SECRET")
        or os.environ.get("AMADEUS_API_SECRET")
    )
    if not api_key or not api_secret:
        return None
    return (api_key, api_secret)


def _get_access_token() -> str | None:
    creds = _get_credentials()
    if not creds:
        return None
    api_key, api_secret = creds
    cache_key = api_key
    now = time.time()
    if cache_key in _token_cache:
        token, expires_at = _token_cache[cache_key]
        if expires_at > now + TOKEN_EXPIRY_BUFFER:
            return token
    try:
        r = requests.post(
            TOKEN_URL,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "client_credentials",
                "client_id": api_key,
                "client_secret": api_secret,
            },
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        token = data.get("access_token")
        expires_in = int(data.get("expires_in", 1799))
        if token:
            _token_cache[cache_key] = (token, now + expires_in)
        return token
    except Exception as e:
        logger.exception("Amadeus token request failed: %s", e)
        return None


def _resolve_city_to_iata(city_or_code: str) -> str | None:
    """Convert city name (e.g. 'Paris', 'San Francisco') to IATA city/airport code."""
    city_or_code = (city_or_code or "").strip()
    if not city_or_code:
        return None
    if len(city_or_code) == 3 and city_or_code.isupper():
        return city_or_code
    token = _get_access_token()
    if not token:
        return None
    try:
        r = requests.get(
            f"{BASE_URL}/v1/reference-data/locations",
            params={
                "keyword": city_or_code,
                "subType": "CITY,AIRPORT",
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        for loc in (data.get("data") or [])[:5]:
            code = loc.get("iataCode") or loc.get("address", {}).get("cityCode")
            if code:
                return code
        return None
    except Exception as e:
        logger.warning("Amadeus location resolve failed for %r: %s", city_or_code, e)
        return None


def search_flights(
    origin: str,
    destination: str,
    departure_date: str,
    adults: int = 1,
    return_date: str | None = None,
    max_results: int = 10,
) -> dict[str, Any]:
    """
    Search for flight offers. Accepts city names or IATA codes.
    Dates in YYYY-MM-DD format.
    """
    if not _get_credentials():
        return {"error": "Amadeus API key not configured", "offers": []}
    origin_code = _resolve_city_to_iata(origin) or origin.upper()[:3]
    dest_code = _resolve_city_to_iata(destination) or destination.upper()[:3]
    token = _get_access_token()
    if not token:
        return {"error": "Failed to get Amadeus token", "offers": []}
    try:
        params: dict[str, str | int] = {
            "originLocationCode": origin_code,
            "destinationLocationCode": dest_code,
            "departureDate": departure_date,
            "adults": adults,
            "currencyCode": "USD",
        }
        if return_date:
            params["returnDate"] = return_date
        r = requests.get(
            f"{BASE_URL}/v2/shopping/flight-offers",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        offers_raw = data.get("data") or []
        offers = []
        for o in offers_raw[:max_results]:
            price = o.get("price", {})
            itin = (o.get("itineraries") or [{}])[0]
            segments = itin.get("segments") or []
            first = (segments[0] or {}).get("departure", {})
            last = (segments[-1] or {}).get("arrival", {}) if segments else {}
            carrier = (segments[0] or {}).get("carrierCode", "") if segments else ""
            offers.append({
                "id": o.get("id"),
                "price": price.get("total"),
                "currency": price.get("currency", "USD"),
                "departure": first.get("at"),
                "arrival": last.get("at"),
                "carrier": carrier,
                "segments_count": len(segments),
            })
        return {"offers": offers, "origin": origin_code, "destination": dest_code}
    except requests.RequestException as e:
        err_body = ""
        if hasattr(e, "response") and e.response is not None:
            try:
                err_body = e.response.text
            except Exception:
                pass
        logger.exception("Amadeus flight search failed: %s %s", e, err_body)
        return {"error": str(e), "offers": []}


def _get_hotel_ids_by_city(city_code: str, token: str, limit: int = 20) -> list[str]:
    """Get Amadeus hotel IDs for a city via Hotel List API (required for v3 hotel-offers)."""
    try:
        r = requests.get(
            f"{BASE_URL}/v1/reference-data/locations/hotels/by-city",
            params={"cityCode": city_code},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        hotel_ids: list[str] = []
        for item in (data.get("data") or [])[:limit]:
            hid = item.get("hotelId") or item.get("id")
            if hid and len(str(hid)) == 8:
                hotel_ids.append(str(hid))
        return hotel_ids
    except Exception as e:
        logger.warning("Amadeus hotel list by city failed for %r: %s", city_code, e)
        return []


def search_hotels(
    city: str,
    check_in: str,
    check_out: str,
    adults: int = 1,
    max_results: int = 10,
) -> dict[str, Any]:
    """
    Search for hotel offers in a city. Uses Hotel List API + Hotel Search v3 (v2 cityCode endpoint is deprecated).
    Accepts city name or IATA code. Dates in YYYY-MM-DD format.
    """
    if not _get_credentials():
        return {"error": "Amadeus API key not configured", "hotels": []}
    city_code = _resolve_city_to_iata(city) or city.upper()[:3]
    token = _get_access_token()
    if not token:
        return {"error": "Failed to get Amadeus token", "hotels": []}
    hotel_ids = _get_hotel_ids_by_city(city_code, token, limit=20)
    if not hotel_ids:
        return {"hotels": [], "city": city_code, "error": "No hotels found for this city"}
    try:
        # v3 requires hotelIds and adults; cityCode/lat/long removed
        r = requests.get(
            f"{BASE_URL}/v3/shopping/hotel-offers",
            params={
                "hotelIds": ",".join(hotel_ids[:20]),
                "adults": adults,
                "checkInDate": check_in,
                "checkOutDate": check_out,
                "currency": "USD",
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
        hotels_raw = data.get("data") or []
        hotels = []
        for h in hotels_raw[:max_results]:
            hotel_info = h.get("hotel", {})
            offers_list = h.get("offers") or []
            best_price = None
            best_currency = "USD"
            for off in offers_list:
                p = off.get("price", {})
                if p and p.get("total"):
                    best_price = p.get("total")
                    best_currency = p.get("currency", "USD")
                    break
            hotels.append({
                "hotelId": hotel_info.get("hotelId"),
                "name": hotel_info.get("name"),
                "chainCode": hotel_info.get("chainCode"),
                "price": best_price,
                "currency": best_currency,
            })
        return {"hotels": hotels, "city": city_code}
    except requests.RequestException as e:
        err_body = ""
        if hasattr(e, "response") and e.response is not None:
            try:
                err_body = e.response.text
            except Exception:
                pass
        logger.exception("Amadeus hotel search failed: %s %s", e, err_body)
        return {"error": str(e), "hotels": []}
