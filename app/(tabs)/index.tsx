import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useTrips } from '@/contexts/trips-context';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.75;
const CARD_MARGIN = Spacing.md;

const MOCK_RECOMMENDED = [
  {
    id: '1',
    title: 'Weekend in Big Sur',
    subtitle: 'Coastal escape · 2 days',
    gradient: ['#7BA88E', '#5B8A72'],
    destination: 'Big Sur, CA',
  },
  {
    id: '2',
    title: 'NYC Food Crawl',
    subtitle: 'Food & nightlife · 1 day',
    gradient: ['#C45C3E', '#A04028'],
    destination: 'New York, NY',
  },
  {
    id: '3',
    title: 'Lake Tahoe Ski Trip',
    subtitle: 'Adventure · 3 days',
    gradient: ['#A8B4E0', '#7A8FC9'],
    destination: 'Lake Tahoe, CA',
  },
];

const MOCK_TRENDING = [
  { id: 't1', name: 'Austin SXSW', destination: 'Austin, TX', members: 4 },
  { id: 't2', name: 'Miami Beach', destination: 'Miami, FL', members: 3 },
  { id: 't3', name: 'Pacific Coast Highway', destination: 'California', members: 5 },
];

export default function HomeScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const scrollY = useSharedValue(0);
  const router = useRouter();
  const { addTrip } = useTrips();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const handleStartTrip = (item: (typeof MOCK_RECOMMENDED)[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const tripId = addTrip({
      name: item.title,
      destination: item.destination,
      status: 'planning',
      createdBy: 'current',
    });
    router.push(`/trip/${tripId}`);
  };

  return (
    <Animated.ScrollView
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={styles.greeting}>Find your next adventure</Text>
        <View style={styles.searchRow}>
          <IconSymbol
            name="paperplane.fill"
            size={18}
            color={Colors.light.textTertiary}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events, places, trips…"
            placeholderTextColor={Colors.light.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).springify()}>
        <Text style={styles.sectionTitle}>Recommended</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + CARD_MARGIN}
          snapToAlignment="start">
          {MOCK_RECOMMENDED.map((item, i) => (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                styles.recommendedCard,
                pressed && styles.cardPressed,
              ]}
              onPress={() => handleStartTrip(item)}>
              <LinearGradient
                colors={item.gradient as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.recommendedGradient}>
                <Text style={styles.recommendedTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.recommendedSubtitle}>{item.subtitle}</Text>
                <View style={styles.recommendedCta}>
                  <Text style={styles.recommendedCtaText}>Start a trip</Text>
                  <IconSymbol
                    name="chevron.right"
                    size={14}
                    color="rgba(255,255,255,0.9)"
                  />
                </View>
              </LinearGradient>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).springify()}>
        <Text style={styles.sectionTitle}>Trending trips</Text>
        {MOCK_TRENDING.map((item, i) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.trendingRow,
              pressed && styles.rowPressed,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              const tripId = addTrip({
                name: item.name,
                destination: item.destination,
                status: 'planning',
                createdBy: 'current',
              });
              router.push(`/trip/${tripId}`);
            }}>
            <View style={styles.trendingIcon}>
              <Text style={styles.trendingEmoji}>🗺️</Text>
            </View>
            <View style={styles.trendingContent}>
              <Text style={styles.trendingName}>{item.name}</Text>
              <Text style={styles.trendingMeta}>
                {item.destination} · {item.members} members
              </Text>
            </View>
            <IconSymbol
              name="chevron.right"
              size={18}
              color={Colors.light.textTertiary}
            />
          </Pressable>
        ))}
      </Animated.View>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    paddingTop: 60,
    paddingBottom: 120,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  greeting: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 26,
    color: Colors.light.text,
    marginBottom: Spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    color: Colors.light.text,
    paddingVertical: 4,
  },
  sectionTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
    color: Colors.light.text,
    marginBottom: Spacing.md,
  },
  carousel: {
    gap: CARD_MARGIN,
    paddingBottom: Spacing.md,
  },
  recommendedCard: {
    width: CARD_WIDTH,
    height: 180,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.95,
  },
  recommendedGradient: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'flex-end',
  },
  recommendedTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 22,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  recommendedSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: Spacing.md,
  },
  recommendedCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recommendedCtaText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  trendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  rowPressed: {
    opacity: 0.9,
  },
  trendingIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.light.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  trendingEmoji: {
    fontSize: 22,
  },
  trendingContent: {
    flex: 1,
  },
  trendingName: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    color: Colors.light.text,
  },
  trendingMeta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
});
