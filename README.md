# Triply

![Render1d](https://github.com/user-attachments/assets/d2294511-d153-4dba-a777-833275b53b83)

**Get your trips out of group chats and into the real world.**

## About

Friends and families often discuss going on trips together, but due to the mundane tasks of finding locations, doing bookings, and finding the cheapest pricing, these trips never leave the group chats.

**Triply** lets users play an interactive role in planning their trips using AI. Instead of tediously searching various booking sites, we use Gemini AI and the Amadeus API to show users hotels and flights best fit for their planned trips.

All users need to do is **create the trip, invite their friends, and chat** with each other and the Gemini AI to generate an itinerary and a map. The AI automatically observes the conversation and alters the trip according to what users are looking for.

## Key Features

- **Zero-friction onboarding** - Just enter your name, no passwords
- **Real-time group chat** - Chat with friends and AI simultaneously
- **Agentic AI trip planning** - Gemini observes chat and autonomously plans trip details
- **Smart itinerary generation** - AI searches the web for attractions, restaurants, and more
- **Flight & hotel recommendations** - Amadeus API integration for bookings
- **Google Maps integration** - See travel routes, distances, and destination previews
- **Receipt splitting** - Gemini 2.0 Flash OCR parses receipts to split costs fairly
- **Interactive map** - Pin points showing all locations to visit

## Tech Stack

- **Frontend**: React Native + Expo
- **Backend**: Python FastAPI
- **AI**: Google Gemini API (chat, OCR, web search)
- **Booking APIs**: Amadeus API (flights & hotels)
- **Maps**: Google Maps API + New Places API
- **Platform**: iOS-first design

## Quick Start

1. Install dependencies

   ```bash
   npm install
   ```

2. Set up environment variables (create `.env.local`):

   ```bash
   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
   EXPO_PUBLIC_GEMINI_API_KEY=your_key_here
   EXPO_PUBLIC_CHAT_WS_BASE=http://YOUR_PC_IP:8000
   ```

3. Start Python backend (in separate terminal):

   ```bash
   cd backend
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

4. Start Expo dev server:

   ```bash
   npm start
   ```

In the output, you'll find options to open the app in:

- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [Expo Go](https://expo.dev/go)

## Running on Physical Device

### Option 1: LAN Connection (Recommended)

1. **Connect phone and computer to same Wi-Fi**

2. **Configure backend IP**:
   - Find your PC's IP: `ip addr` (Linux) or `ipconfig` (Windows)
   - Update `.env.local` with your machine's IP (not `localhost`):
     ```bash
     EXPO_PUBLIC_CHAT_WS_BASE=http://192.168.1.10:8000
     ```

3. **Allow firewall access** (if needed):
   ```bash
   sudo ufw allow 8081/tcp  # Expo Metro
   sudo ufw allow 8000/tcp  # Python backend
   ```

4. **Start app**:
   ```bash
   npm run start
   ```

5. **Scan QR code** with Expo Go using the LAN URL (`exp://192.168.x.x:8081`)

### Option 2: Tunnel Mode

If LAN doesn't work:

```bash
npx expo start --tunnel
```

Note: Requires `@expo/ngrok` (already in devDependencies) and may timeout due to network conditions.

## Project Structure

```
app/
├── (tabs)/              # Bottom tab navigation
│   ├── index.tsx        # Home screen
│   ├── trips.tsx        # Trips list
│   ├── create.tsx       # Create trip modal
│   └── profile.tsx      # User profile
├── trip/[id]/           # Dynamic trip routes
│   ├── index.tsx        # Trip detail (chat/plan/costs/map/album)
│   └── settings.tsx     # Trip settings
├── join/[tripId].tsx    # Join trip via invite link
└── onboarding.tsx       # Name input screen

backend/
├── main.py              # FastAPI server
└── ...                  # Python backend logic

components/
├── chat/                # Chat UI components
├── maps/                # Map components
└── ...                  # Shared components
```

## API Keys Setup

### Google Maps API
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable "Maps SDK for iOS" and "Directions API"
3. Create API key and add to `.env.local`

### Gemini API
1. Get key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Add to `.env.local` as `EXPO_PUBLIC_GEMINI_API_KEY`

### Amadeus API
1. Sign up at [Amadeus for Developers](https://developers.amadeus.com/)
2. Get API credentials for flight and hotel search

## Development

- This project uses [Expo Router](https://docs.expo.dev/router/introduction/) for file-based routing
- Python FastAPI backend handles real-time chat and AI integration
- iOS-first design with native feel (animations, haptics, polish)

## Important Notes

- This is a **hackathon project** - focus is on polish and demo, not production readiness
- **Never commit** `.env.local` or API keys to git
- Prioritize looks over functionality
- Target a 3-4 minute demo with a single happy path

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Maps](https://github.com/react-native-maps/react-native-maps)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)
- [Amadeus API Docs](https://developers.amadeus.com/self-service)
- [INSTRUCTION.md](./INSTRUCTION.md) - Full project spec and build instructions
