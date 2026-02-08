import React, { useEffect, useRef, useState } from 'react';
import {
  Text,
  StyleSheet,
  ScrollView,
  View,
  Pressable,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { TabScreenWrapper } from '@/components/tab-screen-wrapper';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TripCard } from '@/components/trip-card';
import { Spacing, Radius } from '@/constants/theme';
import { useTrips, type Trip, type TripStatus } from '@/contexts/trips-context';
import { useTheme } from '@/contexts/theme-context';
import { useUser } from '@/contexts/user-context';

const CHAT_API_BASE = process.env.EXPO_PUBLIC_CHAT_WS_BASE ?? 'http://localhost:8000';

export default function TripsScreen() {
  const { trips, tripsLoading, effectiveUserId, addTripFromApi, refetchTrips } = useTrips();
  const { colors } = useTheme();
  const { user } = useUser();
  const router = useRouter();
  const { openJoin } = useLocalSearchParams<{ openJoin?: string }>();
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const joinCodeInputRef = useRef<TextInput>(null);

  const handleOpenJoinModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setJoinCode('');
    setJoinModalVisible(true);
  };

  useEffect(() => {
    if (openJoin === '1') setJoinModalVisible(true);
  }, [openJoin]);

  useEffect(() => {
    if (joinModalVisible) {
      const t = setTimeout(() => joinCodeInputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [joinModalVisible]);

  const handleJoinTrip = async () => {
    if (joinLoading) return;
    const codeTrimmed = joinCode.trim();
    if (codeTrimmed.length !== 4 || !/^\d{4}$/.test(codeTrimmed)) {
      Alert.alert('Enter code', 'Enter the 4-digit code.');
      return;
    }
    const userId = effectiveUserId ?? 'guest';
    setJoinLoading(true);
    try {
      const base = CHAT_API_BASE.replace(/\/$/, '');
      const res = await fetch(`${base}/trips/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeTrimmed, user_id: userId }),
      });
      if (res.ok) {
        const trip = await res.json();
        const localTrip: Trip = {
          id: trip.id,
          name: trip.name,
          destination: trip.destination ?? 'TBD',
          status: (trip.status ?? 'planning') as TripStatus,
          createdBy: trip.createdBy ?? '',
          createdAt: typeof trip.createdAt === 'number' ? trip.createdAt : Date.now(),
        };
        addTripFromApi(localTrip);
        await refetchTrips();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setJoinModalVisible(false);
        setJoinCode('');
        router.push(`/trip/${trip.id}`);
        return;
      }
      if (res.status === 404) {
        Alert.alert('Invalid code', 'That code was not found. Check the number and try again.');
        return;
      }
      Alert.alert('Invalid code', 'That code wasn’t found. Check the number and try again.');
    } catch {
      Alert.alert(
        'Error',
        "Couldn't connect to the trip server. On a phone, the app must use your computer's IP: in the project folder set EXPO_PUBLIC_CHAT_WS_BASE=http://YOUR_PC_IP:8000 in .env, then restart Expo."
      );
    } finally {
      setJoinLoading(false);
    }
  };

  // Deduplicate by id (handles double-join from Strict Mode / deep link)
  const uniqueTrips = trips.filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i);
  const currentTrips = uniqueTrips.filter(
    (t) => t.status === 'planning' || t.status === 'booked' || t.status === 'live'
  );
  const pastTrips = uniqueTrips.filter((t) => t.status === 'done');

  return (
    <>
      <TabScreenWrapper>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Animated.View entering={FadeInUp.duration(320).delay(0)}>
            <Text style={[styles.headerLabel, { color: colors.textSecondary }]}>Your adventures</Text>
          </Animated.View>
          <Animated.View entering={FadeInUp.duration(360).delay(40)}>
            <Text style={[styles.title, { color: colors.text }]}>Your trips</Text>
          </Animated.View>
          <Animated.View entering={FadeInUp.duration(360).delay(80)}>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {uniqueTrips.length === 0
                ? 'Trips you create or join will appear here'
                : `${uniqueTrips.length} trip${uniqueTrips.length === 1 ? '' : 's'}`}
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInUp.duration(360).delay(120)}>
          <View style={styles.quickActions}>
            <Pressable
              style={({ pressed }) => [
                styles.quickActionPrimary,
                { backgroundColor: colors.tint },
                pressed && styles.buttonPressed,
              ]}
              onPress={handleOpenJoinModal}
              accessibilityRole="button"
              accessibilityLabel="Join trip">
              <IconSymbol name="link" size={20} color="#FFFFFF" />
              <Text style={styles.quickActionPrimaryText}>Join trip</Text>
            </Pressable>
          </View>
          </Animated.View>
        </View>

      {tripsLoading && uniqueTrips.length === 0 && (
        <Animated.View entering={FadeInDown.springify()} style={styles.loadingCard}>
          <View style={[styles.loadingCardInner, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading your trips…</Text>
          </View>
        </Animated.View>
      )}

      {!tripsLoading && currentTrips.length > 0 && (
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Current</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Trips you're planning or traveling on
            </Text>
          </View>
          {currentTrips.map((trip, i) => (
            <Animated.View key={trip.id} entering={FadeInRight.delay(80 + i * 60).springify()}>
              <TripCard trip={trip} index={i} />
            </Animated.View>
          ))}
        </Animated.View>
      )}

      {!tripsLoading && pastTrips.length > 0 && (
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.pastSection}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Past trips</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              Trips you've completed
            </Text>
          </View>
          {pastTrips.map((trip, i) => (
            <Animated.View key={trip.id} entering={FadeInRight.delay(80 + i * 60).springify()}>
              <TripCard trip={trip} index={currentTrips.length + i} />
            </Animated.View>
          ))}
        </Animated.View>
      )}

      {!tripsLoading && uniqueTrips.length === 0 && (
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.empty}>
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={styles.emptyEmoji}>✈️</Text>
            <Text style={[styles.emptyText, { color: colors.text }]}>No trips yet</Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Create a trip to start planning, or join one with a code from a friend
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.emptyCta,
                { backgroundColor: colors.tint },
                pressed && styles.buttonPressed,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/create');
              }}>
              <Text style={styles.emptyCtaText}>Create your first trip</Text>
              <IconSymbol name="chevron.right" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        </Animated.View>
      )}
    </ScrollView>
      </TabScreenWrapper>

      <Modal
        visible={joinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setJoinModalVisible(false)}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setJoinModalVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}>
            <Pressable
              style={[styles.modalContent, { backgroundColor: colors.background }]}
              onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Enter code</Text>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Join trip</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Ask your friend for the 4-digit code, then enter it below
              </Text>
              <TextInput
                ref={joinCodeInputRef}
                style={[
                  styles.modalCodeInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="0000"
                placeholderTextColor={colors.textTertiary}
                value={joinCode}
                onChangeText={(t) => setJoinCode(t.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleJoinTrip}
                onKeyPress={(e) => {
                  if (e.nativeEvent.key === 'Enter') handleJoinTrip();
                }}
              />
              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.border }]}
                  onPress={() => setJoinModalVisible(false)}
                  disabled={joinLoading}>
                  <Text style={[styles.modalBtnTextCancel, { color: colors.text }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnJoin, { backgroundColor: colors.tint }]}
                  onPress={handleJoinTrip}
                  disabled={joinLoading || joinCode.trim().length !== 4}>
                  <Text style={styles.modalBtnTextJoin}>
                    {joinLoading ? '…' : 'Join'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
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
  headerLabel: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    marginBottom: 2,
  },
  title: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
  },
  subtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  quickActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  quickActionPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  quickActionPrimaryText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  section: {
    marginBottom: Spacing.lg,
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
  pastSection: {
    marginTop: Spacing.xl,
  },
  loadingCard: {
    marginBottom: Spacing.lg,
  },
  loadingCardInner: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
  },
  empty: {
    paddingVertical: Spacing.lg,
  },
  emptyCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 56,
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
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
  },
  emptyCtaText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalKeyboard: {
    width: '100%',
    maxWidth: 400,
  },
  modalContent: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    width: '100%',
  },
  modalLabel: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    marginBottom: 2,
  },
  modalTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 22,
    marginBottom: Spacing.sm,
  },
  modalSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  modalCodeInput: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 24,
    letterSpacing: 8,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.md,
  },
  modalBtnCancel: {
    borderWidth: 1,
  },
  modalBtnJoin: {},
  modalBtnTextCancel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
  },
  modalBtnTextJoin: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    color: '#FFFFFF',
  },
});
