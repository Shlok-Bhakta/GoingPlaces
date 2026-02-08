import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useTrips, type ItineraryDay } from '@/contexts/trips-context';
import { useTheme } from '@/contexts/theme-context';

const TABS = ['Chat', 'Plan', 'Costs', 'Map', 'Album'] as const;

function createStyles(colors: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 10,
      paddingHorizontal: Spacing.md,
      paddingBottom: 8,
      minHeight: 30,
      overflow: 'hidden',
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    backBtn: { padding: Spacing.sm, marginLeft: -Spacing.sm },
    settingsBtn: { padding: Spacing.sm, marginRight: -Spacing.sm },
    headerContent: { flex: 1, marginLeft: Spacing.sm },
    tripName: {
      fontFamily: 'Fraunces_600SemiBold',
      fontSize: 18,
      color: colors.text,
    },
    tripNameOnGradient: {
      fontFamily: 'Fraunces_600SemiBold',
      fontSize: 18,
      color: '#FFFFFF',
    },
    tripDestination: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    tripDestinationOnGradient: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 13,
      color: 'rgba(255,255,255,0.9)',
      marginTop: 2,
    },
    tabScroll: {
      maxHeight: 50,
      flexShrink: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    tabScrollContent: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      gap: Spacing.xs,
      alignItems: 'center',
    },
    tab: {
      flex: 1,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabActive: { backgroundColor: colors.accentMuted },
    tabText: {
      fontFamily: 'DMSans_500Medium',
      fontSize: 14,
      color: colors.textSecondary,
    },
    tabTextActive: { color: colors.tint, fontFamily: 'DMSans_600SemiBold' },
    chatContainer: { flex: 1 },
    messagesScroll: { flex: 1 },
    messagesContent: { padding: Spacing.lg, paddingBottom: Spacing.xl },
    messageRow: { marginBottom: Spacing.md },
    messageRowUser: { alignItems: 'flex-end' },
    messageRowAI: { alignItems: 'flex-start' },
    messageBubble: { maxWidth: '85%', padding: Spacing.md, borderRadius: Radius.lg },
    bubbleUser: { backgroundColor: colors.tint, borderBottomRightRadius: 4 },
    bubbleAI: { backgroundColor: colors.surfaceMuted, borderBottomLeftRadius: 4 },
    messageName: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 12,
      color: colors.tint,
      marginBottom: 4,
    },
    messageText: { fontFamily: 'DMSans_400Regular', fontSize: 15 },
    messageTextUser: { color: '#FFFFFF' },
    messageTextAI: { color: colors.text },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      padding: Spacing.md,
      paddingBottom: Spacing.md,
      gap: Spacing.sm,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
    input: {
      flex: 1,
      fontFamily: 'DMSans_400Regular',
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      maxHeight: 100,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.tint,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendBtnPressed: { opacity: 0.9 },
    tabContent: { flex: 1 },
    tabContentInner: { padding: Spacing.lg, paddingBottom: 120 },
    placeholderTitle: {
      fontFamily: 'Fraunces_600SemiBold',
      fontSize: 20,
      color: colors.text,
      marginBottom: Spacing.sm,
    },
    placeholderText: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    mapContainer: { flex: 1 },
    mapPlaceholder: {
      flex: 1,
      backgroundColor: colors.surfaceMuted,
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xl,
    },
    mapPlaceholderTitle: {
      fontFamily: 'Fraunces_600SemiBold',
      fontSize: 20,
      color: colors.text,
      marginTop: Spacing.md,
    },
    mapPlaceholderText: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: Spacing.sm,
      lineHeight: 20,
    },
    errorText: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 16,
      color: colors.text,
      textAlign: 'center',
      marginTop: 100,
    },
    backLink: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 16,
      color: colors.tint,
      textAlign: 'center',
      marginTop: Spacing.md,
    },
    itineraryDay: {
      marginBottom: Spacing.xl,
    },
    itineraryDayTitle: {
      fontFamily: 'Fraunces_600SemiBold',
      fontSize: 18,
      color: colors.text,
      marginBottom: Spacing.sm,
      paddingBottom: Spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    itineraryDayDate: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: Spacing.md,
    },
    itineraryActivity: {
      flexDirection: 'row',
      marginBottom: Spacing.md,
      gap: Spacing.md,
    },
    itineraryActivityTime: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 13,
      color: colors.tint,
      minWidth: 56,
    },
    itineraryActivityContent: { flex: 1 },
    itineraryActivityTitle: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 15,
      color: colors.text,
    },
    itineraryActivityDesc: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 20,
    },
    itineraryActivityLocation: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 2,
    },
  });
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getTrip } = useTrips();
  const { colors } = useTheme();
  const trip = id ? getTrip(id) : null;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Chat');
  const [message, setMessage] = useState('');
  const messagesScrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState([
    { id: '1', content: "Hey! Let's figure out where we're staying.", isAI: false, name: 'You' },
    {
      id: '2',
      content: "I can help with that! Based on your dates and destination, I'd recommend looking at areas near downtown. What's your budget per night?",
      isAI: true,
      name: 'AI Assistant',
    },
  ]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/trips');
    }
  };

  if (!trip) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Trip not found</Text>
        <Pressable onPress={handleBack}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const insets = useSafeAreaInsets();

  const handleSendMessage = () => {
    if (!message.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), content: message.trim(), isAI: false, name: 'You' },
    ]);
    setMessage('');
    setTimeout(() => messagesScrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 10 + insets.top }]}>
        <LinearGradient
          colors={['#E8A68A', '#C45C3E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Pressable
          style={styles.backBtn}
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <IconSymbol name="chevron.left" size={20} color="#FFFFFF" />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.tripNameOnGradient} numberOfLines={1}>
            {trip.name}
          </Text>
          <Text style={styles.tripDestinationOnGradient}>{trip.destination}</Text>
        </View>
        <Pressable
          style={styles.settingsBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/trip/${id}/settings`);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Trip settings">
          <IconSymbol name="gearshape" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.tabScroll}>
        <View style={styles.tabScrollContent}>
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[
                styles.tab,
                activeTab === tab && styles.tabActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab(tab);
              }}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive,
                ]}
                numberOfLines={1}>
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {activeTab === 'Chat' && (
        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}>
          <ScrollView
            ref={messagesScrollRef}
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
          >
            {messages.map((msg, i) => (
              <Animated.View
                key={msg.id}
                entering={FadeInDown.delay(i * 30).springify()}
                style={[
                  styles.messageRow,
                  msg.isAI ? styles.messageRowAI : styles.messageRowUser,
                ]}>
                <View
                  style={[
                    styles.messageBubble,
                    msg.isAI ? styles.bubbleAI : styles.bubbleUser,
                  ]}>
                  {msg.isAI && (
                    <Text style={styles.messageName}>{msg.name}</Text>
                  )}
                  <Text
                    style={[
                      styles.messageText,
                      msg.isAI ? styles.messageTextAI : styles.messageTextUser,
                    ]}>
                    {msg.content}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </ScrollView>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Message..."
              placeholderTextColor={colors.textTertiary}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={500}
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                pressed && styles.sendBtnPressed,
              ]}
              onPress={handleSendMessage}>
              <IconSymbol
                name="paperplane.fill"
                size={18}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {activeTab === 'Plan' && (
        <ScrollView
          style={styles.tabContent}
          contentContainerStyle={styles.tabContentInner}
          showsVerticalScrollIndicator={false}>
          {trip.itinerary && trip.itinerary.length > 0 ? (
            <Animated.View entering={FadeInDown.springify()}>
              <Text style={styles.placeholderTitle}>Itinerary</Text>
              {trip.itinerary.map((day: ItineraryDay, dayIndex: number) => (
                <View key={day.id} style={styles.itineraryDay}>
                  <Text style={styles.itineraryDayTitle}>{day.title}</Text>
                  {day.date != null && day.date !== '' && (
                    <Text style={styles.itineraryDayDate}>{day.date}</Text>
                  )}
                  {day.activities.map((activity) => (
                    <View key={activity.id} style={styles.itineraryActivity}>
                      {activity.time != null && activity.time !== '' && (
                        <Text style={styles.itineraryActivityTime}>{activity.time}</Text>
                      )}
                      <View style={styles.itineraryActivityContent}>
                        <Text style={styles.itineraryActivityTitle}>{activity.title}</Text>
                        {activity.description != null && activity.description !== '' && (
                          <Text style={styles.itineraryActivityDesc}>{activity.description}</Text>
                        )}
                        {activity.location != null && activity.location !== '' && (
                          <Text style={styles.itineraryActivityLocation}>{activity.location}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.springify()}>
              <Text style={styles.placeholderTitle}>Itinerary</Text>
              <Text style={styles.placeholderText}>
                Your AI-generated itinerary will appear here. Keep chatting in the
                Chat tab to build your plan!
              </Text>
            </Animated.View>
          )}
        </ScrollView>
      )}

      {activeTab === 'Costs' && (
        <ScrollView
          style={styles.tabContent}
          contentContainerStyle={styles.tabContentInner}
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.springify()}>
            <Text style={styles.placeholderTitle}>Bill splitting</Text>
            <Text style={styles.placeholderText}>
              Split receipts and track costs. Upload a receipt to get started.
            </Text>
          </Animated.View>
        </ScrollView>
      )}

      {activeTab === 'Map' && (
        <View style={styles.mapContainer}>
          <View style={styles.mapPlaceholder}>
            <IconSymbol
              name="map.fill"
              size={48}
              color={colors.textTertiary}
            />
            <Text style={styles.mapPlaceholderTitle}>Map</Text>
            <Text style={styles.mapPlaceholderText}>
              Run a development build for live maps:{'\n'}
              npx expo run:ios
            </Text>
          </View>
        </View>
      )}

      {activeTab === 'Album' && (
        <ScrollView
          style={styles.tabContent}
          contentContainerStyle={styles.tabContentInner}
          showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.springify()}>
            <Text style={styles.placeholderTitle}>Shared photos</Text>
            <Text style={styles.placeholderText}>
              Photos from your trip will appear here. Share memories with your
              group!
            </Text>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}
