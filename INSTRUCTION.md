# Going Places App

Getting your trips out of the group chats and into the real world. This is a proof of concept for an app that can take those pesky group chat messages that lead to nowhere into something that can actually take form in the real world. This is a Hackathon idea. I cannot stress this enough. Please do not focus on making anything production ready. It needs to be as pretty as possible. Security vulnerabilities are fine, the only thing is do not commit api keys because companies will deactivate the key and it's annoying. Looks > Functionality. Focus on a happy path for a 3-4 min demo; everything else is to give the illusion that the code is stable and functional.

## Tech Stack

- **Backend**: Convex (handles real-time chat, data sync, all that serverless goodness)
- **Maps**: Google Maps via `react-native-maps` (free for mobile apps, works in iOS simulator, better POI data)
- **AI**: Gemini API for chat assistant
- **Auth**: NONE - just ask for first/last name on onboarding, super simple
- **Platform**: iOS-first, React Native with Expo
- **Component Style**: Build components as needed per screen (no upfront design system)
- **Data Flow**: Real data flows from the start (Convex queries/mutations, real API calls)

## Concept

Start by creating a link and sending it to your friends in an existing group chat. Everyone clicks and is onboarded with just their name (no passwords, no OAuth BS). A group chat is created for the people. As the chat is taking place we can have an AI assistant meaningfully join into the chat to finalize some decisions and create an action plan to create a trip plan for as little cost as possible. The AI should chat every now and then as another "person" to join in and create a proper action plan. We need this model to then go in and find those exact listings and link the things to buy. If one person buys the tickets then cost needs to be negotiated among everyone. So maybe one person buys tickets, one person buys meals during the trip. All receipts are properly tallied and a cost breakdown is generated for the whole trip starting at when friends meet up to the gas travel prices and until the very end where photos can be shared among friends, an album is created and the trip can be called a success.

## Key Integrations

- **Google Maps** - Free for mobile apps (28k map loads/month free tier), works in iOS simulator, proper pathfinding/directions API, rich POI data
- **Clean chat interface** - Typing indicators, real-time updates via Convex
- **Super simple onboarding** - Just first/last name, no passwords
- **iOS-native feel** - Modern iOS components, native animations, polished AF, custom Google Maps styling to match iOS aesthetic
- **AI chat assistant** - Gemini API that feels like another group member
- **Mock Ticketmaster** - Fake event listings for demo purposes

## Features (prioritized for demo)

### MVP for 3-4 min demo:
1. **Simple name-based onboarding** (no auth, just first/last name)
2. **Real-time group chat** (Convex backend)
3. **AI assistant in chat** (Gemini API)
4. **Trip planning interface** with dates, destination
5. **Google Maps integration** with proper routing/pathfinding
6. **iOS-native polish** - animations, haptics, native components

### Nice-to-haves (if time permits):
- Shared calendar for "when to meet"
- Cost splitting with receipt uploads
- Shared photo album
- Mock Ticketmaster event integration
- Points of Interest markers on map
- Gas/charging/food suggestions along route

## Global UI

- iOS-style: rounded cards, bottom tab bar, clean whitespace, subtle animations
- Bottom tabs: **Home / Trips / Create / Profile**
- Prioritize a single happy path for a 3–4 minute demo
- Light mode only (ignore dark mode for hackathon)

## 1) Onboarding

**Screens**

- Welcome screen with app logo and tagline
- Simple form: "What's your name?" (first + last name fields)
- Optional: pick an avatar/emoji (or generate initials-based avatar)
- Done! No passwords, no email, no OAuth complexity

**Behavior**
- Store name locally + in Convex
- Generate a simple user ID
- Smooth transition to Home screen

## 2) Home

**Content**

- Search bar: "Search events, places, trips…"
- "Recommended" carousel (popular local events / weekend ideas)
- "Trending trips" list (templates users can copy)

**Actions**
- Tap an item → preview sheet with CTA "Start a trip"

## 3) Trips

**Sections**

- Current trips (cards with status: Planning/Booked/Live/Done)
- Past trips (cards with cover photo + recap tag)

**Actions**
- Tap trip → Trip page (Chat/Plan/Costs/Map/Album)

## 4) Create Trip Flow (modal, 3–4 steps)

1. **Basics**: trip name, dates (optional), starting city
2. **Destination/Event**: search + select destination, optional mock event from "Ticketmaster"
3. **Generate Plan**: button "Generate with AI" → shows a draft itinerary + suggestions
4. **Invite**: shareable link + list of joined/pending members → "Go to Trip"

**Note**: Users can skip all inputs and just start chatting! The AI assistant will naturally ask questions in the chat to figure out trip details. The AI should NOT be obtrusive or annoying; it needs to feel like a real member of the group who's just trying to help plan.

## 5) Trip Page Tabs

**Layout**

- Header: "Your Trips"
- Search bar (optional): "Search trips…"
- Two sections:
  - **Current Trip(s)** (top)
  - **Past Trips** (below)

**Trip Cards (both sections)**
Each card shows:

- Trip cover image (destination photo/gradient)
- Trip name + date range
- Destination (city) + status pill (Planning/Booked/Live/Done)
- Avatar stack of members (+N)
- Small "next action" hint (optional): "Pick lodging", "Split receipts", etc.

**Actions**

- Tap a card → opens **Trip Details** for that trip
- Long-press or "…" menu (optional): Share invite link, Archive, Duplicate

---

## Trip Details (inside a selected trip)

**Top area:**
- Trip header (cover, name, dates, members, invite button)

**Bottom tabs (modern iOS style):**
- **Chat** - Real-time group chat with AI assistant
- **Plan** - Itinerary, events, bookings
- **Costs** - Bill splitting, receipts, budget tracking
- **Map** - Google Maps with route, POIs, pathfinding
- **Album** - Shared photos from the trip

## 6) Profile

- Avatar + name
- Settings: notifications toggle, default maps app, theme (light only for demo)

## Demo Flow (3-4 minutes)

1. **Start**: Open app → onboarding (name only) → Home screen
2. **Create Trip**: Tap Create → quick trip details → generate with AI → invite link
3. **Chat**: Show real-time chat with friends + AI assistant helping plan
4. **Map**: Switch to Map tab → show route with pathfinding and POIs
5. **Costs** (optional): Quick look at bill splitting feature
6. **Finish**: Emphasize the polish, animations, and iOS-native feel

**Key to success**: Make it LOOK amazing. Smooth animations, haptic feedback, iOS-native components. The judges should think "wow, this looks like a real iOS app."

---

## Technical Setup (FOLLOW EXACTLY)

### Dependencies to Install

```bash
# Convex backend
npm install convex

# Google Maps
npm install react-native-maps

# Environment variables (Expo compatible)
npm install dotenv
```

### Environment Variables Setup

1. Create `.env.local` file in project root (DO NOT COMMIT THIS FILE):
```env
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
EXPO_PUBLIC_GEMINI_API_KEY=your_key_here
EXPO_PUBLIC_CONVEX_URL=your_convex_url_here
```

2. Add to `.gitignore`:
```
.env.local
.env
```

3. **Important**: Expo requires `EXPO_PUBLIC_` prefix for environment variables to be accessible in the app
4. Access in code: `process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`

### Convex Setup

1. Initialize Convex:
```bash
npx convex dev
```

2. This will:
   - Open browser for login/signup
   - Create `convex/` folder
   - Generate `.env.local` with `CONVEX_DEPLOYMENT` variable
   - Start dev server

3. Run in separate terminal during development (keep it running)

4. Convex folder structure:
```
convex/
  ├── schema.ts          # Database schema
  ├── users.ts           # User queries/mutations
  ├── trips.ts           # Trip queries/mutations
  ├── messages.ts        # Chat queries/mutations
  └── _generated/        # Auto-generated (don't edit)
```

### Google Maps Setup

1. Get API key:
   - Go to https://console.cloud.google.com/
   - Create new project or select existing
   - Enable "Maps SDK for iOS" and "Directions API"
   - Create credentials → API Key
   - Restrict key to iOS apps (optional for hackathon)

2. Add to `app.json`:
```json
{
  "expo": {
    "ios": {
      "config": {
        "googleMapsApiKey": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

3. Use in React Native:
```tsx
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

<MapView provider={PROVIDER_GOOGLE} />
```

### Gemini API Setup

1. Get API key:
   - Go to https://aistudio.google.com/app/apikey
   - Create API key
   - Add to `.env.local` as `EXPO_PUBLIC_GEMINI_API_KEY`

2. Use Gemini in chat:
   - Call from Convex backend function (server-side)
   - Or call directly from React Native (client-side for hackathon is fine)

### Navigation Structure

**Replace existing tabs with:**
- `app/(tabs)/index.tsx` → Home screen
- `app/(tabs)/trips.tsx` → Trips list screen (NEW)
- `app/(tabs)/create.tsx` → Create trip modal (NEW)
- `app/(tabs)/profile.tsx` → Profile screen (NEW)

**Remove:**
- `app/(tabs)/explore.tsx` (not needed)

**Add:**
- `app/onboarding.tsx` → Name input screen (NEW)
- `app/trip/[id].tsx` → Individual trip detail with sub-tabs (NEW)

### Build Order (EXACT SEQUENCE)

1. ✅ Install dependencies (Convex, react-native-maps, dotenv)
2. ✅ Initialize Convex (`npx convex dev`)
3. ✅ Set up environment variables
4. ✅ Create Convex schema (users, trips, messages)
5. ✅ Build onboarding screens (Welcome → Name Input)
6. ✅ Update tab navigation (Home/Trips/Create/Profile)
7. ✅ Build Home screen with mock data carousel
8. ✅ Build Trips list screen with cards
9. ✅ Build Create Trip flow (modal)
10. ✅ Build Trip Detail screen with sub-tabs (Chat/Plan/Costs/Map/Album)
11. ✅ Implement real-time chat with Convex
12. ✅ Integrate Gemini AI assistant in chat
13. ✅ Add Google Maps to Map tab
14. ✅ Implement directions/pathfinding
15. ✅ Polish UI, animations, haptics
16. ✅ Test full demo flow

### Convex Schema (EXACT STRUCTURE)

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    firstName: v.string(),
    lastName: v.string(),
    avatar: v.optional(v.string()), // emoji or initials
    createdAt: v.number(),
  }),

  trips: defineTable({
    name: v.string(),
    destination: v.string(),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    startingCity: v.optional(v.string()),
    status: v.union(
      v.literal("planning"),
      v.literal("booked"),
      v.literal("live"),
      v.literal("done")
    ),
    coverImage: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  tripMembers: defineTable({
    tripId: v.id("trips"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member")),
    joinedAt: v.number(),
  })
    .index("by_trip", ["tripId"])
    .index("by_user", ["userId"]),

  messages: defineTable({
    tripId: v.id("trips"),
    userId: v.optional(v.id("users")), // optional for AI messages
    content: v.string(),
    isAI: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_trip", ["tripId", "createdAt"]),
});
```

### Data Flow Pattern

**Onboarding:**
1. User enters first/last name
2. Call Convex mutation to create user
3. Store user ID in AsyncStorage
4. Navigate to tabs

**Creating Trip:**
1. User fills trip form (or skips)
2. Call Convex mutation to create trip
3. Add user as admin to tripMembers
4. Navigate to trip detail screen

**Chat:**
1. User types message
2. Call Convex mutation to add message
3. Convex query subscribes to messages (real-time)
4. AI assistant triggered by keywords/context
5. AI calls Gemini API, posts response as message

**Maps:**
1. Load trip destination from Convex
2. Render Google Maps with markers
3. Call Directions API for route
4. Display polyline on map

### Key Files to Create/Modify

- `convex/schema.ts` - Database schema (above)
- `convex/users.ts` - User mutations/queries
- `convex/trips.ts` - Trip mutations/queries
- `convex/messages.ts` - Message mutations/queries + AI logic
- `app/onboarding.tsx` - Name input screen
- `app/(tabs)/index.tsx` - Home screen (modify existing)
- `app/(tabs)/trips.tsx` - Trips list (NEW)
- `app/(tabs)/create.tsx` - Create trip modal (NEW)
- `app/(tabs)/profile.tsx` - Profile screen (NEW)
- `app/trip/[id].tsx` - Trip detail with sub-tabs (NEW)
- `components/chat-message.tsx` - Chat bubble component
- `components/trip-card.tsx` - Trip card component
- `components/map-view.tsx` - Google Maps wrapper component

### DO NOT COMMIT

- `.env.local`
- `.env`
- `node_modules/`
- `.convex/` (generated)

### Commands Reference

```bash
# Start Expo dev server
npm start

# Start Convex dev server (separate terminal)
npx convex dev

# iOS simulator
npm run ios

# Lint
npm run lint
```
