import React from 'react';
import { Text, StyleSheet, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { TripCard } from '@/components/trip-card';
import { Spacing } from '@/constants/theme';
import { useTrips } from '@/contexts/trips-context';
import { useTheme } from '@/contexts/theme-context';

export default function TripsScreen() {
  const { trips } = useTrips();
  const { colors } = useTheme();

  const currentTrips = trips.filter(
    (t) => t.status === 'planning' || t.status === 'booked' || t.status === 'live'
  );
  const pastTrips = trips.filter((t) => t.status === 'done');

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Your trips</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {trips.length === 0
            ? 'Trips you create or join will appear here'
            : `${trips.length} trip${trips.length === 1 ? '' : 's'}`}
        </Text>
      </Animated.View>

      {currentTrips.length > 0 && (
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Current</Text>
          {currentTrips.map((trip, i) => (
            <TripCard key={trip.id} trip={trip} index={i} />
          ))}
        </Animated.View>
      )}

      {pastTrips.length > 0 && (
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.pastSection}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Past trips</Text>
          {pastTrips.map((trip, i) => (
            <TripCard key={trip.id} trip={trip} index={currentTrips.length + i} />
          ))}
        </Animated.View>
      )}

      {trips.length === 0 && (
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.empty}>
          <Text style={styles.emptyEmoji}>✈️</Text>
          <Text style={[styles.emptyText, { color: colors.text }]}>No trips yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Tap Create to start planning your next adventure
          </Text>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 60,
    paddingBottom: 120,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
  },
  subtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 18,
    marginBottom: Spacing.md,
  },
  pastSection: {
    marginTop: Spacing.xl,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
    marginBottom: Spacing.sm,
  },
  emptySubtext: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
