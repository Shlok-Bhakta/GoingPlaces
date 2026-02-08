# Invite System with Convex

A complete invite link system powered by Convex HTTP actions and deep linking.

## How It Works

### 1. Generate Invite Link
When a trip admin taps the invite button (paper plane icon) in a trip:
1. Convex generates a unique 16-character token for the trip
2. Token is saved to the trip's `inviteToken` field
3. Link is created: `https://utmost-goshawk-722.convex.site/invite?token=abc123xyz789`
4. Native share sheet opens with the link

### 2. Click Invite Link
When someone clicks the invite link:
1. Convex HTTP action handles the request at `/invite`
2. Returns a beautiful HTML landing page with:
   - Trip name and destination
   - Trip details (dates, status)
   - "Open Going Places" button
   - Auto-redirect to app via deep link `goingplaces://invite/token`

### 3. Join Trip
When the app opens from deep link:
1. App navigates to `/invite/[token]` route
2. If user not logged in → redirect to onboarding
3. If logged in → automatically join trip via Convex
4. Navigate to trip detail screen

## Files Created/Modified

### Convex Backend
- `convex/schema.ts` - Added `inviteToken` field to trips table
- `convex/invites.ts` - Token generation, lookup, and join logic
- `convex/http.ts` - HTTP endpoints for invite landing page
- `hooks/useConvex.ts` - React hooks for invite functions

### App Frontend
- `app/trip/[id].tsx` - Share invite link functionality
- `app/invite/[token].tsx` - Deep link handler screen
- `app.json` - Deep link scheme already configured

## Usage Examples

### Share Invite from Trip Screen
```tsx
import { useGenerateInviteLink } from '@/hooks/useConvex';
import { Share } from 'react-native';

const generateInviteLink = useGenerateInviteLink();

const handleShare = async (tripId: string) => {
  const token = await generateInviteLink({ tripId });
  const url = `https://utmost-goshawk-722.convex.site/invite?token=${token}`;
  
  await Share.share({
    message: `Join my trip! ${url}`,
    url: url,
  });
};
```

### Check Invite from Deep Link
```tsx
import { useGetTripByToken, useJoinTripByToken } from '@/hooks/useConvex';

const trip = useGetTripByToken(token);
const joinTrip = useJoinTripByToken();

// Join the trip
const tripId = await joinTrip({ token, userId });
```

## Convex HTTP Endpoints

### 1. HTML Landing Page
```
GET https://utmost-goshawk-722.convex.site/invite?token=abc123
```
Returns beautiful HTML page with trip details and deep link button.

### 2. JSON API
```
GET https://utmost-goshawk-722.convex.site/api/invite?token=abc123
```
Returns trip details as JSON (for programmatic access).

Response:
```json
{
  "success": true,
  "trip": {
    "id": "trip_123",
    "name": "Tokyo Adventure",
    "destination": "Tokyo, Japan",
    "startDate": 1234567890,
    "status": "planning"
  }
}
```

## Security Features

1. **Unique Tokens**: 16-character random tokens (62^16 combinations)
2. **Database Indexed**: Fast lookup via `by_invite_token` index
3. **Duplicate Prevention**: Checks if user already joined
4. **No Expiration**: Links work forever (can add expiry if needed)

## Deep Link Flow

```
User clicks link
    ↓
Convex HTTP action
    ↓
HTML landing page loads
    ↓
Auto-redirects to: goingplaces://invite/abc123
    ↓
App opens → /invite/[token]
    ↓
Check if logged in
    ↓
Join trip via Convex
    ↓
Navigate to trip screen
```

## Testing

1. **Create a trip** in the app
2. **Tap invite button** (paper plane icon)
3. **Share to yourself** (Messages, Notes, etc.)
4. **Click the link** - should see landing page
5. **Tap "Open Going Places"** - app opens
6. **You're added to the trip** automatically

## Environment Variables

Make sure `.env.local` has:
```env
EXPO_PUBLIC_CONVEX_URL=https://utmost-goshawk-722.convex.cloud
EXPO_PUBLIC_CONVEX_SITE_URL=https://utmost-goshawk-722.convex.site
```

The `CONVEX_SITE_URL` is used for the invite links!

## Future Enhancements

- [ ] Invite link expiration (7 days, 30 days, etc.)
- [ ] Invite link usage tracking (how many people joined)
- [ ] Revoke/regenerate invite links
- [ ] Custom invite messages per trip
- [ ] Preview member list on landing page
- [ ] SMS/WhatsApp deep link integration
