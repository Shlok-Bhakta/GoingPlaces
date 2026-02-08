import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Alert,
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
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/theme-context';
import { useUser } from '@/contexts/user-context';
import { useCreateTrip } from '@/hooks/useConvex';
import { Id } from '@/convex/_generated/dataModel';

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
  const { user } = useUser();
  const createTrip = useCreateTrip();
  const { colors } = useTheme();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const handleStartTrip = async (item: (typeof MOCK_RECOMMENDED)[0]) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a trip.');
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const tripId = await createTrip({
        name: item.title,
        destination: item.destination,
        status: 'planning',
        createdBy: user.id as Id<"users">,
      });
      router.push(`/trip/${tripId}`);
    } catch (error) {
      console.error('Error creating trip:', error);
      Alert.alert(
        'Error Creating Trip',
        error instanceof Error ? error.message : 'Could not create trip. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <Animated.ScrollView
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <Text style={[styles.greeting, { color: colors.text }]}>Find your next adventure</Text>
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

      <Animated.View entering={FadeInDown.delay(150).springify()}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recommended</Text>
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
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending trips</Text>
        {MOCK_TRENDING.map((item, i) => (
          <Pressable
            key={item.id}
            style={({ pressed }) => [
              styles.trendingRow,
              { backgroundColor: colors.surface, borderColor: colors.borderLight },
              pressed && styles.rowPressed,
            ]}
            onPress={async () => {
              if (!user) return;
              
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              try {
                const tripId = await createTrip({
                  name: item.name,
                  destination: item.destination,
                  status: 'planning',
                  createdBy: user.id as Id<"users">,
                });
                router.push(`/trip/${tripId}`);
              } catch (error) {
                console.error('Error creating trip:', error);
              }
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
        ))}
      </Animated.View>
    </Animated.ScrollView>
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
  },
  searchInput: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    paddingVertical: 4,
  },
  sectionTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
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
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
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
