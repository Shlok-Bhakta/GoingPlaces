import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import PagerView from 'react-native-pager-view';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/theme-context';
import { useTrips, type ItineraryDay } from '@/contexts/trips-context';
import { useUser } from '@/contexts/user-context';

const CHAT_WS_BASE = process.env.EXPO_PUBLIC_CHAT_WS_BASE ?? 'http://localhost:8000';
const ALBUM_MEDIA_STORAGE_KEY = '@GoingPlaces/album_media';

type ChatMessage = { id: string; content: string; isAI: boolean; name: string; user_id?: string; timestamp?: string };

const GROUP_GAP_MS = 5 * 60 * 1000; // 5 min
const DIVIDER_GAP_MS = 30 * 60 * 1000; // 30 min

function formatDividerLabel(iso: string, prevIso?: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isToday) {
    if (prevIso) {
      const prev = new Date(prevIso);
      if (prev.toDateString() === d.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return 'Today';
  }
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function sameSender(a: ChatMessage, b: ChatMessage): boolean {
  return a.user_id ? a.user_id === b.user_id : a.name === b.name && a.isAI === b.isAI;
}

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
    messageRowTight: { marginBottom: Spacing.xs },
    messageRowUser: { alignItems: 'flex-end' },
    messageRowAI: { alignItems: 'flex-start' },
    messageBubbleWrapper: { maxWidth: '85%' },
    messageBubbleWrapperAI: { alignItems: 'flex-start' },
    messageBubbleWrapperUser: { alignItems: 'flex-end' },
    messageBubble: { padding: Spacing.md, borderRadius: Radius.lg },
    bubbleUser: { backgroundColor: colors.tint, borderBottomRightRadius: 4 },
    bubbleAI: { backgroundColor: '#D1D1D6', borderBottomLeftRadius: 4 },
    messageName: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    messageNameLeft: { textAlign: 'left' },
    messageNameRight: { textAlign: 'right' },
    timeDivider: {
      alignItems: 'center',
      paddingVertical: Spacing.md,
      marginVertical: Spacing.sm,
    },
    timeDividerText: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 12,
      color: colors.textTertiary,
      backgroundColor: colors.background,
      paddingHorizontal: Spacing.sm,
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
    albumTabContainer: { flex: 1 },
    addPhotosSection: {
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    addPhotosButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.xl * 2,
      borderRadius: Radius.xl,
      minWidth: 240,
      overflow: 'hidden',
    },
    addPhotosLabel: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 18,
      color: '#FFFFFF',
      marginTop: Spacing.sm,
    },
    addPhotosButtonPressed: { opacity: 0.9 },
    albumScrollContent: { padding: Spacing.lg, paddingBottom: 120 },
    albumSectionTitle: {
      fontFamily: 'Fraunces_600SemiBold',
      fontSize: 20,
      color: colors.text,
      marginBottom: Spacing.sm,
    },
    albumSectionText: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: Spacing.lg,
    },
    albumMediaGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Spacing.sm,
    },
    albumMediaItem: {
      width: 96,
      height: 96,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceMuted,
      overflow: 'hidden',
    },
  });
}

const FALLBACK_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    content: "Hey! Let's figure out where we're staying.",
    isAI: false,
    name: 'You',
    user_id: '',
    timestamp: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: '2',
    content: "I can help with that! Based on your dates and destination, I'd recommend looking at areas near downtown. What's your budget per night?",
    isAI: true,
    name: 'AI Assistant',
    user_id: '',
    timestamp: new Date().toISOString(),
  },
];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function ImageViewerOverlay({
  imageUris,
  initialPage,
  onClose,
}: {
  imageUris: string[];
  initialPage: number;
  onClose: () => void;
}) {
  if (imageUris.length === 0) return null;

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.92)' }]}
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="Close image viewer">
      <View style={{ flex: 1 }} pointerEvents="box-none">
        <PagerView style={{ flex: 1 }} initialPage={initialPage}>
          {imageUris.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.pagerPage} collapsable={false}>
              <Pressable style={styles.pagerPageInner} onPress={() => {}}>
                <Image
                  source={{ uri }}
                  style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                  contentFit="contain"
                />
              </Pressable>
            </View>
          ))}
        </PagerView>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pagerPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pagerPageInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getTrip } = useTrips();
  const { user } = useUser();
  const { colors } = useTheme();
  const trip = id ? getTrip(id) : null;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Chat');
  const [albumMediaByTripId, setAlbumMediaByTripId] = useState<Record<string, { uri: string; type: 'image' | 'video' }[]>>({});
  const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null);
  const albumMediaLoadedRef = useRef(false);
  const [message, setMessage] = useState('');
  const messagesScrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(
    CHAT_WS_BASE ? [] : FALLBACK_MESSAGES
  );
  const wsRef = useRef<WebSocket | null>(null);

  const userDisplayName = user ? `${user.firstName} ${user.lastName}`.trim() || 'You' : 'You';

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const base = (CHAT_WS_BASE || '').replace(/\/$/, '');

    if (base) {
      fetch(`${base}/trips/${encodeURIComponent(id)}/media`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: { uri: string; type: string }[]) => {
          if (cancelled) return;
          setAlbumMediaByTripId((prev) => ({
            ...prev,
            [id]: (data || []).map((m) => ({
              uri: m.uri,
              type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
            })),
          }));
        })
        .catch(() => {
          if (cancelled) return;
          AsyncStorage.getItem(ALBUM_MEDIA_STORAGE_KEY).then((raw) => {
            if (cancelled) return;
            try {
              if (raw) {
                const parsed = JSON.parse(raw) as Record<string, { uri: string; type: 'image' | 'video' }[]>;
                setAlbumMediaByTripId((prev) => ({ ...prev, [id]: parsed[id] ?? [] }));
              }
            } catch (_) {}
          });
        })
        .finally(() => {
          if (!cancelled) albumMediaLoadedRef.current = true;
        });
      return () => {
        cancelled = true;
      };
    } else {
      AsyncStorage.getItem(ALBUM_MEDIA_STORAGE_KEY).then((raw) => {
        if (cancelled) return;
        try {
          if (raw) {
            const parsed = JSON.parse(raw) as Record<string, { uri: string; type: 'image' | 'video' }[]>;
            setAlbumMediaByTripId((prev) => ({ ...prev, [id]: parsed[id] ?? [] }));
          }
        } catch (_) {}
        albumMediaLoadedRef.current = true;
      });
      return () => {
        cancelled = true;
      };
    }
  }, [id]);

  useEffect(() => {
    if (!albumMediaLoadedRef.current || CHAT_WS_BASE) return;
    AsyncStorage.setItem(ALBUM_MEDIA_STORAGE_KEY, JSON.stringify(albumMediaByTripId)).catch(() => {});
  }, [albumMediaByTripId, CHAT_WS_BASE]);

  useEffect(() => {
    if (!CHAT_WS_BASE || !id) return;
    const base = CHAT_WS_BASE.replace(/^http/, 'ws');
    const wsUrl = `${base}/ws/${encodeURIComponent(id)}?user_id=${encodeURIComponent(user?.id ?? '')}&user_name=${encodeURIComponent(userDisplayName)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'history' && Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: { id: string; content: string; is_ai: boolean; user_name: string; user_id?: string; created_at?: string }) => ({
              id: String(m.id),
              content: m.content,
              isAI: m.is_ai,
              name: m.user_name || 'Unknown',
              user_id: m.user_id ?? '',
              timestamp: m.created_at || new Date().toISOString(),
            }))
          );
        } else if (data.type === 'message' && data.message) {
          const m = data.message;
          setMessages((prev) => [
            ...prev,
            { id: String(m.id), content: m.content, isAI: m.is_ai, name: m.user_name || 'Unknown', user_id: m.user_id ?? '', timestamp: m.created_at || new Date().toISOString() },
          ]);
          setTimeout(() => messagesScrollRef.current?.scrollToEnd({ animated: true }), 100);
        }
      } catch (_) {}
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [id, CHAT_WS_BASE, user?.id, userDisplayName]);

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
    const text = message.trim();
    setMessage('');

    if (CHAT_WS_BASE && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ content: text, is_ai: false }));
      setTimeout(() => messagesScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } else {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), content: text, isAI: false, name: userDisplayName, user_id: user?.id ?? '', timestamp: new Date().toISOString() },
      ]);
      setTimeout(() => messagesScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleAddPictures = async () => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    const newItems = result.assets.map((a: { uri: string; type?: string }) => ({
      uri: a.uri,
      type: (a.type === 'video' ? 'video' : 'image') as 'image' | 'video',
    }));
    const base = (CHAT_WS_BASE || '').replace(/\/$/, '');
    if (base) {
      try {
        const res = await fetch(`${base}/trips/${encodeURIComponent(id)}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: newItems.map((item) => ({ uri: item.uri, type: item.type })),
          }),
        });
        if (res.ok) {
          const added = (await res.json()) as { uri: string; type: string }[];
          setAlbumMediaByTripId((prev) => ({
            ...prev,
            [id]: [
              ...(prev[id] ?? []),
              ...added.map((m) => ({
                uri: m.uri,
                type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
              })),
            ],
          }));
        } else {
          setAlbumMediaByTripId((prev) => ({
            ...prev,
            [id]: [...(prev[id] ?? []), ...newItems],
          }));
        }
      } catch {
        setAlbumMediaByTripId((prev) => ({
          ...prev,
          [id]: [...(prev[id] ?? []), ...newItems],
        }));
      }
    } else {
      setAlbumMediaByTripId((prev) => ({
        ...prev,
        [id]: [...(prev[id] ?? []), ...newItems],
      }));
    }
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
            {(() => {
              const currentUserId = user?.id ?? '';
              const isFromMe = (m: ChatMessage) =>
                (m.user_id && currentUserId && m.user_id === currentUserId) || (!CHAT_WS_BASE && !m.isAI);

              const items: { type: 'divider'; key: string; label: string } | { type: 'msg'; msg: ChatMessage; showName: boolean; groupedWithNext: boolean }[] = [];
              for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const prev = messages[i - 1];
                const next = messages[i + 1];
                const ts = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
                const prevTs = prev?.timestamp ? new Date(prev.timestamp).getTime() : 0;
                const nextTs = next?.timestamp ? new Date(next.timestamp).getTime() : Infinity;

                if (i === 0 || ts - prevTs > DIVIDER_GAP_MS) {
                  items.push({ type: 'divider', key: `div-${msg.id}`, label: formatDividerLabel(msg.timestamp ?? '', prev?.timestamp) });
                }
                const groupedWithNext =
                  !!next && sameSender(msg, next) && nextTs - ts <= GROUP_GAP_MS;
                const showName = !prev || !sameSender(msg, prev) || ts - prevTs > GROUP_GAP_MS;
                items.push({ type: 'msg', msg, showName, groupedWithNext });
              }

              return items.map((item, idx) => {
                if (item.type === 'divider') {
                  return (
                    <View key={item.key} style={styles.timeDivider}>
                      <Text style={styles.timeDividerText}>{item.label}</Text>
                    </View>
                  );
                }
                const { msg, showName, groupedWithNext } = item;
                const fromMe = isFromMe(msg);
                return (
                  <Animated.View
                    key={msg.id}
                    entering={FadeInDown.delay(idx * 20).springify()}
                    style={[
                      styles.messageRow,
                      fromMe ? styles.messageRowUser : styles.messageRowAI,
                      groupedWithNext && styles.messageRowTight,
                    ]}>
                    <View
                      style={[
                        styles.messageBubbleWrapper,
                        fromMe ? styles.messageBubbleWrapperUser : styles.messageBubbleWrapperAI,
                      ]}>
                      {showName && (
                        <Text
                          style={[
                            styles.messageName,
                            fromMe ? styles.messageNameRight : styles.messageNameLeft,
                          ]}>
                          {msg.name}
                        </Text>
                      )}
                      <View
                        style={[
                          styles.messageBubble,
                          fromMe ? styles.bubbleUser : styles.bubbleAI,
                        ]}>
                        <Text
                          style={[
                            styles.messageText,
                            fromMe ? styles.messageTextUser : styles.messageTextAI,
                          ]}>
                          {msg.content}
                        </Text>
                      </View>
                    </View>
                  </Animated.View>
                );
              });
            })()}
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
              onKeyPress={(e) => {
                if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
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
        <View style={styles.albumTabContainer}>
          <View style={styles.addPhotosSection}>
            <Pressable
              style={({ pressed }) => [
                styles.addPhotosButton,
                pressed && styles.addPhotosButtonPressed,
              ]}
              onPress={handleAddPictures}
              accessibilityRole="button"
              accessibilityLabel="Add photos and videos to trip album">
              <LinearGradient
                colors={['#E8A68A', '#C45C3E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <IconSymbol name="photo.on.rectangle.angled" size={40} color="#FFFFFF" />
              <Text style={styles.addPhotosLabel}>Add photos & videos</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.tabContent}
            contentContainerStyle={styles.albumScrollContent}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.albumSectionTitle}>Shared photos & videos</Text>
            <Text style={styles.albumSectionText}>
              {(() => {
                const media = albumMediaByTripId[id ?? ''] ?? [];
                return media.length > 0
                  ? `This trip has its own album. ${media.length} item${media.length !== 1 ? 's' : ''} in this shared space. Media is not shared with other trips.`
                  : 'Add photos and videos above. They stay in this trip only—no sharing between trips.';
              })()}
            </Text>
            {(() => {
              const media = albumMediaByTripId[id ?? ''] ?? [];
              const imageItems = media.filter((m): m is { uri: string; type: 'image' } => m.type === 'image');
              if (media.length === 0) return null;
              let imageIndex = 0;
              return (
                <View style={styles.albumMediaGrid}>
                  {media.map((item, index) => (
                    <View key={`${item.uri}-${index}`} style={styles.albumMediaItem}>
                      {item.type === 'image' ? (() => {
                          const idx = imageIndex++;
                          return (
                            <Pressable
                              style={{ width: 96, height: 96 }}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setViewingImageIndex(idx);
                              }}>
                              <Image source={{ uri: item.uri }} style={{ width: 96, height: 96 }} contentFit="cover" />
                            </Pressable>
                          );
                        })() : (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={styles.albumSectionText}>Video</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              );
            })()}
          </ScrollView>
        </View>
      )}

      <Modal
        visible={viewingImageIndex !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewingImageIndex(null)}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ImageViewerOverlay
            imageUris={(() => {
              const media = albumMediaByTripId[id ?? ''] ?? [];
              return media.filter((m): m is { uri: string; type: 'image' } => m.type === 'image').map((m) => m.uri);
            })()}
            initialPage={viewingImageIndex ?? 0}
            onClose={() => setViewingImageIndex(null)}
          />
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}
