# Multi-User Testing Guide

## How Expo Works with Multiple Users

✅ **YES, Expo supports multiple users scanning the same QR code!**

Each device that scans your Expo QR code:
- Gets its own app instance
- Stores its own user data in AsyncStorage (device-specific)
- Connects to the same Convex backend (shared database)
- Can see trips and messages from other users in real-time

## Common Issues & Solutions

### Issue 1: "My friends can't create trips"

**Possible Causes:**
1. They haven't completed onboarding (need to enter their name)
2. Their user wasn't created in Convex
3. Network/Convex connection issue

**How to Check:**
1. Ask them to go to the **Profile** tab
2. Look at the "Debug Info" section
3. They should see a User ID like: `jh71wbk3zc5xqss9e56ckeksk580pbr3`

**If they see "Not logged in":**
- They need to sign out and go through onboarding again
- The onboarding flow should create their Convex user

**If they see a user ID starting with `user_`:**
- This means Convex failed to create their account
- They should sign out and try onboarding again
- Check your internet connection

### Issue 2: Multiple devices showing the same user

**Cause:** All devices are using the same physical device (simulator/test device)

**Solution:** Each person needs to scan the QR code on their **own physical phone**

AsyncStorage is device-specific, so:
- Device A has User A's data
- Device B has User B's data
- Device C has User C's data

### Issue 3: WebSocket errors or connection issues

**Error:** `WebSocket closed with code 1006`

**Solutions:**
1. **Check Internet Connection** - Both devices need stable WiFi/cellular
2. **Restart Expo** - Stop and restart: `npx expo start`
3. **Check Convex Deployment** - Visit: https://dashboard.convex.dev/d/utmost-goshawk-722
4. **Clear App Data** - Close app completely and reopen

### Issue 4: Can't see other users' trips

**Possible Causes:**
1. Not added as a member to the trip
2. Convex not syncing

**How to Check:**
1. Have User A create a trip
2. User A taps the **+** button in trip header
3. User A shares the 4-character code with User B
4. User B goes to Trips tab → "Join trip with code"
5. User B enters the code
6. Now both should see the trip

## Testing Multi-User Flow (Step-by-Step)

### Setup (Do Once)
1. Start Expo: `npx expo start`
2. Make sure Convex is running: `npx convex dev` (or already deployed)

### User A (First Friend)
1. Scan QR code on their phone
2. Complete onboarding (enter name)
3. Go to Profile tab → Check "User ID" in Debug Info
4. Create a trip (either from Home or Create tab)
5. Tap **+** button in trip header
6. Share the 4-character code with friends

### User B (Second Friend)
1. Scan QR code on their phone
2. Complete onboarding (enter different name!)
3. Go to Profile tab → Check they have different "User ID"
4. Go to Trips tab
5. Tap "Join trip with code"
6. Enter the code from User A
7. Should see the trip appear!

### User C (Third Friend)
1. Same as User B
2. They should also be able to join with the same code

## Debugging Checklist

If your friends can't create trips, have them check:

- [ ] Completed onboarding with their name
- [ ] Profile tab shows a Convex User ID (starts with `j` or `k`, not `user_`)
- [ ] Internet connection is stable
- [ ] Expo app is fully loaded (no "Waiting for connection" message)
- [ ] Create tab shows the create trip form
- [ ] Tapping "Continue" doesn't show any error alerts

## Getting More Debug Info

### In Expo Dev Tools (Your Computer)
- Check console logs for errors
- Look for `Error creating trip:` or `Error creating user:` messages

### In Convex Dashboard
- Visit: https://dashboard.convex.dev/d/utmost-goshawk-722
- Click "Data" tab
- Check `users` table - should see multiple users
- Check `trips` table - should see created trips
- Check `tripMembers` table - should see user-trip relationships

### In Phone Console (If Possible)
- Shake device → Open Dev Menu → Enable Debug JS Remotely
- Open Chrome DevTools → Console tab
- Look for error messages

## Known Limitations

1. **Same Device Testing**: If testing on simulators, you need separate simulator instances (one per user)
2. **Network Speed**: Slow networks might cause delays in Convex sync
3. **Expo Go Limits**: Some features work better in development builds

## Success Indicators

✅ **Working Correctly When:**
- Each user has unique User ID in Profile → Debug Info
- Multiple users can create trips independently
- Users can join each other's trips with codes
- Chat messages appear for all trip members
- Trip colors stay consistent across devices

## Need More Help?

1. Check Expo logs: Look for errors in terminal
2. Check Convex logs: Dashboard → Logs tab
3. Screenshot the error and User ID from Profile tab
4. Share the exact error message
