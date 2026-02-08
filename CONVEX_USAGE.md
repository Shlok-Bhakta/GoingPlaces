# Convex Backend Integration

The Convex backend is fully set up and ready to use. Here's how to integrate it into your app.

## Setup Complete

All Convex files are configured:
- `convex/schema.ts` - Database schema with users, trips, tripMembers, messages
- `convex/users.ts` - User queries and mutations
- `convex/trips.ts` - Trip queries and mutations with member management
- `convex/messages.ts` - Chat with AI assistant integration
- `app/_layout.tsx` - ConvexProvider configured
- `hooks/useConvex.ts` - Helper hooks for all data operations

## Running Convex

Keep this running in a separate terminal during development:

```bash
npx convex dev
```

## Usage Examples

### 1. Creating a User (Onboarding)

```tsx
import { useCreateUser } from '@/hooks/useConvex';
import { useUser } from '@/contexts/user-context';
import { Id } from '@/convex/_generated/dataModel';

function OnboardingScreen() {
  const createUser = useCreateUser();
  const { setUser } = useUser();
  
  const handleSubmit = async (firstName: string, lastName: string) => {
    const userId = await createUser({ firstName, lastName });
    
    // Store user ID locally for session management
    await setUser({
      id: userId as string,
      firstName,
      lastName,
    });
  };
}
```

### 2. Creating a Trip

```tsx
import { useCreateTrip } from '@/hooks/useConvex';
import { useUser } from '@/contexts/user-context';
import { Id } from '@/convex/_generated/dataModel';

function CreateTripScreen() {
  const createTrip = useCreateTrip();
  const { user } = useUser();
  
  const handleCreate = async () => {
    if (!user) return;
    
    const tripId = await createTrip({
      name: "Tokyo Adventure",
      destination: "Tokyo, Japan",
      startDate: Date.now(),
      endDate: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days later
      startingCity: "New York",
      status: "planning",
      createdBy: user.id as Id<"users">,
    });
    
    // Navigate to trip
    router.push(`/trip/${tripId}`);
  };
}
```

### 3. Listing User's Trips

```tsx
import { useTrips } from '@/hooks/useConvex';
import { useUser } from '@/contexts/user-context';
import { Id } from '@/convex/_generated/dataModel';

function TripsListScreen() {
  const { user } = useUser();
  const trips = useTrips(user?.id as Id<"users"> | undefined);
  
  if (trips === undefined) {
    return <Text>Loading trips...</Text>;
  }
  
  return (
    <FlatList
      data={trips}
      renderItem={({ item }) => (
        <TripCard trip={item} />
      )}
    />
  );
}
```

### 4. Real-time Chat with AI Assistant

```tsx
import { useMessages, useSendMessageWithAI } from '@/hooks/useConvex';
import { Id } from '@/convex/_generated/dataModel';

function ChatScreen({ tripId }: { tripId: string }) {
  const messages = useMessages(tripId as Id<"trips">);
  const sendMessage = useSendMessageWithAI();
  const { user } = useUser();
  const [text, setText] = useState('');
  
  const handleSend = async () => {
    if (!text.trim() || !user) return;
    
    // This will send the message AND trigger AI response if appropriate
    await sendMessage({
      tripId: tripId as Id<"trips">,
      userId: user.id as Id<"users">,
      content: text,
    });
    
    setText('');
  };
  
  return (
    <View>
      <FlatList
        data={messages}
        renderItem={({ item }) => (
          <ChatBubble
            message={item.content}
            isAI={item.isAI}
            user={item.user}
          />
        )}
      />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Type a message..."
      />
      <Button title="Send" onPress={handleSend} />
    </View>
  );
}
```

### 5. Getting Trip Members

```tsx
import { useTripMembers } from '@/hooks/useConvex';
import { Id } from '@/convex/_generated/dataModel';

function TripMembersScreen({ tripId }: { tripId: string }) {
  const members = useTripMembers(tripId as Id<"trips">);
  
  if (!members) return <Text>Loading members...</Text>;
  
  return (
    <View>
      {members.map((member) => (
        <View key={member._id}>
          <Text>{member.user?.firstName} {member.user?.lastName}</Text>
          <Text>{member.role}</Text>
        </View>
      ))}
    </View>
  );
}
```

### 6. Adding Members to a Trip

```tsx
import { useAddTripMember } from '@/hooks/useConvex';
import { Id } from '@/convex/_generated/dataModel';

function InviteScreen({ tripId }: { tripId: string }) {
  const addMember = useAddTripMember();
  
  const handleInvite = async (userId: string) => {
    await addMember({
      tripId: tripId as Id<"trips">,
      userId: userId as Id<"users">,
      role: "member",
    });
  };
}
```

### 7. Updating Trip Status

```tsx
import { useUpdateTripStatus } from '@/hooks/useConvex';
import { Id } from '@/convex/_generated/dataModel';

function TripStatusButton({ tripId }: { tripId: string }) {
  const updateStatus = useUpdateTripStatus();
  
  const markAsBooked = async () => {
    await updateStatus({
      tripId: tripId as Id<"trips">,
      status: "booked",
    });
  };
}
```

## AI Assistant Features

The AI assistant in `convex/messages.ts` will automatically respond when:

1. **Keywords are detected**: help, plan, suggest, recommend, when, where, how much, cost, book, hotel, flight, activity, itinerary, schedule, budget, ai, assistant
2. **Periodic check-ins**: Every 5 messages approximately
3. **Context-aware**: Uses trip details and recent conversation history

The AI uses Google's Gemini API and provides:
- Trip planning suggestions
- Budget recommendations  
- Activity ideas
- Schedule optimization
- Friendly, conversational responses

## Environment Variables

Make sure `.env.local` contains:

```env
CONVEX_DEPLOYMENT=dev:utmost-goshawk-722
EXPO_PUBLIC_CONVEX_URL=https://utmost-goshawk-722.convex.cloud
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_key_here
```

## Real-time Updates

All Convex queries automatically update in real-time:
- When a message is sent, all chat participants see it instantly
- When a trip is updated, all members see the changes
- When a new member joins, the member list updates for everyone

No manual refresh or polling needed!

## Type Safety

Convex provides full TypeScript support:

```tsx
import { Id } from '@/convex/_generated/dataModel';
import { Doc } from '@/convex/_generated/dataModel';

// Type-safe IDs
const userId: Id<"users"> = "user_123" as Id<"users">;

// Type-safe documents
const trip: Doc<"trips"> = {
  _id: "trip_123" as Id<"trips">,
  _creationTime: Date.now(),
  name: "Tokyo Trip",
  destination: "Tokyo",
  status: "planning",
  createdBy: userId,
  createdAt: Date.now(),
};
```

## Tips

1. **Loading States**: Convex queries return `undefined` while loading
2. **Error Handling**: Mutations throw errors that you can catch
3. **Optimistic Updates**: Convex handles optimistic UI updates automatically
4. **Offline Support**: Convex queues mutations when offline
5. **Development**: Keep `npx convex dev` running to see real-time logs

## Dashboard

View your data at: https://dashboard.convex.dev/d/utmost-goshawk-722
