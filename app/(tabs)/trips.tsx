import React, { useState } from 'react';
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
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { TripCard } from '@/components/trip-card';
import { Spacing, Radius } from '@/constants/theme';
import { useTrips } from '@/contexts/trips-context';
import { useTheme } from '@/contexts/theme-context';

const CHAT_API_BASE = process.env.EXPO_PUBLIC_CHAT_WS_BASE ?? 'http://localhost:8000';

export default function TripsScreen() {
  const { trips, joinTrip } = useTrips();
  const { colors } = useTheme();
  const router = useRouter();
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  const handleOpenJoinModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setJoinCode('');
    setJoinModalVisible(true);
  };

  const finishJoin = (tripId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    joinTrip(tripId);
    setJoinModalVisible(false);
    setJoinCode('');
    router.push(`/trip/${tripId}`);
  };

  const handleJoinTrip = async () => {
    const codeTrimmed = joinCode.trim();
    if (codeTrimmed.length !== 4 || !/^\d{4}$/.test(codeTrimmed)) {
      Alert.alert('Enter code', 'Enter the 4-digit code.');
      return;
    }
    setJoinLoading(true);
    try {
      const base = CHAT_API_BASE.replace(/\/$/, '');
      console.log('CHAT_API_BASE:', base);
      const res = await fetch(`${base}/resolve-code?code=${encodeURIComponent(codeTrimmed)}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.trip_id) {
          finishJoin(data.trip_id);
          return;
        }
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
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.text }]}>Your trips</Text>
            <Pressable
              style={[styles.joinBtn, { backgroundColor: colors.tint }]}
              onPress={handleOpenJoinModal}
              accessibilityRole="button"
              accessibilityLabel="Join trip">
              <Text style={styles.joinBtnText}>Join trip</Text>
              <IconSymbol name="link" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {uniqueTrips.length === 0
              ? 'Trips you create or join will appear here'
              : `${uniqueTrips.length} trip${uniqueTrips.length === 1 ? '' : 's'}`}
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

      {uniqueTrips.length === 0 && (
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
              <Text style={[styles.modalTitle, { color: colors.text }]}>Join trip</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Enter the 4-digit code
              </Text>
              <TextInput
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  title: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
    flex: 1,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  joinBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
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
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    width: '100%',
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
