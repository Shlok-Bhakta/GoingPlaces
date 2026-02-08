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
import { Spacing, Radius } from '@/constants/theme';
import { useUser } from '@/contexts/user-context';
import { useTrips } from '@/contexts/trips-context';
import { useTheme } from '@/contexts/theme-context';

const STEPS = ['Details', 'Invite'];

export default function CreateTripScreen() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startCity, setStartCity] = useState('');
  const { user } = useUser();
  const { addTrip } = useTrips();
  const router = useRouter();
  const { colors } = useTheme();

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleCreate();
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 0) setStep(step - 1);
  };

  const handleCreate = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const tripId = addTrip({
      name: name.trim() || 'New Trip',
      destination: destination.trim() || 'TBD',
      startingCity: startCity.trim() || undefined,
      status: 'planning',
      createdBy: user?.id ?? 'current',
    });
    router.replace(`/trip/${tripId}`);
  };

  const canProceed =
    step === 0
      ? (name.trim().length > 0 && destination.trim().length > 0)
      : true;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <Pressable
          style={styles.headerLeftBtn}
          onPress={step > 0 ? handleBack : () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace('/(tabs)');
          }}>
          <IconSymbol
            name={step > 0 ? 'chevron.left' : 'xmark'}
            size={20}
            color={colors.text}
          />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Create trip</Text>
        <View style={styles.stepDots}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === step ? colors.tint : i < step ? colors.success : colors.border },
                i === step && styles.dotActive,
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
            <Text style={[styles.stepTitle, { color: colors.text }]}>Trip details</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              Enter a trip name and destination to continue. You can edit these later.
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="Trip name"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="Starting city (optional)"
              placeholderTextColor={colors.textTertiary}
              value={startCity}
              onChangeText={setStartCity}
            />
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="Destination or event"
              placeholderTextColor={colors.textTertiary}
              value={destination}
              onChangeText={setDestination}
            />
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View
            entering={FadeInDown.springify()}
            style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Invite friends</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              Share a link — anyone who clicks joins the trip
            </Text>
            <View style={[styles.inviteBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.inviteLink, { color: colors.textSecondary }]}>goingplaces.app/join/abc123</Text>
              <Pressable
                style={styles.copyBtn}
                onPress={() =>
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success
                  )
                }>
                <Text style={[styles.copyBtnText, { color: colors.tint }]}>Copy</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.borderLight, backgroundColor: colors.background }]}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint },
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
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  headerLeftBtn: {
    position: 'absolute',
    top: 56,
    left: Spacing.lg,
    zIndex: 1,
    padding: Spacing.sm,
  },
  headerTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
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
  },
  dotActive: {
    width: 20,
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
  },
  stepSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    marginBottom: Spacing.sm,
  },
  input: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 17,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  inviteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
  },
  inviteLink: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 14,
    paddingVertical: Spacing.md,
  },
  copyBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  copyBtnText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 14,
  },
  footer: {
    padding: Spacing.lg,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  primaryButton: {
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
