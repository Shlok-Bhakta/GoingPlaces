# Going Places Chat Backend

Custom Python backend for real-time multi-device chat. One room per trip; all devices connecting to the same `trip_id` share the same chat.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**AI assistant (@gemini in chat):** Uses OpenRouter (google/gemini-3-flash-preview). The `openai` package is required. Set `EXPO_PUBLIC_OPENROUTER_API_KEY` or `OPENROUTER_API_KEY` in the project’s `.env.local` (or in `backend/.env`) so the backend can call the AI when someone types @gemini.

## Run

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- **WebSocket**: `ws://localhost:8000/ws/{trip_id}?user_id=xxx&user_name=Alice`
- **REST (history)**: `GET http://localhost:8000/trips/{trip_id}/messages`
- **Health**: `GET http://localhost:8000/health`
- **4-digit join code**: `POST /register-code` body `{ "trip_id": "trip_1" }` → `{ "code": "1234" }`; `GET /resolve-code?code=1234` → `{ "trip_id": "trip_1" }`

## Protocol

1. **Connect** to `ws://<host>:8000/ws/<trip_id>?user_name=YourName` (optional: `user_id=...`).
2. Server sends `{"type": "history", "messages": [...]}` with existing messages.
3. **Send** a message: `{"content": "hello", "is_ai": false}`.
4. Server **broadcasts** to everyone in the room: `{"type": "message", "message": { "id", "trip_id", "user_id", "user_name", "content", "is_ai", "created_at" }}`.

Messages and trips are stored in SQLite (`goingplaces.db` in this folder). Set `DB_PATH` to override.

## Mobile / other devices

Use your machine’s LAN IP for the app (e.g. `EXPO_PUBLIC_CHAT_WS_URL=http://192.168.1.5:8000`). Ensure devices are on the same network and nothing blocks port 8000.
