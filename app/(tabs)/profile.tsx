import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useUser } from '@/contexts/user-context';
import { useTheme } from '@/contexts/theme-context';

export default function ProfileScreen() {
  const { user } = useUser();
  const { colorScheme, colors, toggleTheme } = useTheme();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ')
    : 'Traveler';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: colors.accentMuted }]}>
          <Text style={[styles.avatarText, { color: colors.tint }]}>
            {user?.avatar || displayName.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).springify()}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>
        <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <SettingRow
            icon="paperplane.fill"
            label="Notifications"
            sublabel="Trip updates and reminders"
          />
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <SettingRow
            icon="map.fill"
            label="Default maps app"
            sublabel="Apple Maps"
          />
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <SettingRow
            icon="person.fill"
            label="Theme"
            sublabel={colorScheme === 'light' ? 'Light' : 'Dark'}
            onPress={toggleTheme}
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
  onPress,
}: {
  icon: string;
  label: string;
  sublabel: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };
  return (
    <Pressable
      style={({ pressed }) => [styles.settingRow, pressed && styles.rowPressed]}
      onPress={handlePress}>
      <IconSymbol
        name={icon as any}
        size={20}
        color={colors.textSecondary}
      />
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.settingSublabel, { color: colors.textSecondary }]}>{sublabel}</Text>
      </View>
      <IconSymbol
        name="chevron.right"
        size={16}
        color={colors.textTertiary}
      />
    </Pressable>
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
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 28,
  },
  name: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 24,
  },
  sectionTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 18,
    marginBottom: Spacing.md,
  },
  settingsCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
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
  },
  settingSublabel: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginLeft: Spacing.md + 20 + Spacing.md,
  },
});
