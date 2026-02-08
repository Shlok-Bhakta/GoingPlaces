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
import { useTheme } from '@/contexts/theme-context';
import { Spacing, Radius } from '@/constants/theme';

const CHAT_API_BASE = process.env.EXPO_PUBLIC_CHAT_WS_BASE ?? 'http://localhost:8000';

export default function OnboardingScreen() {
  const [step, setStep] = useState<'welcome' | 'name'>('welcome');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const { setUser } = useUser();
  const router = useRouter();
  const { colors } = useTheme();

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('name');
  };

  const handleDone = async () => {
    const first = firstName.trim() || 'Traveler';
    const last = lastName.trim() || '';
    if (!first) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const newUser = {
      id: userId,
      firstName: first,
      lastName: last,
      avatar: `${first[0]}${last[0] || ''}`.toUpperCase(),
    };
    
    // Save user locally first
    setUser(newUser);
    
    // Try to save user to backend database
    if (CHAT_API_BASE) {
      try {
        const base = CHAT_API_BASE.replace(/\/$/, '');
        await fetch(`${base}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            email: `${userId}@goingplaces.local`, // Dummy email for now
            first_name: first,
            last_name: last,
            username: null,
            avatar_url: null,
          }),
        });
      } catch (error) {
        console.error('Failed to save user to backend:', error);
        // Continue anyway - user is saved locally
      }
    }
    
    router.replace('/(tabs)');
  };

  if (step === 'welcome') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.welcomeContent}>
          <Animated.View
            entering={FadeInUp.delay(200).springify()}
            style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.accentMuted }]}>
              <Text style={styles.logoEmoji}>✈️</Text>
            </View>
          </Animated.View>
          <Animated.Text
            entering={FadeInUp.delay(400).springify()}
            style={[styles.title, { color: colors.text }]}>
            Going Places
          </Animated.Text>
          <Animated.Text
            entering={FadeInUp.delay(500).springify()}
            style={[styles.tagline, { color: colors.textSecondary }]}>
            Get your trips out of the group chat{'\n'}and into the real world
          </Animated.Text>
          <Animated.View entering={FadeInDown.delay(700).springify()}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint },
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
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.nameContent}>
        <Animated.Text
          entering={FadeIn.duration(400)}
          style={[styles.nameTitle, { color: colors.text }]}>
          {"What's your name?"}
        </Animated.Text>
        <Animated.Text
          entering={FadeIn.delay(100).duration(400)}
          style={[styles.nameSubtitle, { color: colors.textSecondary }]}>
          Just first and last — no passwords, no fuss
        </Animated.Text>
        <Animated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            placeholder="First name"
            placeholderTextColor={colors.textTertiary}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoFocus
          />
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            placeholder="Last name"
            placeholderTextColor={colors.textTertiary}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
          />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint },
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoEmoji: {
    fontSize: 48,
  },
  title: {
    fontFamily: 'Fraunces_700Bold',
    fontSize: 36,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: Spacing.xxl,
  },
  primaryButton: {
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
    marginBottom: Spacing.sm,
  },
  nameSubtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    marginBottom: Spacing.xl,
  },
  inputRow: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  input: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 17,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
});
