import React, { useState } from 'react';
import { 
  Text, 
  StyleSheet, 
  ScrollView, 
  Pressable, 
  View, 
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { TripCard } from '@/components/trip-card';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/theme-context';
import { useUser } from '@/contexts/user-context';
import { useTrips as useConvexTrips, useJoinTripByToken } from '@/hooks/useConvex';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Id } from '@/convex/_generated/dataModel';

export default function TripsScreen() {
  const { colors } = useTheme();
  const { user } = useUser();
  const router = useRouter();
  const convexTrips = useConvexTrips(user?.id as Id<"users"> | undefined) ?? [];
  
  // Map Convex trips to the Trip type expected by components
  const trips = convexTrips
    .filter((t) => t !== null)
    .map((t) => ({
      id: t._id,
      name: t.name,
      destination: t.destination,
      startDate: t.startDate,
      endDate: t.endDate,
      startingCity: t.startingCity,
      status: t.status,
      coverImage: t.coverImage,
      color: t.color,
      createdBy: t.createdBy,
      createdAt: t.createdAt,
    }));
  
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const joinTrip = useJoinTripByToken();

  const currentTrips = trips.filter(
    (t) => t.status === 'planning' || t.status === 'booked' || t.status === 'live'
  );
  const pastTrips = trips.filter((t) => t.status === 'done');

  const handleJoinTrip = async () => {
    if (!joinCode.trim() || !user) return;
    
    try {
      setIsJoining(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      const tripId = await joinTrip({
        token: joinCode.trim().toUpperCase(),
        userId: user.id as Id<"users">,
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowJoinModal(false);
      setJoinCode('');
      router.push(`/trip/${tripId}`);
    } catch (error) {
      console.error('Error joining trip:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Invalid Code', 'Could not find a trip with that code. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <>
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

        <Animated.View entering={FadeInDown.delay(50).springify()} style={styles.joinButton}>
          <Pressable
            style={({ pressed }) => [
              styles.joinBtn,
              { backgroundColor: colors.surface, borderColor: colors.borderLight },
              pressed && styles.joinBtnPressed,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowJoinModal(true);
            }}>
            <IconSymbol name="plus.circle.fill" size={20} color={colors.tint} />
            <Text style={[styles.joinBtnText, { color: colors.text }]}>Join trip with code</Text>
          </Pressable>
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
              Tap Create to start planning or join a trip with a code
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      <Modal
        visible={showJoinModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowJoinModal(false)}>
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowJoinModal(false);
                setJoinCode('');
              }}>
              <IconSymbol name="xmark" size={20} color={colors.text} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Join trip</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.modalContent}>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Enter the 4-character code shared by your friend
            </Text>
            
            <TextInput
              style={[styles.codeInput, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="ABCD"
              placeholderTextColor={colors.textTertiary}
              value={joinCode}
              onChangeText={(text) => setJoinCode(text.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={4}
              autoFocus
            />

            <Pressable
              style={({ pressed }) => [
                styles.joinSubmitBtn,
                { backgroundColor: colors.tint },
                pressed && styles.joinSubmitBtnPressed,
                (joinCode.length !== 4 || isJoining) && styles.joinSubmitBtnDisabled,
              ]}
              onPress={handleJoinTrip}
              disabled={joinCode.length !== 4 || isJoining}>
              <Text style={styles.joinSubmitBtnText}>
                {isJoining ? 'Joining...' : 'Join trip'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
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
    marginBottom: Spacing.lg,
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
  joinButton: {
    marginBottom: Spacing.xl,
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  joinBtnPressed: {
    opacity: 0.7,
  },
  joinBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 15,
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
    fontSize: 48,
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
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  modalCloseBtn: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
  },
  modalTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
  },
  modalContent: {
    padding: Spacing.xl,
  },
  modalSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  codeInput: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 36,
    textAlign: 'center',
    letterSpacing: 12,
    borderWidth: 2,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  joinSubmitBtn: {
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  joinSubmitBtnPressed: {
    opacity: 0.9,
  },
  joinSubmitBtnDisabled: {
    opacity: 0.5,
  },
  joinSubmitBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 17,
    color: '#FFFFFF',
  },
});
