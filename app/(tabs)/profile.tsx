import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing, Radius } from '@/constants/theme';
import { useUser } from '@/contexts/user-context';
import { useTheme } from '@/contexts/theme-context';

const NOTIFICATIONS_STORAGE_KEY = '@goingplaces_notifications';

type NotificationPreference = 'all' | 'trips' | 'none';

const NOTIFICATION_OPTIONS: { value: NotificationPreference; label: string }[] = [
  { value: 'all', label: 'All notifications' },
  { value: 'trips', label: 'Trip updates only' },
  { value: 'none', label: 'Off' },
];

function getNotificationLabel(value: NotificationPreference): string {
  return NOTIFICATION_OPTIONS.find((o) => o.value === value)?.label ?? 'Trip updates only';
}

export default function ProfileScreen() {
  const { user } = useUser();
  const { colorScheme, colors, toggleTheme } = useTheme();
  const [notificationPref, setNotificationPref] = useState<NotificationPreference>('trips');
  const [notificationsExpanded, setNotificationsExpanded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY).then((stored) => {
      if (stored === 'all' || stored === 'trips' || stored === 'none') {
        setNotificationPref(stored);
      }
    });
  }, []);

  const setNotificationPreference = (value: NotificationPreference) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotificationPref(value);
    AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, value);
    setNotificationsExpanded(false);
  };

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
          <Pressable
            style={({ pressed }) => [styles.settingRow, pressed && styles.rowPressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setNotificationsExpanded((e) => !e);
            }}>
            <IconSymbol name="paperplane.fill" size={20} color={colors.textSecondary} />
            <View style={styles.settingContent}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Notifications</Text>
              <Text style={[styles.settingSublabel, { color: colors.textSecondary }]}>
                {getNotificationLabel(notificationPref)}
              </Text>
            </View>
            <IconSymbol
              name="chevron.right"
              size={16}
              color={colors.textTertiary}
              style={{ transform: [{ rotate: notificationsExpanded ? '90deg' : '0deg' }] }}
            />
          </Pressable>
          {notificationsExpanded && (
            <View style={[styles.notificationOptions, { borderTopColor: colors.borderLight }]}>
              {NOTIFICATION_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={({ pressed }) => [
                    styles.notificationOption,
                    { backgroundColor: pressed ? colors.surfaceMuted : undefined },
                  ]}
                  onPress={() => setNotificationPreference(opt.value)}>
                  <Text style={[styles.notificationOptionLabel, { color: colors.text }]}>{opt.label}</Text>
                  {notificationPref === opt.value && (
                    <IconSymbol name="checkmark" size={20} color={colors.tint} />
                  )}
                </Pressable>
              ))}
            </View>
          )}
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <View style={styles.settingRow}>
            <IconSymbol
              name="person.fill"
              size={20}
              color={colors.textSecondary}
            />
            <View style={styles.settingContent}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Theme</Text>
              <Text style={[styles.settingSublabel, { color: colors.textSecondary }]}>
                {colorScheme === 'light' ? 'Light' : 'Dark'}
              </Text>
            </View>
            <Switch
              value={colorScheme === 'dark'}
              onValueChange={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleTheme();
              }}
              trackColor={{ false: colors.borderLight, true: colors.accentMuted }}
              thumbColor={colorScheme === 'dark' ? colors.tint : colors.surface}
            />
          </View>
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
  notificationOptions: {
    borderTopWidth: 1,
    paddingLeft: Spacing.md + 20 + Spacing.md,
  },
  notificationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.md,
    paddingLeft: Spacing.sm,
  },
  notificationOptionLabel: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
  },
});
