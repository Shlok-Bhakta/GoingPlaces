import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

import { useTrips } from '@/contexts/trips-context';


/**
 * Join route: open this link on another device (same network) to join the same trip and chat.
 * Example: exp://192.168.1.5:8081/--/join/trip_1
 * Optional query params: name=...&destination=... to show trip title/destination on the joiner's list.
 */
export default function JoinTripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const { joinTrip } = useTrips();
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!tripId) {
      router.replace('/(tabs)');
      return;
    }
    if (joinedRef.current) return;
    joinedRef.current = true;
    joinTrip(tripId);
    const id = setTimeout(() => router.replace(`/trip/${tripId}`), 0);
    return () => clearTimeout(id);
  }, [tripId, joinTrip, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>Joining trip…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  text: {
    fontSize: 16,
  },
});
