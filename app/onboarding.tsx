import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { useUser } from '@/contexts/user-context';
import { Colors, Spacing, Radius } from '@/constants/theme';


export default function OnboardingScreen() {
  const [step, setStep] = useState<'welcome' | 'name'>('welcome');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const { setUser } = useUser();
  const router = useRouter();

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('name');
  };

  const handleDone = () => {
    const first = firstName.trim() || 'Traveler';
    const last = lastName.trim() || '';
    if (!first) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setUser({
      id: `user_${Date.now()}`,
      firstName: first,
      lastName: last,
      avatar: `${first[0]}${last[0] || ''}`.toUpperCase(),
    });
    router.replace('/(tabs)');
  };

  if (step === 'welcome') {
    return (
      <View style={styles.container}>
        <View style={styles.welcomeContent}>
          <Animated.View
            entering={FadeInUp.delay(200).springify()}
            style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>✈️</Text>
            </View>
          </Animated.View>
          <Animated.Text
            entering={FadeInUp.delay(400).springify()}
            style={styles.title}>
            Going Places
          </Animated.Text>
          <Animated.Text
            entering={FadeInUp.delay(500).springify()}
            style={styles.tagline}>
            Get your trips out of the group chat{'\n'}and into the real world
          </Animated.Text>
          <Animated.View entering={FadeInDown.delay(700).springify()}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleGetStarted}>
              <Text style={styles.primaryButtonText}>Get started</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.nameContent}>
        <Animated.Text
          entering={FadeIn.duration(400)}
          style={styles.nameTitle}>
          {"What's your name?"}
        </Animated.Text>
        <Animated.Text
          entering={FadeIn.delay(100).duration(400)}
          style={styles.nameSubtitle}>
          Just first and last — no passwords, no fuss
        </Animated.Text>
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="First name"
            placeholderTextColor={Colors.light.textTertiary}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoFocus
          />
          <TextInput
            style={styles.input}
            placeholder="Last name"
            placeholderTextColor={Colors.light.textTertiary}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
          />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
              (!firstName.trim() && !lastName.trim()) && styles.buttonDisabled,
            ]}
            onPress={handleDone}
            disabled={!firstName.trim() && !lastName.trim()}>
            <Text style={styles.primaryButtonText}>{"Let's go"}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  welcomeContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: 80,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: Spacing.xl,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.light.accentMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoEmoji: {
    fontSize: 48,
  },
  title: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 36,
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 17,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: Spacing.xxl,
  },
  primaryButton: {
    backgroundColor: Colors.light.tint,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: Radius.lg,
    minWidth: 200,
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
  nameContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: 80,
  },
  nameTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
    color: Colors.light.text,
    marginBottom: Spacing.sm,
  },
  nameSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    color: Colors.light.textSecondary,
    marginBottom: Spacing.xl,
  },
  inputRow: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
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
});
