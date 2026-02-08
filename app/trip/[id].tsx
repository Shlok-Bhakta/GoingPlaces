import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/theme-context';
import { useUser } from '@/contexts/user-context';
import { useTrip, useGenerateInviteLink, useMessages, useSendMessage } from '@/hooks/useConvex';
import { Id } from '@/convex/_generated/dataModel';

const TABS = ['Chat', 'Plan', 'Costs', 'Map', 'Album'] as const;

function createStyles(colors: typeof Colors.light) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 56,
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    backBtn: { padding: Spacing.sm, marginLeft: -Spacing.sm },
    headerContent: { flex: 1, marginLeft: Spacing.sm },
    tripName: {
      fontFamily: 'Fraunces_600SemiBold',
      fontSize: 18,
      color: colors.text,
    },
    tripDestination: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    inviteBtn: { padding: Spacing.sm },
    cover: { height: 100, overflow: 'hidden' },
    coverGradient: { flex: 1 },
    tabScroll: {
      maxHeight: 48,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
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
      paddingBottom: 40,
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
    modalContainer: {
      flex: 1,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.md,
      borderBottomWidth: 1,
    },
    modalCloseBtn: {
      padding: Spacing.sm,
      marginLeft: -Spacing.sm,
    },
    modalTitle: {
      fontFamily: 'Fraunces_600SemiBold',
      fontSize: 20,
    },
    modalContent: {
      padding: Spacing.xl,
    },
    modalSubtitle: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 15,
      marginBottom: Spacing.xl,
      textAlign: 'center',
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
      color: colors.textTertiary,
    },
  });
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useUser();
  const trip = useTrip(id as Id<"trips"> | undefined);
  const convexMessages = useMessages(id as Id<"trips"> | undefined);
  const sendMessage = useSendMessage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const generateInviteLink = useGenerateInviteLink();
  const scrollRef = useRef<ScrollView>(null);

  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Chat');
  const [message, setMessage] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>('');

  // Map Convex messages to local format
  const messages = (convexMessages || []).map((m) => ({
    id: m._id,
    content: m.content,
    isAI: m.isAI,
    name: m.isAI ? 'AI Assistant' : (m.user ? `${m.user.firstName} ${m.user.lastName}` : 'User'),
    createdAt: m.createdAt,
  }));

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && scrollRef.current) {
      scrollRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/trips');
    }
  };

  const handleShowInvite = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      if (!id || !trip) return;
      
      // Generate or get invite token
      const token = await generateInviteLink({ tripId: id as Id<"trips"> });
      setInviteCode(token);
      setShowInviteModal(true);
    } catch (error) {
      console.error('Error generating invite code:', error);
      Alert.alert('Error', 'Could not generate invite code. Please try again.');
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied!', `Code ${inviteCode} copied to clipboard`);
  };

  if (!trip) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          {trip === undefined ? 'Loading...' : 'Trip not found'}
        </Text>
        {trip === null && (
          <Pressable onPress={handleBack}>
            <Text style={styles.backLink}>Go back</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const handleSendMessage = async () => {
    if (!message.trim() || !user || !id) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      await sendMessage({
        tripId: id as Id<"trips">,
        userId: user.id as Id<"users">,
        content: message.trim(),
        isAI: false,
      });
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Could not send message. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <IconSymbol name="chevron.left" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.tripName} numberOfLines={1}>
            {trip.name}
          </Text>
          <Text style={styles.tripDestination}>{trip.destination}</Text>
        </View>
        <Pressable
          style={styles.inviteBtn}
          onPress={handleShowInvite}>
          <IconSymbol name="plus.circle.fill" size={22} color={colors.tint} />
        </Pressable>
      </View>

      <View style={styles.cover}>
        <LinearGradient
          colors={trip.color ? JSON.parse(trip.color) : ['#E8A68A', '#C45C3E']}
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
            ref={scrollRef}
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
      
      <Modal
        visible={showInviteModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInviteModal(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowInviteModal(false);
              }}>
              <IconSymbol name="xmark" size={20} color={colors.text} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Invite friends</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.modalContent}>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Share this code with friends to invite them to the trip
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
                <Text style={[styles.modalSubtitle, { color: colors.textTertiary }]}>Generating code...</Text>
              </View>
            )}
            
            <Text style={[styles.codeHint, { color: colors.textTertiary }]}>
              Friends can enter this code on the Trips page to join
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}
