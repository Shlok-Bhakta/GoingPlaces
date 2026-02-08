import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing, Radius } from '@/constants/theme';
import { useUser } from '@/contexts/user-context';
import { useTrips } from '@/contexts/trips-context';
import { useTheme } from '@/contexts/theme-context';

const STEPS = ['Details', 'Invite'];

const CHAT_API_BASE = process.env.EXPO_PUBLIC_CHAT_WS_BASE ?? 'http://localhost:8000';

export default function CreateTripScreen() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [createdTripId, setCreatedTripId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [joinCodeLoading, setJoinCodeLoading] = useState(false);
  const { user } = useUser();
  const { addTrip } = useTrips();
  const router = useRouter();
  const { colors } = useTheme();
  
  const flashOpacity = useSharedValue(0);

  useEffect(() => {
    if (step !== 1 || !createdTripId) return;
    setJoinCodeLoading(true);
    fetch(`${CHAT_API_BASE.replace(/\/$/, '')}/register-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_id: createdTripId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.code) setJoinCode(data.code);
      })
      .catch(() => setJoinCode(null))
      .finally(() => setJoinCodeLoading(false));
  }, [step, createdTripId]);

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 0) {
      const tripId = addTrip({
        name: name.trim() || 'New Trip',
        destination: 'TBD',
        status: 'planning',
        createdBy: user?.id ?? 'current',
      });
      setCreatedTripId(tripId);
      setStep(1);
    } else {
      if (createdTripId) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(`/trip/${createdTripId}`);
      }
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 0) setStep(step - 1);
  };

  const handleCopyCode = async () => {
    if (!joinCode) return;
    await Clipboard.setStringAsync(joinCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    flashOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withTiming(0, { duration: 400 })
    );
  };

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const canProceed = step === 0 ? name.trim().length > 0 : true;

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
              Enter a trip name. You can edit it later.
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="Trip name"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
            />
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View
            entering={FadeInDown.springify()}
            style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Invite friends</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              Share this code with your friends. They can enter it in the Join Trip screen.
            </Text>
            <Pressable onPress={handleCopyCode} disabled={!joinCode || joinCodeLoading}>
              <View style={[styles.codeBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {joinCodeLoading ? (
                  <ActivityIndicator size="large" color={colors.tint} style={styles.codeLoader} />
                ) : joinCode ? (
                  <>
                    <Text style={[styles.joinCode, { color: colors.tint }]}>{joinCode}</Text>
                    <Text style={[styles.tapToCopy, { color: colors.textTertiary }]}>Tap to copy</Text>
                    <Animated.View 
                      style={[
                        StyleSheet.absoluteFill,
                        styles.flashOverlay,
                        flashStyle
                      ]} 
                      pointerEvents="none"
                    />
                  </>
                ) : (
                  <Text style={[styles.codeFallback, { color: colors.textSecondary }]}>
                    Couldn't load code. Try again later.
                  </Text>
                )}
              </View>
            </Pressable>
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
  codeBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
    borderWidth: 2,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    minHeight: 88,
  },
  joinCode: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 36,
    letterSpacing: 8,
  },
  tapToCopy: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    marginTop: 8,
  },
  flashOverlay: {
    backgroundColor: '#4ade80',
    borderRadius: Radius.lg,
  },
  codeLoader: {
    marginVertical: Spacing.sm,
  },
  codeFallback: {
    fontFamily: 'DMSans_400Regular',
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
