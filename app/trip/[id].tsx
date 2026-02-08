import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import PagerView from 'react-native-pager-view';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { MarkdownText } from '@/components/markdown-text';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useTrips, type ItineraryDay, type Itinerary } from '@/contexts/trips-context';
import { useTheme } from '@/contexts/theme-context';
import { useUser } from '@/contexts/user-context';

const CHAT_WS_BASE = process.env.EXPO_PUBLIC_CHAT_WS_BASE ?? 'http://localhost:8000';
const ALBUM_MEDIA_STORAGE_KEY = '@GoingPlaces/album_media';

type ChatMessage = { id: string; content: string; isAI: boolean; name: string; user_id?: string; timestamp?: string };

const GROUP_GAP_MS = 5 * 60 * 1000; // 5 min
const DIVIDER_GAP_MS = 30 * 60 * 1000; // 30 min

// Color palette for chat bubbles (warm, pastel, accessible)
const USER_COLORS = [
  { bg: '#9FAEC0', text: '#1C1C1E' },     // Deeper blue-gray
  { bg: '#BFAD9F', text: '#1C1C1E' },     // Deeper warm beige
  { bg: '#A8BFB0', text: '#1C1C1E' },     // Deeper sage green
  { bg: '#BFA8BD', text: '#1C1C1E' },     // Deeper lavender
  { bg: '#A0B8BF', text: '#1C1C1E' },     // Deeper sky blue
  { bg: '#BFBCA0', text: '#1C1C1E' },     // Deeper sand
  { bg: '#B0A8BF', text: '#1C1C1E' },     // Deeper periwinkle
  { bg: '#BFA8B0', text: '#1C1C1E' },     // Deeper dusty rose
];

// Assign color to user based on their ID/name
function getUserColor(userId: string | undefined, userName: string): { bg: string; text: string } {
  const key = userId || userName;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash = hash & hash;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

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

/** Normalize backend itinerary JSON to app Itinerary type */
function normalizeItinerary(raw: unknown): Itinerary {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((day): day is Record<string, unknown> => day != null && typeof day === 'object')
    .map((day, i) => ({
      id: typeof day.id === 'string' ? day.id : `day-${i + 1}`,
      dayNumber: typeof day.dayNumber === 'number' ? day.dayNumber : i + 1,
      title: typeof day.title === 'string' ? day.title : `Day ${i + 1}`,
      date: typeof day.date === 'string' ? day.date : undefined,
      activities: Array.isArray(day.activities)
        ? (day.activities as Record<string, unknown>[])
            .filter((a): a is Record<string, unknown> => a != null && typeof a === 'object')
            .map((a, j) => ({
              id: typeof a.id === 'string' ? a.id : `act-${j + 1}`,
              time: typeof a.time === 'string' ? a.time : undefined,
              title: typeof a.title === 'string' ? a.title : '',
              description: typeof a.description === 'string' ? a.description : undefined,
              location: typeof a.location === 'string' ? a.location : undefined,
            }))
        : [],
    }));
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
    messageBubble: { padding: Spacing.md, borderRadius: Radius.lg, overflow: 'hidden' },
    bubbleUser: { backgroundColor: colors.tint, borderBottomRightRadius: 4 },
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
    messageTextUser: { color: '#1C1C1E' },
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
    mentionDropdown: {
      position: 'absolute',
      left: Spacing.md,
      right: Spacing.md + 44 + Spacing.sm,
      bottom: '100%',
      marginBottom: 4,
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      maxHeight: 200,
      zIndex: 10,
    },
    mentionOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      gap: Spacing.sm,
    },
    mentionOptionText: {
      fontFamily: 'DMSans_500Medium',
      fontSize: 15,
      color: colors.text,
    },
    typingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minWidth: 60,
    },
    typingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.textTertiary,
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
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.92)' }]}>
      <PagerView style={{ flex: 1 }} initialPage={initialPage}>
        {imageUris.map((uri, index) => (
          <View key={`${uri}-${index}`} style={styles.pagerPage} collapsable={false}>
            <Pressable 
              style={styles.pagerPageInner}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close image viewer">
              <Image
                source={{ uri }}
                style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
                contentFit="contain"
              />
            </Pressable>
          </View>
        ))}
      </PagerView>
      {/* Close button in top-right corner */}
      <View style={{ position: 'absolute', top: 50, right: 20, zIndex: 10 }}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => ({
            backgroundColor: pressed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.2)',
            width: 40,
            height: 40,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
          })}
          accessibilityRole="button"
          accessibilityLabel="Close image viewer">
          <IconSymbol name="xmark" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
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
  const { getTrip, updateTrip } = useTrips();
  const { user } = useUser();
  const { colors } = useTheme();
  const trip = id ? getTrip(id) : null;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Chat');
  const [albumMediaByTripId, setAlbumMediaByTripId] = useState<Record<string, { uri: string; type: 'image' | 'video' }[]>>({});
  const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const albumMediaLoadedRef = useRef(false);
  const [message, setMessage] = useState('');
  const [mentionVisible, setMentionVisible] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [geminiTyping, setGeminiTyping] = useState(false);
  const [usersTyping, setUsersTyping] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesScrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(
    CHAT_WS_BASE ? [] : FALLBACK_MESSAGES
  );
  const wsRef = useRef<WebSocket | null>(null);

  const flashOpacity = useSharedValue(0);

  const userDisplayName = user ? `${user.firstName} ${user.lastName}`.trim() || 'You' : 'You';

  // Mention options: Gemini first, then unique names from messages (group chat members)
  useEffect(() => {
    if (geminiTyping) {
      setTimeout(() => messagesScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [geminiTyping]);

  const mentionOptions = useMemo(() => {
    const names = new Set<string>();
    messages.forEach((m) => {
      const n = (m.name || '').trim();
      if (n && n !== 'Gemini') names.add(n);
    });
    const list: { id: string; name: string }[] = [{ id: 'gemini', name: 'Gemini' }];
    Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => list.push({ id: name, name }));
    const f = (mentionFilter || '').toLowerCase();
    if (!f) return list;
    return list.filter((o) => o.name.toLowerCase().startsWith(f));
  }, [messages, mentionFilter]);

  // Refresh album media
  const handleRefreshMedia = async () => {
    if (!id) return;
    setRefreshing(true);
    const base = (CHAT_WS_BASE || '').replace(/\/$/, '');

    if (base) {
      try {
        const res = await fetch(`${base}/trips/${encodeURIComponent(id)}/media`);
        if (res.ok) {
          const data: { uri: string; type: string }[] = await res.json();
          setAlbumMediaByTripId((prev) => ({
            ...prev,
            [id]: (data || []).map((m) => ({
              uri: m.uri.startsWith('http') ? m.uri : `${base}${m.uri}`,
              type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
            })),
          }));
        }
      } catch (error) {
        console.error('Failed to refresh media:', error);
      }
    }
    setRefreshing(false);
  };

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
              // Convert relative paths to full URLs
              uri: m.uri.startsWith('http') ? m.uri : `${base}${m.uri}`,
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
    // Clear messages when switching trips so we don't show another trip's chat
    setMessages([]);
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
          if (data.itinerary && Array.isArray(data.itinerary) && id) {
            const itinerary = normalizeItinerary(data.itinerary);
            if (itinerary.length > 0) updateTrip(id, { itinerary });
          }
        } else if (data.type === 'typing' && data.user_name === 'Gemini') {
          setGeminiTyping(true);
        } else if (data.type === 'typing' && data.user_name && data.user_id) {
          // Handle typing from other users (not self, not Gemini)
          if (data.user_id !== (user?.id ?? '')) {
            setUsersTyping((prev) => new Set(prev).add(data.user_id));
            // Clear typing indicator after 3 seconds
            setTimeout(() => {
              setUsersTyping((prev) => {
                const next = new Set(prev);
                next.delete(data.user_id);
                return next;
              });
            }, 3000);
          }
        } else if (data.type === 'message' && data.message) {
          const m = data.message;
          if (m.user_name === 'Gemini') setGeminiTyping(false);
          // Clear typing indicator for this user
          if (m.user_id) {
            setUsersTyping((prev) => {
              const next = new Set(prev);
              next.delete(m.user_id);
              return next;
            });
          }
          setMessages((prev) => [
            ...prev,
            { id: String(m.id), content: m.content, isAI: m.is_ai, name: m.user_name || 'Unknown', user_id: m.user_id ?? '', timestamp: m.created_at || new Date().toISOString() },
          ]);
          setTimeout(() => messagesScrollRef.current?.scrollToEnd({ animated: true }), 100);
        } else if (data.type === 'itinerary' && data.itinerary && Array.isArray(data.itinerary) && id) {
          setGeminiTyping(false);
          const itinerary = normalizeItinerary(data.itinerary);
          if (itinerary.length > 0) {
            updateTrip(id, { itinerary });
            setActiveTab('Plan');
          }
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

  const handleMessageChange = (text: string) => {
    setMessage(text);
    
    // Send typing indicator
    if (text.length > 0 && CHAT_WS_BASE && wsRef.current?.readyState === WebSocket.OPEN) {
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Send typing event
      wsRef.current.send(JSON.stringify({ 
        type: 'typing',
        user_id: user?.id ?? '',
        user_name: userDisplayName,
      }));
      
      // Stop sending typing after 2 seconds of no typing
      typingTimeoutRef.current = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ 
            type: 'stop_typing',
            user_id: user?.id ?? '',
          }));
        }
      }, 2000);
    }
    
    const lastAt = text.lastIndexOf('@');
    if (lastAt === -1) {
      setMentionVisible(false);
      setMentionFilter('');
      return;
    }
    const after = text.slice(lastAt + 1);
    if (/\s/.test(after)) {
      setMentionVisible(false);
      setMentionFilter('');
      return;
    }
    setMentionVisible(true);
    setMentionFilter(after);
  };

  const completeMention = (option: { id: string; name: string }) => {
    const lastAt = message.lastIndexOf('@');
    if (lastAt === -1) {
      setMentionVisible(false);
      return;
    }
    const insert = option.id === 'gemini' ? 'gemini' : option.name;
    const newText = message.slice(0, lastAt + 1) + insert + ' ';
    setMessage(newText);
    setMentionVisible(false);
    setMentionFilter('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSendMessage = () => {
    if (!message.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = message.trim();
    setMessage('');
    setMentionVisible(false);
    setMentionFilter('');

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
    
    const base = (CHAT_WS_BASE || '').replace(/\/$/, '');
    if (base) {
      try {
        // Upload actual files to backend
        const formData = new FormData();
        for (const asset of result.assets) {
          const uri = asset.uri;
          const filename = uri.split('/').pop() || 'image.jpg';
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `image/${match[1]}` : 'image/jpeg';
          
          // @ts-ignore - FormData in React Native accepts uri
          formData.append('files', {
            uri,
            name: filename,
            type,
          });
        }
        
        const res = await fetch(`${base}/trips/${encodeURIComponent(id)}/media/upload`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        
        if (res.ok) {
          const added = (await res.json()) as { uri: string; type: string }[];
          // URIs are now backend URLs like /uploads/filename.jpg
          setAlbumMediaByTripId((prev) => ({
            ...prev,
            [id]: [
              ...(prev[id] ?? []),
              ...added.map((m) => ({
                uri: `${base}${m.uri}`, // Full URL for display
                type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
              })),
            ],
          }));
        } else {
          // Fallback: store device URIs locally
          const newItems = result.assets.map((a: { uri: string; type?: string }) => ({
            uri: a.uri,
            type: (a.type === 'video' ? 'video' : 'image') as 'image' | 'video',
          }));
          setAlbumMediaByTripId((prev) => ({
            ...prev,
            [id]: [...(prev[id] ?? []), ...newItems],
          }));
        }
      } catch (err) {
        console.error('Upload failed:', err);
        // Fallback: store device URIs locally
        const newItems = result.assets.map((a: { uri: string; type?: string }) => ({
          uri: a.uri,
          type: (a.type === 'video' ? 'video' : 'image') as 'image' | 'video',
        }));
        setAlbumMediaByTripId((prev) => ({
          ...prev,
          [id]: [...(prev[id] ?? []), ...newItems],
        }));
      }
    } else {
      // No backend: store device URIs locally
      const newItems = result.assets.map((a: { uri: string; type?: string }) => ({
        uri: a.uri,
        type: (a.type === 'video' ? 'video' : 'image') as 'image' | 'video',
      }));
      setAlbumMediaByTripId((prev) => ({
        ...prev,
        [id]: [...(prev[id] ?? []), ...newItems],
      }));
    }
  };

  // Fetch join code for trip
  const fetchJoinCode = async () => {
    if (!id) return;
    const base = (CHAT_WS_BASE || '').replace(/\/$/, '');
    if (!base) return;
    try {
      const res = await fetch(`${base}/register-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trip_id: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setJoinCode(data.code ?? null);
      }
    } catch (error) {
      console.error('Failed to fetch join code:', error);
    }
  };

  const handleCopyCode = async () => {
    if (!joinCode) return;
    await Clipboard.setStringAsync(joinCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    flashOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withTiming(0, { duration: 400 })
    );
  };

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  // Fetch join code when modal opens
  useEffect(() => {
    if (showJoinCodeModal && !joinCode) {
      fetchJoinCode();
    }
  }, [showJoinCodeModal]);

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
            setShowJoinCodeModal(true);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Show join code">
          <IconSymbol name="plus" size={24} color="#FFFFFF" />
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
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          <ScrollView
            ref={messagesScrollRef}
            style={styles.messagesScroll}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            onContentSizeChange={() => {
              // Auto-scroll to bottom when content changes (new message, keyboard opens, etc)
              messagesScrollRef.current?.scrollToEnd({ animated: true });
            }}
          >
            {(() => {
              const currentUserId = user?.id ?? '';
              const isFromMe = (m: ChatMessage) =>
                (m.user_id && currentUserId && m.user_id === currentUserId) || (!CHAT_WS_BASE && !m.isAI);

              type ChatListItem =
                | { type: 'divider'; key: string; label: string }
                | { type: 'msg'; msg: ChatMessage; showName: boolean; groupedWithNext: boolean };
              const items: ChatListItem[] = [];
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

              return (
                <>
                  {items.map((item, idx) => {
                    if (item.type === 'divider') {
                      return (
                        <View key={item.key} style={styles.timeDivider}>
                          <Text style={styles.timeDividerText}>{item.label}</Text>
                        </View>
                      );
                    }
                    const { msg, showName, groupedWithNext } = item;
                    const fromMe = isFromMe(msg);
                    const isGemini = msg.name === 'Gemini' || msg.isAI;
                    const userColor = fromMe ? null : getUserColor(msg.user_id, msg.name);
                    
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
                          <View style={{ position: 'relative' }}>
                            <View
                              style={[
                                styles.messageBubble,
                                fromMe 
                                  ? styles.bubbleUser 
                                  : {
                                      backgroundColor: userColor?.bg,
                                      borderBottomLeftRadius: 4,
                                    },
                                isGemini && { marginBottom: 3 },
                              ]}>
                              <MarkdownText
                                baseStyle={StyleSheet.flatten([
                                  styles.messageText,
                                  fromMe 
                                    ? styles.messageTextUser 
                                    : { color: userColor?.text || colors.text },
                                ])}
                                codeStyle={
                                  fromMe
                                    ? { backgroundColor: 'rgba(0,0,0,0.15)' }
                                    : { backgroundColor: 'rgba(0,0,0,0.1)' }
                                }
                              >
                                {msg.content}
                              </MarkdownText>
                            </View>
                            {isGemini && (
                              <LinearGradient
                                colors={['#FF6B6B', '#FFD93D', '#6BCF7F', '#4D96FF', '#9D4EDD', '#FF6B6B']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={{
                                  height: 3,
                                  borderBottomLeftRadius: Radius.lg,
                                  borderBottomRightRadius: Radius.lg,
                                }}
                              />
                            )}
                          </View>
                        </View>
                      </Animated.View>
                    );
                  }                  )}
                  {geminiTyping && (
                    <View style={[styles.messageRow, styles.messageRowAI]}>
                      <View style={[styles.messageBubbleWrapper, styles.messageBubbleWrapperAI]}>
                        <Text style={[styles.messageName, styles.messageNameLeft]}>Gemini</Text>
                        <View style={{ position: 'relative' }}>
                          <View
                            style={[
                              styles.messageBubble,
                              {
                                backgroundColor: getUserColor('gemini', 'Gemini').bg,
                                borderBottomLeftRadius: 4,
                                marginBottom: 3,
                              },
                              styles.typingBubble,
                            ]}>
                            <View style={styles.typingDot} />
                            <View style={styles.typingDot} />
                            <View style={styles.typingDot} />
                          </View>
                          <LinearGradient
                            colors={['#FF6B6B', '#FFD93D', '#6BCF7F', '#4D96FF', '#9D4EDD', '#FF6B6B']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{
                              height: 3,
                              borderBottomLeftRadius: Radius.lg,
                              borderBottomRightRadius: Radius.lg,
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  )}
                  {Array.from(usersTyping).map((userId) => {
                    const typingUser = messages.find((m) => m.user_id === userId);
                    if (!typingUser) return null;
                    const userColor = getUserColor(userId, typingUser.name);
                    return (
                      <View key={userId} style={[styles.messageRow, styles.messageRowAI]}>
                        <View style={[styles.messageBubbleWrapper, styles.messageBubbleWrapperAI]}>
                          <Text style={[styles.messageName, styles.messageNameLeft]}>
                            {typingUser.name}
                          </Text>
                          <View
                            style={[
                              styles.messageBubble,
                              {
                                backgroundColor: userColor.bg,
                                borderBottomLeftRadius: 4,
                              },
                              styles.typingBubble,
                            ]}>
                            <View style={styles.typingDot} />
                            <View style={styles.typingDot} />
                            <View style={styles.typingDot} />
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              );
            })()}
          </ScrollView>
          <View style={styles.inputRow}>
            {mentionVisible && mentionOptions.length > 0 && (
              <View style={styles.mentionDropdown}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  style={{ maxHeight: 200 }}
                >
                  {mentionOptions.map((option) => (
                    <Pressable
                      key={option.id}
                      style={({ pressed }) => [
                        styles.mentionOption,
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={() => completeMention(option)}
                    >
                      {option.id === 'gemini' && (
                        <IconSymbol name="sparkles" size={18} color={colors.tint} />
                      )}
                      <Text style={styles.mentionOptionText}>{option.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder="Message... (type @ for Gemini or members)"
              placeholderTextColor={colors.textTertiary}
              value={message}
              onChangeText={handleMessageChange}
              onFocus={() => {
                // Scroll to bottom when input is focused
                setTimeout(() => {
                  messagesScrollRef.current?.scrollToEnd({ animated: true });
                }, 100);
              }}
              multiline
              maxLength={500}
              onKeyPress={(e) => {
                if (e.nativeEvent.key === 'Enter') {
                  const ev = e.nativeEvent as { key: string; shiftKey?: boolean };
                  if (!ev.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
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
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefreshMedia}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }>
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

      <Modal
        visible={showJoinCodeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowJoinCodeModal(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setShowJoinCodeModal(false)}>
          <Pressable
            style={{
              backgroundColor: colors.surface,
              borderRadius: Radius.lg,
              padding: Spacing.xl,
              width: '80%',
              maxWidth: 400,
              alignItems: 'center',
            }}
            onPress={(e) => e.stopPropagation()}>
            <Text
              style={{
                fontFamily: 'Fraunces_600SemiBold',
                fontSize: 22,
                color: colors.text,
                marginBottom: Spacing.sm,
              }}>
              Invite to Trip
            </Text>
            <Text
              style={{
                fontFamily: 'DMSans_400Regular',
                fontSize: 15,
                color: colors.textSecondary,
                textAlign: 'center',
                marginBottom: Spacing.lg,
              }}>
              Share this code with others to join this trip
            </Text>
            <Pressable
              onPress={handleCopyCode}
              disabled={!joinCode}
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.surfaceMuted : colors.backgroundElevated,
                borderRadius: Radius.md,
                padding: Spacing.lg,
                width: '100%',
                alignItems: 'center',
                marginBottom: Spacing.md,
                overflow: 'hidden',
              })}>
              {joinCode ? (
                <>
                  <Text
                    style={{
                      fontFamily: 'DMSans_700Bold',
                      fontSize: 36,
                      color: colors.tint,
                      letterSpacing: 8,
                    }}>
                    {joinCode}
                  </Text>
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        backgroundColor: '#4ade80',
                        borderRadius: Radius.md,
                      },
                      flashStyle,
                    ]}
                    pointerEvents="none"
                  />
                </>
              ) : (
                <Text
                  style={{
                    fontFamily: 'DMSans_400Regular',
                    fontSize: 16,
                    color: colors.textSecondary,
                  }}>
                  Loading...
                </Text>
              )}
            </Pressable>
            <Text
              style={{
                fontFamily: 'DMSans_400Regular',
                fontSize: 13,
                color: colors.textTertiary,
                textAlign: 'center',
              }}>
              {joinCode ? 'Tap the code to copy' : ''}
            </Text>
            <Pressable
              onPress={() => setShowJoinCodeModal(false)}
              style={({ pressed }) => ({
                marginTop: Spacing.lg,
                paddingVertical: Spacing.sm,
                paddingHorizontal: Spacing.md,
                opacity: pressed ? 0.6 : 1,
              })}>
              <Text
                style={{
                  fontFamily: 'DMSans_600SemiBold',
                  fontSize: 16,
                  color: colors.accent,
                }}>
                Close
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
