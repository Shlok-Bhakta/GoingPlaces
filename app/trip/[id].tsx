import React, { useState } from 'react';
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

import { IconSymbol } from '@/components/ui/icon-symbol';
import { TripMapView } from '@/components/TripMapView';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useTrips } from '@/contexts/trips-context';

const TABS = ['Chat', 'Plan', 'Costs', 'Map', 'Album'] as const;

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getTrip } = useTrips();
  const trip = id ? getTrip(id) : null;

  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Chat');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    { id: '1', content: "Hey! Let's figure out where we're staying.", isAI: false, name: 'You' },
    {
      id: '2',
      content: "I can help with that! Based on your dates and destination, I'd recommend looking at areas near downtown. What's your budget per night?",
      isAI: true,
      name: 'AI Assistant',
    },
  ]);

  if (!trip) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Trip not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const handleSendMessage = () => {
    if (!message.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), content: message.trim(), isAI: false, name: 'You' },
    ]);
    setMessage('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}>
          <IconSymbol name="chevron.left" size={20} color={Colors.light.text} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.tripName} numberOfLines={1}>
            {trip.name}
          </Text>
          <Text style={styles.tripDestination}>{trip.destination}</Text>
        </View>
        <Pressable
          style={styles.inviteBtn}
          onPress={() =>
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          }>
          <IconSymbol name="paperplane.fill" size={18} color={Colors.light.tint} />
        </Pressable>
      </View>

      <View style={styles.cover}>
        <LinearGradient
          colors={['#E8A68A', '#C45C3E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.coverGradient}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroll}
        contentContainerStyle={styles.tabScrollContent}>
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
              ]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {activeTab === 'Chat' && (
        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={100}>
          <ScrollView
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}>
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
              placeholderTextColor={Colors.light.textTertiary}
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
          <Animated.View entering={FadeInDown.springify()}>
            <Text style={styles.placeholderTitle}>Itinerary</Text>
            <Text style={styles.placeholderText}>
              Your AI-generated itinerary will appear here. Keep chatting in the
              Chat tab to build your plan!
            </Text>
          </Animated.View>
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
          <TripMapView trip={trip} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  backBtn: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
  },
  headerContent: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  tripName: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 18,
    color: Colors.light.text,
  },
  tripDestination: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  inviteBtn: {
    padding: Spacing.sm,
  },
  cover: {
    height: 100,
    overflow: 'hidden',
  },
  coverGradient: {
    flex: 1,
  },
  tabScroll: {
    maxHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  tabScrollContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  tab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  tabActive: {
    backgroundColor: Colors.light.accentMuted,
  },
  tabText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  tabTextActive: {
    color: Colors.light.tint,
    fontFamily: 'DMSans_600SemiBold',
  },
  chatContainer: {
    flex: 1,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  messageRow: {
    marginBottom: Spacing.md,
  },
  messageRowUser: {
    alignItems: 'flex-end',
  },
  messageRowAI: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  bubbleUser: {
    backgroundColor: Colors.light.tint,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor: Colors.light.surfaceMuted,
    borderBottomLeftRadius: 4,
  },
  messageName: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 12,
    color: Colors.light.tint,
    marginBottom: 4,
  },
  messageText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
  },
  messageTextUser: {
    color: '#FFFFFF',
  },
  messageTextAI: {
    color: Colors.light.text,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.md,
    paddingBottom: 40,
    gap: Spacing.sm,
    backgroundColor: Colors.light.background,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  input: {
    flex: 1,
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: Colors.light.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnPressed: {
    opacity: 0.9,
  },
  tabContent: {
    flex: 1,
  },
  tabContentInner: {
    padding: Spacing.lg,
    paddingBottom: 120,
  },
  placeholderTitle: {
    fontFamily: 'Fraunces_600SemiBold',
    fontSize: 20,
    color: Colors.light.text,
    marginBottom: Spacing.sm,
  },
  placeholderText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 15,
    color: Colors.light.textSecondary,
    lineHeight: 22,
  },
  mapContainer: {
    flex: 1,
  },
  errorText: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    color: Colors.light.text,
    textAlign: 'center',
    marginTop: 100,
  },
  backLink: {
    fontFamily: 'DMSans_600SemiBold',
    fontSize: 16,
    color: Colors.light.tint,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
