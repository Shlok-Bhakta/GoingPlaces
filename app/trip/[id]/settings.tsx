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
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing, Radius } from '@/constants/theme';
import { useTrips } from '@/contexts/trips-context';
import { useTheme } from '@/contexts/theme-context';

export default function TripSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getTrip, updateTrip } = useTrips();
  const router = useRouter();
  const { colors } = useTheme();
  const trip = id ? getTrip(id) : undefined;

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startingCity, setStartingCity] = useState('');

  useEffect(() => {
    if (trip) {
      setName(trip.name);
      setDestination(trip.destination);
      setStartingCity(trip.startingCity ?? '');
    }
  }, [trip]);

  useEffect(() => {
    if (id && !trip) router.replace('/(tabs)');
  }, [id, trip, router]);

  const handleSave = () => {
    if (!id || !trip) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateTrip(id, {
      name: name.trim() || trip.name,
      destination: destination.trim() || trip.destination,
      startingCity: startingCity.trim() || undefined,
    });
    router.back();
  };

  if (!trip) return null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}>
          <IconSymbol name="chevron.left" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Trip settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Trip name</Text>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          placeholder="Trip name"
          placeholderTextColor={colors.textTertiary}
          value={name}
          onChangeText={setName}
        />
        <Text style={[styles.label, { color: colors.textSecondary }]}>Destination</Text>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          placeholder="Destination or event"
          placeholderTextColor={colors.textTertiary}
          value={destination}
          onChangeText={setDestination}
        />
        <Text style={[styles.label, { color: colors.textSecondary }]}>Starting city (optional)</Text>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          placeholder="Starting city"
          placeholderTextColor={colors.textTertiary}
          value={startingCity}
          onChangeText={setStartingCity}
        />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.borderLight, backgroundColor: colors.background }]}>
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.tint },
            pressed && styles.buttonPressed,
          ]}
          onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save changes</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
  },
  headerTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 120,
    gap: Spacing.sm,
  },
  label: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    marginTop: Spacing.md,
    marginBottom: 4,
  },
  input: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 17,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  footer: {
    padding: Spacing.lg,
    paddingBottom: 40,
    borderTopWidth: 1,
  },
  saveButton: {
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.9 },
  saveButtonText: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 17,
    color: '#FFFFFF',
  },
});
