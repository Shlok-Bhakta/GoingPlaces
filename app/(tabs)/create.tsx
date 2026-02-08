import React, { useState, useEffect } from 'react';
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
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing, Radius } from '@/constants/theme';
import { useUser } from '@/contexts/user-context';
import { useTheme } from '@/contexts/theme-context';
import { useCreateTrip, useGenerateInviteLink } from '@/hooks/useConvex';
import { Id } from '@/convex/_generated/dataModel';

const STEPS = ['Name', 'Code'];

export default function CreateTripScreen() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdTripId, setCreatedTripId] = useState<string | null>(null);
  
  const { user } = useUser();
  const router = useRouter();
  const { colors } = useTheme();
  const createTrip = useCreateTrip();
  const generateInviteLink = useGenerateInviteLink();

  // Generate invite code when we reach step 1
  useEffect(() => {
    if (step === 1 && createdTripId && !inviteCode) {
      generateCode();
    }
  }, [step, createdTripId]);

  const generateCode = async () => {
    if (!createdTripId) return;
    try {
      const code = await generateInviteLink({ tripId: createdTripId as Id<"trips"> });
      setInviteCode(code);
    } catch (error) {
      console.error('Error generating invite code:', error);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied!', `Code ${inviteCode} copied to clipboard`);
  };

  const handleNext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    // Create trip when moving to step 1 (code step)
    if (step === 0 && !createdTripId) {
      await handleCreate();
      setStep(1);
    } else if (step === 1) {
      // Go to trip
      if (createdTripId) {
        router.replace(`/trip/${createdTripId}`);
      }
    }
  };

  const handleCreate = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create a trip.');
      return;
    }
    
    try {
      setIsCreating(true);
      
      // Create trip in Convex
      const tripId = await createTrip({
        name: name || 'New Trip',
        destination: 'TBD',
        status: 'planning' as const,
        createdBy: user.id as Id<"users">,
      });
      
      setCreatedTripId(tripId as string);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error creating trip:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Error Creating Trip',
        error instanceof Error ? error.message : 'Could not create trip. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsCreating(false);
    }
  };

  const canProceed = step === 0 ? name.trim().length > 0 : true;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <Pressable
          style={styles.closeBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace('/(tabs)');
          }}>
          <IconSymbol name="xmark" size={20} color={colors.text} />
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
            <Text style={[styles.stepTitle, { color: colors.text }]}>Name your trip</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              Give your trip a fun name
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="e.g. Tokyo Adventure"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </Animated.View>
        )}

        {step === 1 && (
          <Animated.View
            entering={FadeInDown.springify()}
            style={styles.stepContent}>
            <Text style={[styles.stepTitle, { color: colors.text }]}>Share code</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
              Tap the code to copy and share with friends
            </Text>
            
            {inviteCode ? (
              <Pressable 
                style={[styles.codeBox, { backgroundColor: colors.surface, borderColor: colors.tint }]}
                onPress={handleCopyCode}>
                <Text style={[styles.codeText, { color: colors.tint }]}>
                  {inviteCode}
                </Text>
                <Text style={[styles.codeTap, { color: colors.textSecondary }]}>
                  Tap to copy
                </Text>
              </Pressable>
            ) : (
              <View style={[styles.codeBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <ActivityIndicator color={colors.tint} size="large" />
              </View>
            )}
            
            <Text style={[styles.codeHint, { color: colors.textTertiary }]}>
              Friends can enter this code on the Trips page to join
            </Text>
          </Animated.View>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.borderLight, backgroundColor: colors.background }]}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint },
            pressed && styles.buttonPressed,
            (!canProceed || isCreating) && styles.buttonDisabled,
          ]}
          onPress={handleNext}
          disabled={!canProceed || isCreating}>
          <Text style={styles.primaryButtonText}>
            {isCreating ? 'Creating...' : step === STEPS.length - 1 ? 'Go to trip' : 'Continue'}
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
    borderRadius: Radius.lg,
    borderWidth: 2,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  codeText: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 48,
    letterSpacing: 8,
  },
  codeTap: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  codeHint: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginTop: Spacing.sm,
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
