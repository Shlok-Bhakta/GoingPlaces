import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Dimensions,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { Spacing, Radius } from '@/constants/theme';
import type { Trip, TripStatus } from '@/contexts/trips-context';
import { useTheme } from '@/contexts/theme-context';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - Spacing.xl * 2;
const CARD_HEIGHT = 160;

const COVER_GRADIENTS = [
  ['#E8A68A', '#C45C3E'],
  ['#7BA88E', '#5B8A72'],
  ['#A8B4E0', '#7A8FC9'],
  ['#D4A054', '#B8860B'],
];

export function TripCard({
  trip,
  index = 0,
  onPress,
}: {
  trip: Trip;
  index?: number;
  onPress?: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const gradient = COVER_GRADIENTS[index % COVER_GRADIENTS.length];
  const statusColors: Record<TripStatus, string> = {
    planning: colors.warning,
    booked: colors.success,
    live: colors.tint,
    done: colors.textTertiary,
  };
  const statusColor = statusColors[trip.status];

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      router.push(`/trip/${trip.id}`);
    }
  };

  const formatDate = (ts?: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const dateRange =
    trip.startDate && trip.endDate
      ? `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`
      : formatDate(trip.startDate) || 'Dates TBD';

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).springify()}
      style={styles.wrapper}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.surface },
          pressed && styles.cardPressed,
        ]}
        onPress={handlePress}>
        <View style={[styles.cover, { overflow: 'hidden', borderRadius: Radius.lg }]}>
          {trip.coverImage ? (
            <Image
              source={{ uri: trip.coverImage }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={gradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.coverImage}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={styles.coverOverlay}
          />
        </View>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.name} numberOfLines={1}>
              {trip.name}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
              </Text>
            </View>
          </View>
          <Text style={styles.destination} numberOfLines={1}>
            {trip.destination}
          </Text>
          <Text style={styles.date}>{dateRange}</Text>
          {trip.members && trip.members.length > 0 && (
            <View style={styles.avatarStack}>
              {trip.members.slice(0, 3).map((m, i) => (
                <View key={m.id} style={[styles.avatar, { marginLeft: i > 0 ? -8 : 0 }]}>
                  <Text style={styles.avatarText}>
                    {m.avatar || m.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              ))}
              {trip.members.length > 3 && (
                <View style={[styles.avatar, { marginLeft: -8, backgroundColor: colors.tint }]}>
                  <Text style={styles.avatarText}>+{trip.members.length - 3}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.md,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.95,
  },
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CARD_HEIGHT,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  name: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 18,
    color: '#FFFFFF',
    flex: 1,
  },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  statusText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 11,
  },
  destination: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 2,
  },
  date: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 10,
    color: '#FFFFFF',
  },
});
