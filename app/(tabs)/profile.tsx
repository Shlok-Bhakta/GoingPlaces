import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useUser } from '@/contexts/user-context';

export default function ProfileScreen() {
  const { user } = useUser();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ')
    : 'Traveler';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.avatar || displayName.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{displayName}</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).springify()}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <View style={styles.settingsCard}>
          <SettingRow
            icon="paperplane.fill"
            label="Notifications"
            sublabel="Trip updates and reminders"
          />
          <View style={styles.divider} />
          <SettingRow
            icon="map.fill"
            label="Default maps app"
            sublabel="Apple Maps"
          />
          <View style={styles.divider} />
          <SettingRow
            icon="person.fill"
            label="Theme"
            sublabel="Light (demo)"
          />
        </View>
      </Animated.View>
    </ScrollView>
  );
}

function SettingRow({
  icon,
  label,
  sublabel,
}: {
  icon: string;
  label: string;
  sublabel: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.settingRow, pressed && styles.rowPressed]}
      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
      <IconSymbol
        name={icon as any}
        size={20}
        color={Colors.light.textSecondary}
      />
      <View style={styles.settingContent}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingSublabel}>{sublabel}</Text>
      </View>
      <IconSymbol
        name="chevron.right"
        size={16}
        color={Colors.light.textTertiary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    paddingTop: 60,
    paddingBottom: 120,
    paddingHorizontal: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.light.accentMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
    color: Colors.light.tint,
  },
  name: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 24,
    color: Colors.light.text,
  },
  sectionTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 18,
    color: Colors.light.text,
    marginBottom: Spacing.md,
  },
  settingsCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  rowPressed: {
    opacity: 0.9,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    color: Colors.light.text,
  },
  settingSublabel: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginLeft: Spacing.md + 20 + Spacing.md,
  },
});
