# Going Places

![Render1d](https://github.com/user-attachments/assets/d2294511-d153-4dba-a777-833275b53b83)

**Get your trips out of group chats and into the real world.**

A hackathon project that transforms chaotic group chat trip planning into organized, actionable travel plans. Share a link, chat with friends, let AI help coordinate, and make it happen.

## Features

- **Zero-friction onboarding** - Just enter your name, no passwords or OAuth
- **Real-time group chat** - Powered by Convex for instant sync
- **AI trip assistant** - Gemini AI helps coordinate plans naturally in chat
- **Smart trip planning** - Itineraries, dates, destinations, cost splitting
- **Google Maps integration** - Route planning, directions, and POI markers
- **Receipt tracking** - Split costs fairly among group members
- **Shared photo albums** - Collect memories from your trip

## Tech Stack

- **Frontend**: React Native + Expo
- **Backend**: Convex (serverless, real-time)
- **AI**: Google Gemini API
- **Maps**: Google Maps (react-native-maps)
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
   EXPO_PUBLIC_CONVEX_URL=your_convex_url_here
   EXPO_PUBLIC_CHAT_WS_BASE=http://YOUR_PC_IP:8000
   ```

3. Start Convex backend (in separate terminal):

   ```bash
   npx convex dev
   ```

4. Start Expo dev server:

   ```bash
   npm start
   ```

5. Start Python backend (in separate terminal):

   ```bash
   cd backend
   uvicorn main:app --host 0.0.0.0 --port 8000
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

convex/
├── schema.ts            # Database schema
├── users.ts             # User queries/mutations
├── trips.ts             # Trip queries/mutations
└── messages.ts          # Chat queries/mutations
```

## API Keys Setup

### Google Maps API
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable "Maps SDK for iOS" and "Directions API"
3. Create API key and add to `.env.local`

### Gemini API
1. Get key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Add to `.env.local` as `EXPO_PUBLIC_GEMINI_API_KEY`

### Convex
1. Run `npx convex dev` to initialize
2. Will auto-generate `CONVEX_DEPLOYMENT` in `.env.local`

## Development

- This project uses [Expo Router](https://docs.expo.dev/router/introduction/) for file-based routing
- Real-time sync powered by [Convex](https://docs.convex.dev/)
- iOS-first design with native feel (animations, haptics, polish)

## Important Notes

- This is a **hackathon project** - focus is on polish and demo, not production readiness
- **Never commit** `.env.local` or API keys to git
- Prioritize looks over functionality
- Target a 3-4 minute demo with a single happy path

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Convex Documentation](https://docs.convex.dev/)
- [React Native Maps](https://github.com/react-native-maps/react-native-maps)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)
- [INSTRUCTION.md](./INSTRUCTION.md) - Full project spec and build instructions
