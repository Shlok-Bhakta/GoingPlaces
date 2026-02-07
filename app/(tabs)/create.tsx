import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useUser } from '@/contexts/user-context';
import { useTrips } from '@/contexts/trips-context';

const STEPS = ['Basics', 'Destination', 'Generate', 'Invite'];

export default function CreateTripScreen() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startCity, setStartCity] = useState('');
  const { user } = useUser();
  const { addTrip } = useTrips();
  const router = useRouter();

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleCreate();
    }
  };

  const handleCreate = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const tripId = addTrip({
      name: name || 'New Trip',
      destination: destination || 'TBD',
      startingCity: startCity || undefined,
      status: 'planning',
      createdBy: user?.id ?? 'current',
    });
    router.replace(`/trip/${tripId}`);
  };

  const canProceed =
    step === 0 ? true : step === 1 ? !!destination : true;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <Pressable
          style={styles.closeBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace('/(tabs)');
          }}>
          <IconSymbol name="xmark" size={20} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Create trip</Text>
        <View style={styles.stepDots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === step && styles.dotActive,
                i < step && styles.dotDone,
              ]}
            />
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <Animated.View
            entering={FadeInDown.springify()}
            style={styles.stepContent}>
            <Text style={styles.stepTitle}>Trip basics</Text>
            <Text style={styles.stepSubtitle}>
              You can always edit these later — or skip and start chatting!
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Trip name"
              placeholderTextColor={Colors.light.textTertiary}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Starting city (optional)"
              placeholderTextColor={Colors.light.textTertiary}
              value={startCity}
              onChangeText={setStartCity}
            />
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View
            entering={FadeInDown.springify()}
            style={styles.stepContent}>
            <Text style={styles.stepTitle}>Where to?</Text>
            <Text style={styles.stepSubtitle}>
              Search for a destination or pick a mock event
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Destination or event"
              placeholderTextColor={Colors.light.textTertiary}
              value={destination}
              onChangeText={setDestination}
              autoFocus
            />
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View
            entering={FadeInDown.springify()}
            style={styles.stepContent}>
            <Text style={styles.stepTitle}>Generate with AI</Text>
            <Text style={styles.stepSubtitle}>
              {"We'll create a draft itinerary and suggestions based on your trip"}
            </Text>
            <View style={styles.generatePreview}>
              <Text style={styles.generatePlaceholder}>
                Itinerary will be generated when you open the trip and chat with
                the AI assistant
              </Text>
            </View>
          </Animated.View>
        )}

        {step === 3 && (
          <Animated.View
            entering={FadeInDown.springify()}
            style={styles.stepContent}>
            <Text style={styles.stepTitle}>Invite friends</Text>
            <Text style={styles.stepSubtitle}>
              Share a link — anyone who clicks joins the trip
            </Text>
            <View style={styles.inviteBox}>
              <Text style={styles.inviteLink}>goingplaces.app/join/abc123</Text>
              <Pressable
                style={styles.copyBtn}
                onPress={() =>
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success
                  )
                }>
                <Text style={styles.copyBtnText}>Copy</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
            !canProceed && styles.buttonDisabled,
          ]}
          onPress={handleNext}
          disabled={!canProceed}>
          <Text style={styles.primaryButtonText}>
            {step === STEPS.length - 1 ? 'Go to trip' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    left: Spacing.lg,
    zIndex: 1,
    padding: Spacing.sm,
  },
  headerTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
    color: Colors.light.text,
    textAlign: 'center',
  },
  stepDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.light.border,
  },
  dotActive: {
    backgroundColor: Colors.light.tint,
    width: 20,
  },
  dotDone: {
    backgroundColor: Colors.light.success,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 120,
  },
  stepContent: {
    gap: Spacing.md,
  },
  stepTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 24,
    color: Colors.light.text,
  },
  stepSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    color: Colors.light.textSecondary,
    marginBottom: Spacing.sm,
  },
  input: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 17,
    color: Colors.light.text,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  generatePreview: {
    backgroundColor: Colors.light.surfaceMuted,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    minHeight: 120,
    justifyContent: 'center',
  },
  generatePlaceholder: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  inviteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: Spacing.md,
  },
  inviteLink: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    color: Colors.light.textSecondary,
    paddingVertical: Spacing.md,
  },
  copyBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  copyBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
    color: Colors.light.tint,
  },
  footer: {
    padding: Spacing.lg,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    backgroundColor: Colors.light.background,
  },
  primaryButton: {
    backgroundColor: Colors.light.tint,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 17,
    color: '#FFFFFF',
  },
});
