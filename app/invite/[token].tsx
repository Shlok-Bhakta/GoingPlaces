import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/contexts/theme-context';
import { useUser } from '@/contexts/user-context';
import { useJoinTripByToken, useGetTripByToken } from '@/hooks/useConvex';
import { Spacing } from '@/constants/theme';
import { Id } from '@/convex/_generated/dataModel';

export default function InviteHandlerScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useUser();
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const trip = useGetTripByToken(token);
  const joinTrip = useJoinTripByToken();

  useEffect(() => {
    if (!token) {
      setError('Invalid invite link');
      return;
    }

    if (!user) {
      // User not logged in, redirect to onboarding with invite token
      router.replace(`/onboarding?inviteToken=${token}`);
      return;
    }

    if (trip && !isJoining && !error) {
      handleJoinTrip();
    }
  }, [trip, user, token]);

  const handleJoinTrip = async () => {
    if (!user || !token) return;

    try {
      setIsJoining(true);
      
      // Join the trip
      const tripId = await joinTrip({
        token,
        userId: user.id as Id<"users">,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Navigate to the trip
      router.replace(`/trip/${tripId}`);
    } catch (err) {
      console.error('Error joining trip:', err);
      setError('Could not join trip. The invite may have expired.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsJoining(false);
    }
  };

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.emoji]}>😕</Text>
        <Text style={[styles.title, { color: colors.text }]}>Oops!</Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>
          {error}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.tint} />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
        {trip ? `Joining ${trip.name}...` : 'Loading invite...'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emoji: {
    fontSize: 60,
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
    marginBottom: Spacing.sm,
  },
  message: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  loadingText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    marginTop: Spacing.lg,
  },
});
