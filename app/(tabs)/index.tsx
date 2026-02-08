import React, { useMemo, useState } from 'react';
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
  FadeInRight,
  FadeInUp,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { TabScreenWrapper } from '@/components/tab-screen-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing, Radius } from '@/constants/theme';
import { useTrips, type Itinerary } from '@/contexts/trips-context';
import { useTheme } from '@/contexts/theme-context';

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.75;
const CARD_MARGIN = Spacing.md;

/** Recommended trip template: card display + optional details & itinerary */
type RecommendedTrip = {
  id: string;
  title: string;
  subtitle: string;
  gradient: [string, string];
  destination: string;
  description?: string;
  highlights?: string[];
  itinerary?: Itinerary;
};

const MOCK_RECOMMENDED: RecommendedTrip[] = [
  {
    id: '1',
    title: 'Weekend in Big Sur',
    subtitle: 'Coastal escape · 2 days',
    gradient: ['#7BA88E', '#5B8A72'],
    destination: 'Big Sur, CA',
    description: 'A relaxed two-day escape along the Central Coast with ocean views, redwoods, and iconic stops.',
    highlights: ['Pfeiffer Big Sur State Park', 'Bixby Bridge', 'McWay Falls', 'Local restaurants'],
    itinerary: [
      {
        id: 'd1',
        dayNumber: 1,
        title: 'Day 1 — Arrival & Coast',
        date: 'Sat',
        activities: [
          { id: 'a1', time: '10:00 AM', title: 'Drive in via Highway 1', description: 'Scenic drive, stop at Bixby Bridge for photos.', location: 'Highway 1' },
          { id: 'a2', time: '12:00 PM', title: 'Lunch at Nepenthe', description: 'Cliffside restaurant with ocean views.', location: 'Nepenthe, Big Sur' },
          { id: 'a3', time: '2:30 PM', title: 'McWay Falls overlook', description: 'Short walk to the famous waterfall onto the beach.', location: 'Julia Pfeiffer Burns SP' },
          { id: 'a4', time: '5:00 PM', title: 'Check-in & evening in Big Sur', description: 'Dinner and stargazing.', location: 'Your lodging' },
        ],
      },
      {
        id: 'd2',
        dayNumber: 2,
        title: 'Day 2 — Redwoods & Home',
        date: 'Sun',
        activities: [
          { id: 'a5', time: '9:00 AM', title: 'Pfeiffer Big Sur State Park', description: 'Hike among redwoods, Pfeiffer Falls trail.', location: 'Pfeiffer Big Sur SP' },
          { id: 'a6', time: '12:00 PM', title: 'Brunch in Big Sur village', description: 'Cafés and local spots before heading back.', location: 'Big Sur' },
          { id: 'a7', time: '2:00 PM', title: 'Drive back', description: 'Leisurely return with optional stops.', location: 'Highway 1' },
        ],
      },
    ],
  },
  {
    id: '2',
    title: 'NYC Food Crawl',
    subtitle: 'Food & nightlife · 1 day',
    gradient: ['#C45C3E', '#A04028'],
    destination: 'New York, NY',
    description: 'One packed day of iconic NYC bites and neighborhoods.',
    highlights: ['Chelsea Market', 'Smorgasburg', 'Little Italy', 'East Village bars'],
    itinerary: [
      {
        id: 'd1',
        dayNumber: 1,
        title: 'Day 1 — Full food crawl',
        date: '1 day',
        activities: [
          { id: 'a1', time: '9:00 AM', title: 'Coffee & pastry', description: 'Start in Chelsea or West Village.', location: 'Chelsea / West Village' },
          { id: 'a2', time: '10:30 AM', title: 'Chelsea Market', description: 'Walk through, grab a bite and snacks.', location: 'Chelsea Market' },
          { id: 'a3', time: '12:30 PM', title: 'Smorgasburg (weekends) or Essex Market', description: 'Outdoor food market or indoor market.', location: 'Williamsburg / Lower East Side' },
          { id: 'a4', time: '2:30 PM', title: 'Little Italy / Nolita', description: 'Cannoli, espresso, and people-watching.', location: 'Little Italy' },
          { id: 'a5', time: '5:00 PM', title: 'East Village bars & dinner', description: 'Pre-dinner drinks, then dinner and nightlife.', location: 'East Village' },
        ],
      },
    ],
  },
  {
    id: '3',
    title: 'Lake Tahoe Ski Trip',
    subtitle: 'Adventure · 3 days',
    gradient: ['#A8B4E0', '#7A8FC9'],
    destination: 'Lake Tahoe, CA',
    description: 'Three days of skiing and apres in North or South Lake Tahoe.',
    highlights: ['Heavenly', 'Palisades Tahoe', 'Lake views', 'Casinos & nightlife'],
    itinerary: [
      {
        id: 'd1',
        dayNumber: 1,
        title: 'Day 1 — Arrival & first runs',
        date: 'Fri',
        activities: [
          { id: 'a1', time: '8:00 AM', title: 'Drive to Tahoe', description: 'From Bay Area or Reno.', location: '—' },
          { id: 'a2', time: '12:00 PM', title: 'Check-in & lunch', description: 'Lodge or condo, quick lunch.', location: 'South / North Lake Tahoe' },
          { id: 'a3', time: '2:00 PM', title: 'Half-day skiing', description: 'Heavenly or Palisades depending on base.', location: 'Resort' },
          { id: 'a4', time: '6:00 PM', title: 'Dinner & apres', description: 'Village or casino area.', location: 'Village' },
        ],
      },
      {
        id: 'd2',
        dayNumber: 2,
        title: 'Day 2 — Full day on the mountain',
        date: 'Sat',
        activities: [
          { id: 'a5', time: '8:30 AM', title: 'First chair', description: 'Full day skiing or snowboarding.', location: 'Resort' },
          { id: 'a6', time: '12:00 PM', title: 'Lunch on mountain', description: 'Lodge lunch with lake views.', location: 'Mountain lodge' },
          { id: 'a7', time: '4:00 PM', title: 'Back to lodging', description: 'Rest, hot tub, or explore town.', location: '—' },
          { id: 'a8', time: '7:00 PM', title: 'Dinner out', description: 'Local favorite or casino.', location: 'Tahoe' },
        ],
      },
      {
        id: 'd3',
        dayNumber: 3,
        title: 'Day 3 — Morning runs & drive home',
        date: 'Sun',
        activities: [
          { id: 'a9', time: '8:00 AM', title: 'Morning skiing', description: 'A few hours before checkout.', location: 'Resort' },
          { id: 'a10', time: '11:00 AM', title: 'Check-out', description: 'Pack and load car.', location: 'Lodging' },
          { id: 'a11', time: '12:00 PM', title: 'Lunch then drive home', description: 'One last meal in Tahoe.', location: 'Tahoe' },
        ],
      },
    ],
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
  const { colors } = useTheme();
  const greeting = useMemo(() => getTimeBasedGreeting(), []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const handleStartTrip = (item: RecommendedTrip) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const tripId = addTrip({
      name: item.title,
      destination: item.destination,
      status: 'planning',
      createdBy: 'current',
      ...(item.itinerary && { itinerary: item.itinerary }),
    });
    router.push(`/trip/${tripId}`);
  };

  return (
    <TabScreenWrapper>
    <Animated.ScrollView
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Animated.View entering={FadeInUp.duration(320).delay(0)}>
          <Text style={[styles.greetingLabel, { color: colors.textSecondary }]}>{greeting}</Text>
        </Animated.View>
        <Animated.View entering={FadeInUp.duration(360).delay(40)}>
          <Text style={[styles.greeting, { color: colors.text }]}>Find your next adventure</Text>
        </Animated.View>
        <Animated.View entering={FadeInUp.duration(360).delay(80)}>
        <View style={[styles.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol
            name="paperplane.fill"
            size={18}
            color={colors.textTertiary}
          />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search events, places, trips…"
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.delay(100).duration(380)} style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recommended</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Curated getaways you can start in one tap
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carousel}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + CARD_MARGIN}
          snapToAlignment="start">
          {MOCK_RECOMMENDED.map((item, i) => (
            <Animated.View
              key={item.id}
              entering={FadeInRight.delay(120 + i * 80).duration(360)}
              style={styles.carouselItem}>
              <Pressable
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
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedBadgeText}>{item.destination}</Text>
                  </View>
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
            </Animated.View>
          ))}
        </ScrollView>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(280).duration(380)} style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending trips</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Popular with other travelers
          </Text>
        </View>
        <View style={[styles.trendingCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          {MOCK_TRENDING.map((item, i) => (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay(320 + i * 55).duration(320)}>
              <Pressable
                style={({ pressed }) => [
                  styles.trendingRow,
                  i < MOCK_TRENDING.length - 1 && styles.trendingRowBorder,
                  { borderColor: colors.borderLight },
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
              <View style={[styles.trendingIcon, { backgroundColor: colors.surfaceMuted }]}>
                <Text style={styles.trendingEmoji}>🗺️</Text>
              </View>
              <View style={styles.trendingContent}>
                <Text style={[styles.trendingName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.trendingMeta, { color: colors.textSecondary }]}>
                  {item.destination} · {item.members} members
                </Text>
              </View>
              <IconSymbol
                name="chevron.right"
                size={18}
                color={colors.textTertiary}
              />
            </Pressable>
            </Animated.View>
          ))}
        </View>
      </Animated.View>
    </Animated.ScrollView>
    </TabScreenWrapper>
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
  greetingLabel: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    marginBottom: 2,
  },
  greeting: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 26,
    marginBottom: Spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    paddingVertical: 4,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
  },
  carousel: {
    gap: CARD_MARGIN,
    paddingBottom: Spacing.sm,
  },
  carouselItem: {
    marginRight: 0,
  },
  recommendedCard: {
    width: CARD_WIDTH,
    height: 192,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
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
  recommendedBadge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  recommendedBadgeText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.95)',
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
  trendingCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  trendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  trendingRowBorder: {
    borderBottomWidth: 1,
  },
  rowPressed: {
    opacity: 0.9,
  },
  trendingIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
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
  },
  trendingMeta: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
});
