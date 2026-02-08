import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Animated as RNAnimated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import MapView, { Marker, Polyline } from 'react-native-maps';
import WebView from 'react-native-webview';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Gemini icon with random rotate animation */
function AnimatedGeminiIcon({ size = 14 }: { size?: number }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const delay = 1500 + Math.random() * 2500;
      timeoutId = setTimeout(() => {
        const rot = (Math.random() > 0.5 ? 1 : -1) * 360;
        rotation.value = withSequence(
          withTiming(rot, { duration: 500 }),
          withTiming(0, { duration: 500 })
        );
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => clearTimeout(timeoutId);
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, animatedStyle]}>
      <Image
        source={require('@/assets/images/gemini-icon.png')}
        style={{ width: size, height: size }}
        contentFit="contain"
      />
    </Animated.View>
  );
}

import ImageViewerOverlay from '@/components/image-viewer-overlay';
import { MarkdownText } from '@/components/markdown-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/theme-context';
import { useTrips, type Itinerary, type ItineraryActivity, type ItineraryDay } from '@/contexts/trips-context';
import { useUser } from '@/contexts/user-context';

const CHAT_WS_BASE = process.env.EXPO_PUBLIC_CHAT_WS_BASE ?? 'http://localhost:8000';
const ALBUM_MEDIA_STORAGE_KEY = '@GoingPlaces/album_media';

type Expense = {
  id: string;
  trip_id: string;
  paid_by_user_id: string;
  description: string;
  amount: number;
  currency: string;
  category?: string | null;
  receipt_image_url?: string | null;
  created_at: string;
  expense_date: string;
};

type Settlement = {
  from_user_id: string;
  to_user_id: string;
  amount: number;
  from_name: string;
  to_name: string;
};

type Balances = {
  balances: Record<string, number>;
  user_names: Record<string, string>;
  settlements: [string, string, number, string, string][];
};

type SuggestionOption = {
  title: string;
  description?: string | null;
  location?: string | null;
  /** Day to add to, e.g. "Day 1", "Day 2", "Friday". Required when adding (not replace). */
  dayLabel?: string | null;
  /** Time for the activity when adding, e.g. "6:00 PM", "12:00 PM". */
  time?: string | null;
  /** When set, replace this activity in place instead of adding. */
  replaceActivityId?: string | null;
  replaceTitle?: string | null;
};
type ChatMessage = {
  id: string;
  content: string;
  isAI: boolean;
  name: string;
  user_id?: string;
  timestamp?: string;
  suggestions?: SuggestionOption[];
};

const GROUP_GAP_MS = 5 * 60 * 1000; // 5 min
const DIVIDER_GAP_MS = 30 * 60 * 1000; // 30 min

/** Format YYYY-MM-DD to readable date, e.g. "Friday, March 15, 2025". */
function formatDayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

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

const TABS = ['Chat', 'Plan', 'Map', 'Costs', 'Album'] as const;

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
    bubbleAI: { backgroundColor: colors.bubbleAI, borderBottomLeftRadius: 4 },
    messageName: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    messageNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
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
      paddingBottom: Spacing.lg,
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
    itineraryActivityLocationPressable: {
      alignSelf: 'flex-start',
    },
    itineraryActivityLocationLinkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
    },
    itineraryActivityLocationLink: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 13,
      color: colors.tint,
      textDecorationLine: 'underline',
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
    albumCoverAttribution: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 9,
      color: colors.textTertiary,
      marginTop: 2,
      maxWidth: 96,
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
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.md,
      alignSelf: 'flex-start',
    },
    typingDotsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    typingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.textTertiary,
    },
    typingStatusText: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 2,
    },
    suggestionList: { marginTop: Spacing.md, gap: Spacing.sm },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.06)',
      borderRadius: Radius.md,
    },
    suggestionCheck: { marginRight: 2 },
    suggestionTextWrap: { flex: 1 },
    suggestionSlot: {
      fontFamily: 'DMSans_500Medium',
      fontSize: 11,
      color: colors.tint,
      marginBottom: 2,
    },
    suggestionTitle: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 14,
      color: colors.text,
    },
    suggestionDesc: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    addToPlanBtn: {
      paddingVertical: 6,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.md,
      backgroundColor: colors.tint,
    },
    addToPlanBtnText: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 12,
      color: '#FFFFFF',
    },
    suggestionAdded: { opacity: 0.7 },
    costsUploadSection: {
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    costsUploadButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.lg,
      paddingHorizontal: Spacing.xl,
      borderRadius: Radius.xl,
      minWidth: 200,
      overflow: 'hidden',
    },
    costsUploadLabel: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 16,
      color: '#FFFFFF',
      marginTop: Spacing.sm,
    },
    settlementCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    settlementRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    settlementAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settlementText: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 14,
      color: colors.text,
      marginLeft: Spacing.sm,
      flex: 1,
    },
    settlementAmount: {
      fontFamily: 'DMSans_700Bold',
      fontSize: 18,
      color: colors.tint,
    },
    expenseCard: {
      backgroundColor: colors.surface,
      borderRadius: Radius.lg,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    expenseHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: Spacing.sm,
    },
    expenseDescription: {
      fontFamily: 'DMSans_600SemiBold',
      fontSize: 15,
      color: colors.text,
      flex: 1,
    },
    expenseAmount: {
      fontFamily: 'DMSans_700Bold',
      fontSize: 16,
      color: colors.tint,
    },
    expenseMeta: {
      fontFamily: 'DMSans_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
    receiptThumb: {
      width: 60,
      height: 60,
      borderRadius: Radius.md,
      marginTop: Spacing.sm,
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

// CostsTab Component
function CostsTab({ 
  tripId, 
  colors, 
  styles, 
  user,
  trip,
}: { 
  tripId: string; 
  colors: typeof Colors.light; 
  styles: ReturnType<typeof createStyles>;
  user: ReturnType<typeof useUser>['user'];
  trip: any;
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState({ description: '', amount: '', date: '' });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadExpenses = async () => {
    if (!CHAT_WS_BASE) return;
    setLoading(true);
    try {
      const base = CHAT_WS_BASE.replace(/\/$/, '');
      const [expRes, balRes] = await Promise.all([
        fetch(`${base}/trips/${encodeURIComponent(tripId)}/expenses`),
        fetch(`${base}/trips/${encodeURIComponent(tripId)}/balances`),
      ]);
      if (expRes.ok) {
        const expData = await expRes.json();
        setExpenses(expData);
      }
      if (balRes.ok) {
        const balData = await balRes.json();
        setBalances(balData);
      }
    } catch (error) {
      console.error('Failed to load expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [tripId]);

  // Web: hidden file input for receipt upload
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      target.value = '';
      if (!file) return;

      setUploading(true);
      try {
        const base = CHAT_WS_BASE.replace(/\/$/, '');
        const formData = new FormData();
        formData.append('file', file);

        const ocrRes = await fetch(`${base}/trips/${encodeURIComponent(tripId)}/receipts/upload`, {
          method: 'POST',
          body: formData,
        });

        if (ocrRes.ok) {
          const ocrData = await ocrRes.json();
          const { receipt_url, receipt_data } = ocrData;

          // Get trip members to split the bill
          const membersRes = await fetch(`${base}/trips/${encodeURIComponent(tripId)}/members`);
          let members: any[] = [];
          if (membersRes.ok) {
            members = await membersRes.json();
          }

          // Create expense with equal splits
          const splitAmount = members.length > 0 ? receipt_data.total / members.length : receipt_data.total;
          const splits = members.map((m: any) => ({
            user_id: m.user_id,
            amount: splitAmount,
          }));

          const expenseRes = await fetch(`${base}/trips/${encodeURIComponent(tripId)}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paid_by_user_id: user?.id || '',
              description: receipt_data.merchant || 'Receipt',
              amount: receipt_data.total,
              expense_date: receipt_data.date || new Date().toISOString().split('T')[0],
              currency: receipt_data.currency || 'USD',
              receipt_image_url: `${base}${receipt_url}`,
              splits,
            }),
          });

          if (expenseRes.ok) {
            await loadExpenses();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
      } catch (error) {
        console.error('Receipt upload failed:', error);
      } finally {
        setUploading(false);
      }
    };
    document.body.appendChild(input);
    fileInputRef.current = input;
    return () => {
      document.body.removeChild(input);
      fileInputRef.current = null;
    };
  }, [tripId, user]);

  const handleUploadReceipt = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
      return;
    }

    // Native implementation - show action sheet to choose camera or library
    const ImagePicker = require('expo-image-picker');
    
    // Ask user: camera or library
    const choice = await new Promise<'camera' | 'library' | null>((resolve) => {
      if (Platform.OS === 'ios') {
        // iOS ActionSheet
        const ActionSheetIOS = require('react-native').ActionSheetIOS;
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['Cancel', 'Take Photo', 'Choose from Library'],
            cancelButtonIndex: 0,
          },
          (buttonIndex: number) => {
            if (buttonIndex === 1) resolve('camera');
            else if (buttonIndex === 2) resolve('library');
            else resolve(null);
          }
        );
      } else {
        // Android Alert
        const Alert = require('react-native').Alert;
        Alert.alert(
          'Upload Receipt',
          'Choose an option',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
            { text: 'Take Photo', onPress: () => resolve('camera') },
            { text: 'Choose from Library', onPress: () => resolve('library') },
          ],
          { cancelable: true, onDismiss: () => resolve(null) }
        );
      }
    });

    if (!choice) return;

    let result;
    if (choice === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return;
      
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.8,
      });
    }

    if (result.canceled) return;

    setUploading(true);
    try {
      const base = CHAT_WS_BASE.replace(/\/$/, '');
      const formData = new FormData();
      const uri = result.assets[0].uri;
      const filename = uri.split('/').pop() || 'receipt.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      // @ts-ignore - FormData in React Native accepts uri
      formData.append('file', {
        uri,
        name: filename,
        type,
      });

      const ocrRes = await fetch(`${base}/trips/${encodeURIComponent(tripId)}/receipts/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (ocrRes.ok) {
        const ocrData = await ocrRes.json();
        const { receipt_url, receipt_data } = ocrData;

        // Get trip members to split the bill
        const membersRes = await fetch(`${base}/trips/${encodeURIComponent(tripId)}/members`);
        let members: any[] = [];
        if (membersRes.ok) {
          members = await membersRes.json();
        }

        // Create expense with equal splits
        const splitAmount = members.length > 0 ? receipt_data.total / members.length : receipt_data.total;
        const splits = members.map((m: any) => ({
          user_id: m.user_id,
          amount: splitAmount,
        }));

        const expenseRes = await fetch(`${base}/trips/${encodeURIComponent(tripId)}/expenses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paid_by_user_id: user?.id || '',
            description: receipt_data.merchant || 'Receipt',
            amount: receipt_data.total,
            expense_date: receipt_data.date || new Date().toISOString().split('T')[0],
            currency: receipt_data.currency || 'USD',
            receipt_image_url: `${base}${receipt_url}`,
            splits,
          }),
        });

        if (expenseRes.ok) {
          await loadExpenses();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (error) {
      console.error('Receipt upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  // Get user initials and color
  const getUserInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setEditForm({
      description: expense.description,
      amount: expense.amount.toString(),
      date: expense.expense_date,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveEdit = async () => {
    if (!editingExpense || !CHAT_WS_BASE) return;
    
    try {
      const base = CHAT_WS_BASE.replace(/\/$/, '');
      const res = await fetch(`${base}/expenses/${encodeURIComponent(editingExpense.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editForm.description,
          amount: parseFloat(editForm.amount),
          expense_date: editForm.date,
        }),
      });

      if (res.ok) {
        await loadExpenses();
        setEditingExpense(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Failed to update expense:', error);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!CHAT_WS_BASE) return;
    
    try {
      const base = CHAT_WS_BASE.replace(/\/$/, '');
      const res = await fetch(`${base}/expenses/${encodeURIComponent(expenseId)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await loadExpenses();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Failed to delete expense:', error);
    }
  };

  const settlements: Settlement[] = balances?.settlements.map(s => ({
    from_user_id: s[0],
    to_user_id: s[1],
    amount: s[2],
    from_name: s[3],
    to_name: s[4],
  })) || [];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.costsUploadSection}>
        <Pressable
          style={({ pressed }) => [
            styles.costsUploadButton,
            pressed && { opacity: 0.9 },
          ]}
          onPress={handleUploadReceipt}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Upload receipt">
          <LinearGradient
            colors={['#E8A68A', '#C45C3E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <IconSymbol name="doc.text.image" size={32} color="#FFFFFF" />
          <Text style={styles.costsUploadLabel}>
            {uploading ? 'Processing...' : 'Upload Receipt'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.tabContent}
        contentContainerStyle={styles.tabContentInner}
        showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.placeholderText}>Loading...</Text>
        ) : (
          <>
            {settlements.length > 0 && (
              <Animated.View entering={FadeInDown.springify()}>
                <Text style={styles.placeholderTitle}>Who Owes Whom</Text>
                {settlements.map((settlement, idx) => {
                  const fromColor = getUserColor(settlement.from_user_id, settlement.from_name);
                  const toColor = getUserColor(settlement.to_user_id, settlement.to_name);
                  
                  return (
                    <View key={idx} style={styles.settlementCard}>
                      <View style={styles.settlementRow}>
                        <View style={[styles.settlementAvatar, { backgroundColor: fromColor.bg }]}>
                          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 14, color: fromColor.text }}>
                            {getUserInitials(settlement.from_name)}
                          </Text>
                        </View>
                        <Text style={styles.settlementText}>
                          <Text style={{ fontFamily: 'DMSans_600SemiBold' }}>{settlement.from_name}</Text>
                          {' owes '}
                          <Text style={{ fontFamily: 'DMSans_600SemiBold' }}>{settlement.to_name}</Text>
                        </Text>
                        <View style={[styles.settlementAvatar, { backgroundColor: toColor.bg }]}>
                          <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 14, color: toColor.text }}>
                            {getUserInitials(settlement.to_name)}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.settlementAmount, { textAlign: 'center', marginTop: Spacing.sm }]}>
                        ${settlement.amount.toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </Animated.View>
            )}

            {expenses.length > 0 && (
              <Animated.View entering={FadeInDown.delay(100).springify()}>
                <Text style={[styles.placeholderTitle, { marginTop: settlements.length > 0 ? Spacing.xl : 0 }]}>
                  Receipt Archive
                </Text>
                {expenses.map((expense) => (
                  <View key={expense.id} style={styles.expenseCard}>
                    <View style={styles.expenseHeader}>
                      <Text style={styles.expenseDescription}>{expense.description}</Text>
                      <View style={{ flexDirection: 'row', gap: Spacing.xs, alignItems: 'center' }}>
                        <Text style={styles.expenseAmount}>
                          ${expense.amount.toFixed(2)}
                        </Text>
                        <Pressable
                          onPress={() => handleEditExpense(expense)}
                          hitSlop={8}>
                          <IconSymbol name="pencil" size={16} color={colors.tint} />
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteExpense(expense.id)}
                          hitSlop={8}>
                          <IconSymbol name="trash" size={16} color={colors.textSecondary} />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.expenseMeta}>
                      Paid by {balances?.user_names[expense.paid_by_user_id] || 'Unknown'} • {new Date(expense.expense_date).toLocaleDateString()}
                    </Text>
                    {expense.receipt_image_url && (
                      <Pressable
                        onPress={() => {
                          if (expense.receipt_image_url) {
                            Linking.openURL(expense.receipt_image_url);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }
                        }}>
                        <Image
                          source={{ uri: expense.receipt_image_url }}
                          style={styles.receiptThumb}
                          contentFit="cover"
                        />
                      </Pressable>
                    )}
                  </View>
                ))}
              </Animated.View>
            )}

            {!loading && expenses.length === 0 && (
              <Animated.View entering={FadeInDown.springify()}>
                <Text style={styles.placeholderTitle}>Bill Splitting</Text>
                <Text style={styles.placeholderText}>
                  Upload a receipt above to automatically split costs with your group. Our AI will extract the total and split it evenly.
                </Text>
              </Animated.View>
            )}
          </>
        )}
      </ScrollView>

      {/* Edit Expense Modal */}
      <Modal
        visible={editingExpense !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingExpense(null)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setEditingExpense(null)}>
          <Pressable
            style={{
              backgroundColor: colors.background,
              borderRadius: Radius.xl,
              padding: Spacing.xl,
              width: '90%',
              maxWidth: 400,
            }}
            onPress={(e) => e.stopPropagation()}>
            <Text
              style={{
                fontFamily: 'Fraunces_600SemiBold',
                fontSize: 20,
                color: colors.text,
                marginBottom: Spacing.lg,
              }}>
              Edit Expense
            </Text>

            <Text
              style={{
                fontFamily: 'DMSans_500Medium',
                fontSize: 13,
                color: colors.textSecondary,
                marginBottom: Spacing.xs,
              }}>
              Description
            </Text>
            <TextInput
              style={{
                fontFamily: 'DMSans_400Regular',
                fontSize: 16,
                color: colors.text,
                backgroundColor: colors.surface,
                borderRadius: Radius.md,
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.sm,
                marginBottom: Spacing.md,
                borderWidth: 1,
                borderColor: colors.borderLight,
              }}
              value={editForm.description}
              onChangeText={(text) => setEditForm({ ...editForm, description: text })}
              placeholder="e.g. Taco Bell"
              placeholderTextColor={colors.textTertiary}
            />

            <Text
              style={{
                fontFamily: 'DMSans_500Medium',
                fontSize: 13,
                color: colors.textSecondary,
                marginBottom: Spacing.xs,
              }}>
              Amount
            </Text>
            <TextInput
              style={{
                fontFamily: 'DMSans_400Regular',
                fontSize: 16,
                color: colors.text,
                backgroundColor: colors.surface,
                borderRadius: Radius.md,
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.sm,
                marginBottom: Spacing.md,
                borderWidth: 1,
                borderColor: colors.borderLight,
              }}
              value={editForm.amount}
              onChangeText={(text) => setEditForm({ ...editForm, amount: text })}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
            />

            <Text
              style={{
                fontFamily: 'DMSans_500Medium',
                fontSize: 13,
                color: colors.textSecondary,
                marginBottom: Spacing.xs,
              }}>
              Date
            </Text>
            <TextInput
              style={{
                fontFamily: 'DMSans_400Regular',
                fontSize: 16,
                color: colors.text,
                backgroundColor: colors.surface,
                borderRadius: Radius.md,
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.sm,
                marginBottom: Spacing.lg,
                borderWidth: 1,
                borderColor: colors.borderLight,
              }}
              value={editForm.date}
              onChangeText={(text) => setEditForm({ ...editForm, date: text })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textTertiary}
            />

            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Pressable
                onPress={() => setEditingExpense(null)}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: Spacing.md,
                  borderRadius: Radius.md,
                  backgroundColor: colors.surface,
                  alignItems: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}>
                <Text
                  style={{
                    fontFamily: 'DMSans_600SemiBold',
                    fontSize: 16,
                    color: colors.textSecondary,
                  }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSaveEdit}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: Spacing.md,
                  borderRadius: Radius.md,
                  backgroundColor: colors.tint,
                  alignItems: 'center',
                  opacity: pressed ? 0.9 : 1,
                })}>
                <Text
                  style={{
                    fontFamily: 'DMSans_600SemiBold',
                    fontSize: 16,
                    color: '#FFFFFF',
                  }}>
                  Save
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

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
  /** Trip cover from Google Places (destination photo); shown first in album with attribution. */
  const [tripCoverImage, setTripCoverImage] = useState<{ uri: string; attributions: { displayName?: string; uri?: string }[] } | null>(null);
  const [viewingImageIndex, setViewingImageIndex] = useState<number | null>(null);
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const albumMediaLoadedRef = useRef(false);
  const [message, setMessage] = useState('');
  const [mentionVisible, setMentionVisible] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [geminiTyping, setGeminiTyping] = useState(false);
  const [geminiTypingStatus, setGeminiTypingStatus] = useState('');
  const [usersTyping, setUsersTyping] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTypingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const messagesScrollRef = useRef<ScrollView>(null);
  const dotAnims = useRef([new RNAnimated.Value(0.3), new RNAnimated.Value(0.3), new RNAnimated.Value(0.3)]).current;
  const [messages, setMessages] = useState<ChatMessage[]>(
    CHAT_WS_BASE ? [] : FALLBACK_MESSAGES
  );
  const [addedSuggestionKeys, setAddedSuggestionKeys] = useState<Set<string>>(new Set());
  const [resolvingSuggestionKey, setResolvingSuggestionKey] = useState<string | null>(null);
  const [addToPlanConflict, setAddToPlanConflict] = useState<{
    message: string;
    resolutionOptions: { id: string; label: string; itinerary?: unknown[] }[];
    suggestionKey: string;
    msgId: string;
    suggestionIndex: number;
    option: SuggestionOption;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<TextInput>(null);
  const tripIdForUploadRef = useRef<string | null>(null);
  tripIdForUploadRef.current = id ?? null;
  const [mapCoordinates, setMapCoordinates] = useState<{ location: string; lat: number; lng: number }[]>([]);
  const [loadingCoordinates, setLoadingCoordinates] = useState(false);
  const mapRef = useRef<MapView>(null);

  const flashOpacity = useSharedValue(0);

  // Web: hidden file input for adding photos (expo-image-picker is native-only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.multiple = true;
    input.style.display = 'none';
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const files = target.files;
      target.value = '';
      if (!files?.length) return;
      const tripId = tripIdForUploadRef.current;
      if (!tripId) return;
      const base = (CHAT_WS_BASE || '').replace(/\/$/, '');
      if (base) {
        try {
          const formData = new FormData();
          for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i], files[i].name);
          }
          const res = await fetch(`${base}/trips/${encodeURIComponent(tripId)}/media/upload`, {
            method: 'POST',
            body: formData,
          });
          if (res.ok) {
            const added = (await res.json()) as { uri: string; type: string }[];
            setAlbumMediaByTripId((prev) => ({
              ...prev,
              [tripId]: [
                ...(prev[tripId] ?? []),
                ...added.map((m) => ({
                  uri: `${base}${m.uri}`,
                  type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
                })),
              ],
            }));
          } else {
            const newItems = Array.from(files).map((file) => ({
              uri: URL.createObjectURL(file),
              type: (file.type.startsWith('video/') ? 'video' : 'image') as 'image' | 'video',
            }));
            setAlbumMediaByTripId((prev) => ({
              ...prev,
              [tripId]: [...(prev[tripId] ?? []), ...newItems],
            }));
          }
        } catch (err) {
          console.error('Upload failed:', err);
          const newItems = Array.from(files).map((file) => ({
            uri: URL.createObjectURL(file),
            type: (file.type.startsWith('video/') ? 'video' : 'image') as 'image' | 'video',
          }));
          setAlbumMediaByTripId((prev) => ({
            ...prev,
            [tripId]: [...(prev[tripId] ?? []), ...newItems],
          }));
        }
      } else {
        const newItems = Array.from(files).map((file) => ({
          uri: URL.createObjectURL(file),
          type: (file.type.startsWith('video/') ? 'video' : 'image') as 'image' | 'video',
        }));
        setAlbumMediaByTripId((prev) => ({
          ...prev,
          [tripId]: [...(prev[tripId] ?? []), ...newItems],
        }));
      }
    };
    document.body.appendChild(input);
    fileInputRef.current = input;
    return () => {
      document.body.removeChild(input);
      fileInputRef.current = null;
    };
  }, []);

  const userDisplayName = user ? `${user.firstName} ${user.lastName}`.trim() || 'You' : 'You';

  /** Merge a suggestion into current itinerary (used for add_anyway and fallback). */
  const mergeSuggestionIntoItinerary = useCallback(
    (current: Itinerary, option: SuggestionOption): Itinerary => {
      const newActivityBase: Omit<ItineraryActivity, 'id'> = {
        title: option.title,
        description: option.description ?? undefined,
        location: option.location ?? undefined,
      };
      const replaceId = option.replaceActivityId?.trim() || null;
      const replaceTitle = option.replaceTitle?.trim() || null;
      const isReplace = !!(replaceId || replaceTitle);

      if (isReplace && current.length > 0) {
        let replaced = false;
        let merged = current.map((day) => ({
          ...day,
          activities: day.activities.map((act) => {
            const matchById = replaceId && act.id === replaceId;
            const matchByTitle = replaceTitle && act.title.trim().toLowerCase() === replaceTitle.toLowerCase();
            if (matchById || matchByTitle) {
              replaced = true;
              return { ...newActivityBase, id: act.id, time: act.time } as ItineraryActivity;
            }
            return act;
          }),
        }));
        if (!replaced) {
          const fallbackDay = option.dayLabel
            ? current.find(
                (d) =>
                  d.title.toLowerCase().includes(option.dayLabel!.toLowerCase()) ||
                  (d.date && d.date.toLowerCase().includes(option.dayLabel!.toLowerCase()))
              )
            : current[0];
          const targetDay = fallbackDay ?? current[0];
          merged = current.map((day) =>
            day.id === targetDay.id
              ? {
                  ...day,
                  activities: [
                    ...day.activities,
                    { ...newActivityBase, id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` } as ItineraryActivity,
                  ],
                }
              : day
          );
        }
        return merged;
      }
      let targetDay: ItineraryDay | undefined;
      if (option.dayLabel) {
        const label = option.dayLabel.toLowerCase();
        targetDay = current.find(
          (d) =>
            d.title.toLowerCase().includes(label) ||
            (d.date && d.date.toLowerCase().includes(label))
        );
      }
      if (!targetDay && current.length > 0) targetDay = current[0];
      if (!targetDay) {
        targetDay = { id: 'day-1', dayNumber: 1, title: 'Day 1', activities: [] };
      }
      const newActivity: ItineraryActivity = {
        ...newActivityBase,
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        time: option.time ?? undefined,
      };
      return current.length === 0
        ? [{ ...targetDay, activities: [newActivity] }]
        : current.map((day) =>
            day.id === targetDay!.id ? { ...day, activities: [...day.activities, newActivity] } : day
          );
    },
    []
  );

  const applyItineraryToTrip = useCallback(
    (itinerary: Itinerary) => {
      if (!id) return;
      updateTrip(id, { itinerary });
      const base = CHAT_WS_BASE.replace(/\/$/, '');
      fetch(`${base}/trips/${encodeURIComponent(id)}/itinerary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itinerary: itinerary.map((d) => ({
            id: d.id,
            dayNumber: d.dayNumber,
            title: d.title,
            date: d.date ?? null,
            activities: d.activities.map((a) => ({
              id: a.id,
              time: a.time ?? null,
              title: a.title,
              description: a.description ?? null,
              location: a.location ?? null,
            })),
          })),
        }),
      }).catch(() => {});
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [id, updateTrip]
  );

  const addSuggestionToPlan = useCallback(
    async (msgId: string, suggestionIndex: number, option: SuggestionOption) => {
      if (!id || !trip) return;
      const key = `${msgId}-${suggestionIndex}`;
      if (addedSuggestionKeys.has(key)) return;
      const current: Itinerary = trip.itinerary ?? [];
      setResolvingSuggestionKey(key);
      const base = CHAT_WS_BASE.replace(/\/$/, '');
      try {
        const res = await fetch(`${base}/trips/${encodeURIComponent(id)}/add-to-plan/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            suggestion: {
              title: option.title,
              description: option.description ?? null,
              location: option.location ?? null,
              dayLabel: option.dayLabel ?? null,
              time: option.time ?? null,
              replaceActivityId: option.replaceActivityId ?? null,
              replaceTitle: option.replaceTitle ?? null,
            },
          }),
        });
        if (!res.ok) throw new Error('Resolve failed');
        const data = (await res.json()) as {
          action: 'add' | 'conflict';
          itinerary?: unknown[];
          message?: string;
          resolutionOptions?: { id: string; label: string; itinerary?: unknown[] }[];
        };
        if (data.action === 'add' && data.itinerary?.length) {
          const normalized = normalizeItinerary(data.itinerary);
          applyItineraryToTrip(normalized);
          setAddedSuggestionKeys((prev) => new Set(prev).add(key));
        } else if (data.action === 'conflict' && data.message && data.resolutionOptions?.length) {
          setAddToPlanConflict({
            message: data.message,
            resolutionOptions: data.resolutionOptions,
            suggestionKey: key,
            msgId,
            suggestionIndex,
            option,
          });
        } else {
          const merged = mergeSuggestionIntoItinerary(current, option);
          applyItineraryToTrip(merged);
          setAddedSuggestionKeys((prev) => new Set(prev).add(key));
        }
      } catch {
        const merged = mergeSuggestionIntoItinerary(current, option);
        applyItineraryToTrip(merged);
        setAddedSuggestionKeys((prev) => new Set(prev).add(key));
      } finally {
        setResolvingSuggestionKey(null);
      }
    },
    [id, trip, addedSuggestionKeys, mergeSuggestionIntoItinerary, applyItineraryToTrip]
  );

  const resolveAddToPlanConflict = useCallback(
    (choice: { id: string; label: string; itinerary?: unknown[] }) => {
      if (!id || !addToPlanConflict) return;
      const { option, suggestionKey } = addToPlanConflict;
      if (choice.id === 'cancel') {
        setAddToPlanConflict(null);
        return;
      }
      const current: Itinerary = trip?.itinerary ?? [];
      if (choice.itinerary?.length) {
        const normalized = normalizeItinerary(choice.itinerary);
        applyItineraryToTrip(normalized);
      } else if (choice.id === 'add_anyway') {
        const merged = mergeSuggestionIntoItinerary(current, option);
        applyItineraryToTrip(merged);
      }
      setAddedSuggestionKeys((prev) => new Set(prev).add(suggestionKey));
      setAddToPlanConflict(null);
    },
    [id, trip, addToPlanConflict, mergeSuggestionIntoItinerary, applyItineraryToTrip]
  );

  // Wave animation for typing dots when Gemini is typing
  useEffect(() => {
    if (!geminiTyping) return;
    const wave = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.parallel([
          RNAnimated.timing(dotAnims[0], { toValue: 1, duration: 240, useNativeDriver: true }),
          RNAnimated.timing(dotAnims[1], { toValue: 0.3, duration: 240, useNativeDriver: true }),
          RNAnimated.timing(dotAnims[2], { toValue: 0.3, duration: 240, useNativeDriver: true }),
        ]),
        RNAnimated.parallel([
          RNAnimated.timing(dotAnims[0], { toValue: 0.3, duration: 240, useNativeDriver: true }),
          RNAnimated.timing(dotAnims[1], { toValue: 1, duration: 240, useNativeDriver: true }),
          RNAnimated.timing(dotAnims[2], { toValue: 0.3, duration: 240, useNativeDriver: true }),
        ]),
        RNAnimated.parallel([
          RNAnimated.timing(dotAnims[0], { toValue: 0.3, duration: 240, useNativeDriver: true }),
          RNAnimated.timing(dotAnims[1], { toValue: 0.3, duration: 240, useNativeDriver: true }),
          RNAnimated.timing(dotAnims[2], { toValue: 1, duration: 240, useNativeDriver: true }),
        ]),
        RNAnimated.parallel([
          RNAnimated.timing(dotAnims[0], { toValue: 0.3, duration: 240, useNativeDriver: true }),
          RNAnimated.timing(dotAnims[1], { toValue: 0.3, duration: 240, useNativeDriver: true }),
          RNAnimated.timing(dotAnims[2], { toValue: 0.3, duration: 240, useNativeDriver: true }),
        ]),
      ])
    );
    wave.start();
    return () => wave.stop();
  }, [geminiTyping]);

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

  // Refresh album media (and trip cover image from Google Places)
  const handleRefreshMedia = async () => {
    if (!id) return;
    setRefreshing(true);
    const base = (CHAT_WS_BASE || '').replace(/\/$/, '');

    if (base) {
      try {
        const [mediaRes, coverRes] = await Promise.all([
          fetch(`${base}/trips/${encodeURIComponent(id)}/media`),
          fetch(`${base}/trips/${encodeURIComponent(id)}/cover-image`).catch(() => null),
        ]);
        if (mediaRes.ok) {
          const data: { uri: string; type: string }[] = await mediaRes.json();
          setAlbumMediaByTripId((prev) => ({
            ...prev,
            [id]: (data || []).map((m) => ({
              uri: m.uri.startsWith('http') ? m.uri : `${base}${m.uri}`,
              type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
            })),
          }));
        }
        if (coverRes?.ok) {
          const cover = await coverRes.json() as { photoUri: string; attributions?: { displayName?: string; uri?: string }[] };
          setTripCoverImage({ uri: cover.photoUri, attributions: cover.attributions ?? [] });
        } else {
          setTripCoverImage(null);
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
      Promise.all([
        fetch(`${base}/trips/${encodeURIComponent(id)}/media`).then((res) => (res.ok ? res.json() : [])),
        fetch(`${base}/trips/${encodeURIComponent(id)}/cover-image`).then((res) => (res.ok ? res.json() : null)).catch(() => null),
      ])
        .then(([data, cover]: [ { uri: string; type: string }[], { photoUri: string; attributions?: { displayName?: string; uri?: string }[] } | null ]) => {
          if (cancelled) return;
          setAlbumMediaByTripId((prev) => ({
            ...prev,
            [id]: (data || []).map((m) => ({
              uri: m.uri.startsWith('http') ? m.uri : `${base}${m.uri}`,
              type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
            })),
          }));
          if (cover?.photoUri) {
            setTripCoverImage({ uri: cover.photoUri, attributions: cover.attributions ?? [] });
          } else {
            setTripCoverImage(null);
          }
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
          setTripCoverImage(null);
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
      setTripCoverImage(null);
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
          setGeminiTypingStatus('');
        } else if (data.type === 'typing_status' && typeof data.message === 'string') {
          setGeminiTypingStatus(data.message);
        } else if (data.type === 'typing' && data.user_name && data.user_id) {
          // Handle typing from other users (not self, not Gemini)
          if (data.user_id !== (user?.id ?? '')) {
            console.log('[Typing] User typing:', data.user_id, data.user_name);
            
            // Clear any existing timeout for this user
            const existingTimeout = userTypingTimeoutsRef.current.get(data.user_id);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
            }
            
            // Show typing indicator
            setUsersTyping((prev) => {
              const newSet = new Set(prev);
              newSet.add(data.user_id);
              console.log('[Typing] Updated usersTyping:', Array.from(newSet));
              return newSet;
            });
            
            // Set new timeout to clear typing indicator after 3 seconds of no activity
            const timeout = setTimeout(() => {
              console.log('[Typing] Timeout clearing:', data.user_id);
              setUsersTyping((prev) => {
                const next = new Set(prev);
                next.delete(data.user_id);
                return next;
              });
              userTypingTimeoutsRef.current.delete(data.user_id);
            }, 3000);
            
            userTypingTimeoutsRef.current.set(data.user_id, timeout);
          }
        } else if (data.type === 'stop_typing' && data.user_id) {
          // Handle stop_typing event - clear immediately after a short delay
          if (data.user_id !== (user?.id ?? '')) {
            console.log('[Typing] Stop typing:', data.user_id);
            
            // Clear any existing timeout for this user
            const existingTimeout = userTypingTimeoutsRef.current.get(data.user_id);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
            }
            
            // Set shorter timeout to clear typing indicator after stop_typing
            const timeout = setTimeout(() => {
              console.log('[Typing] Stop typing timeout clearing:', data.user_id);
              setUsersTyping((prev) => {
                const next = new Set(prev);
                next.delete(data.user_id);
                return next;
              });
              userTypingTimeoutsRef.current.delete(data.user_id);
            }, 500);
            
            userTypingTimeoutsRef.current.set(data.user_id, timeout);
          }
        } else if (data.type === 'message' && data.message) {
          const m = data.message;
          if (m.user_name === 'Gemini') {
            setGeminiTyping(false);
            setGeminiTypingStatus('');
          }
          // Clear typing indicator for this user
          if (m.user_id) {
            // Clear any pending timeout
            const existingTimeout = userTypingTimeoutsRef.current.get(m.user_id);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
              userTypingTimeoutsRef.current.delete(m.user_id);
            }
            
            setUsersTyping((prev) => {
              const next = new Set(prev);
              next.delete(m.user_id);
              return next;
            });
          }
          setMessages((prev) => [
            ...prev,
            {
              id: String(m.id),
              content: m.content,
              isAI: m.is_ai,
              name: m.user_name || 'Unknown',
              user_id: m.user_id ?? '',
              timestamp: m.created_at || new Date().toISOString(),
              ...(Array.isArray(m.suggestions) && m.suggestions.length > 0 ? { suggestions: m.suggestions } : {}),
            },
          ]);
          setTimeout(() => messagesScrollRef.current?.scrollToEnd({ animated: true }), 100);
        } else if (data.type === 'itinerary' && data.itinerary && Array.isArray(data.itinerary) && id) {
          setGeminiTyping(false);
          setGeminiTypingStatus('');
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

  // Geocode locations for the map
  useEffect(() => {
    if (!trip?.itinerary) {
      console.log('[Map] No itinerary found');
      return;
    }
    
    const locations: string[] = [];
    trip.itinerary.forEach((day) => {
      day.activities.forEach((activity) => {
        if (activity.location) {
          locations.push(activity.location);
        }
      });
    });

    console.log('[Map] Extracted locations:', locations);

    if (locations.length === 0) {
      setMapCoordinates([]);
      return;
    }

    setLoadingCoordinates(true);
    const base = (CHAT_WS_BASE || '').replace(/\/$/, '');
    console.log('[Map] Geocoding API base:', base);
    
    Promise.all(
      locations.map(async (location) => {
        try {
          const url = `${base}/places/geocode?address=${encodeURIComponent(location)}`;
          console.log('[Map] Fetching:', url);
          const res = await fetch(url);
          console.log('[Map] Response status for', location, ':', res.status);
          if (res.ok) {
            const data = await res.json();
            console.log('[Map] Geocode result for', location, ':', data);
            if (data.lat && data.lng) {
              return { location, lat: data.lat, lng: data.lng };
            }
          } else {
            console.error('[Map] Bad response:', res.status, await res.text());
          }
        } catch (e) {
          console.error('[Map] Geocoding failed for', location, e);
        }
        return null;
      })
    ).then((results) => {
      console.log('[Map] All geocoding results:', results);
      const coords = results.filter((r): r is { location: string; lat: number; lng: number } => r !== null);
      console.log('[Map] Valid coordinates:', coords);
      setMapCoordinates(coords);
      setLoadingCoordinates(false);
      
      // Fit map to show all markers
      if (coords.length > 0 && mapRef.current) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(
            coords.map(c => ({ latitude: c.lat, longitude: c.lng })),
            {
              edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
              animated: true,
            }
          );
        }, 500);
      }
    });
  }, [trip?.itinerary, CHAT_WS_BASE]);

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
    // Refocus the message input so user can keep typing
    setTimeout(() => messageInputRef.current?.focus(), 50);
  };

  const handleAddPictures = async () => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web') {
      fileInputRef.current?.click();
      return;
    }
    const ImagePicker = require('expo-image-picker');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled) return;

    const base = (CHAT_WS_BASE || '').replace(/\/$/, '');
    if (base) {
      try {
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
          setAlbumMediaByTripId((prev) => ({
            ...prev,
            [id]: [
              ...(prev[id] ?? []),
              ...added.map((m) => ({
                uri: `${base}${m.uri}`,
                type: (m.type === 'video' ? 'video' : 'image') as 'image' | 'video',
              })),
            ],
          }));
        } else {
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
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
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
                            isGemini ? (
                              <View style={styles.messageNameRow}>
                                <AnimatedGeminiIcon size={14} />
                                <Text style={[styles.messageName, styles.messageNameLeft, { marginBottom: 0 }]}>
                                  {msg.name}
                                </Text>
                              </View>
                            ) : (
                              <Text
                                style={[
                                  styles.messageName,
                                  fromMe ? styles.messageNameRight : styles.messageNameLeft,
                                ]}>
                                {msg.name}
                              </Text>
                            )
                          )}
                          <View style={{ position: 'relative' }}>
                            <View
                              style={[
                                styles.messageBubble,
                                fromMe 
                                  ? styles.bubbleUser 
                                  : isGemini 
                                    ? styles.bubbleAI 
                                    : {
                                        backgroundColor: userColor?.bg,
                                        borderBottomLeftRadius: 4,
                                      },
                              ]}>
                              <MarkdownText
                                baseStyle={StyleSheet.flatten([
                                  styles.messageText,
                                  fromMe 
                                    ? styles.messageTextUser 
                                    : { color: isGemini ? colors.text : (userColor?.text || colors.text) },
                                ])}
                                codeStyle={
                                  fromMe
                                    ? { backgroundColor: 'rgba(0,0,0,0.15)' }
                                    : { backgroundColor: 'rgba(0,0,0,0.1)' }
                                }
                              >
                                {msg.content}
                              </MarkdownText>
                              {!fromMe && msg.suggestions && msg.suggestions.length > 0 && (
                                <View style={styles.suggestionList}>
                                    {msg.suggestions.map((opt, idx) => {
                                    const suggestionKey = `${msg.id}-${idx}`;
                                    const added = addedSuggestionKeys.has(suggestionKey);
                                    const resolving = resolvingSuggestionKey === suggestionKey;
                                    return (
                                      <View
                                        key={suggestionKey}
                                        style={[
                                          styles.suggestionRow,
                                          added && styles.suggestionAdded,
                                        ]}>
                                        <IconSymbol
                                          name="checkmark"
                                          size={18}
                                          color={colors.tint}
                                          style={styles.suggestionCheck}
                                        />
                                        <View style={styles.suggestionTextWrap}>
                                          {(opt.dayLabel || opt.time) && (
                                            <Text style={styles.suggestionSlot} numberOfLines={1}>
                                              {[opt.dayLabel, opt.time].filter(Boolean).join(' · ')}
                                            </Text>
                                          )}
                                          <Text style={styles.suggestionTitle}>{opt.title}</Text>
                                          {opt.description ? (
                                            <Text style={styles.suggestionDesc} numberOfLines={2}>
                                              {opt.description}
                                            </Text>
                                          ) : null}
                                        </View>
                                        <Pressable
                                          onPress={() =>
                                            addSuggestionToPlan(msg.id, idx, opt)
                                          }
                                          disabled={added || resolving}
                                          style={({ pressed }) => [
                                            styles.addToPlanBtn,
                                            (pressed || added || resolving) && { opacity: 0.8 },
                                          ]}>
                                          <Text style={styles.addToPlanBtnText}>
                                            {resolving
                                              ? 'Checking…'
                                              : added
                                                ? opt.replaceActivityId || opt.replaceTitle
                                                  ? 'Replaced'
                                                  : 'Added'
                                                : opt.replaceActivityId || opt.replaceTitle
                                                  ? 'Replace with this'
                                                  : 'Add to plan'}
                                          </Text>
                                        </Pressable>
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                            {isGemini && (
                              <LinearGradient
                                colors={['#FF6B6B', '#FFD93D', '#6BCF7F', '#4D96FF', '#9D4EDD', '#FF6B6B']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={{
                                  height: 3,
                                  marginTop: -1,
                                  marginRight: 10, // shorten gradient line on right (px)
                                  borderBottomLeftRadius: Radius.lg,
                                  borderBottomRightRadius: Radius.lg,
                                }}
                              />
                            )}
                          </View>
                        </View>
                      </Animated.View>
                    );
                  })}
                  {geminiTyping && (
                    <View style={[styles.messageRow, styles.messageRowAI]}>
                      <View style={[styles.messageBubbleWrapper, styles.messageBubbleWrapperAI]}>
                        <View style={styles.messageNameRow}>
                          <AnimatedGeminiIcon size={14} />
                          <Text style={[styles.messageName, styles.messageNameLeft, { marginBottom: 0 }]}>Gemini</Text>
                        </View>
                        <View style={{ position: 'relative' }}>
                          <View
                            style={[
                              styles.messageBubble,
                              styles.bubbleAI,
                              styles.typingBubble,
                            ]}>
                            <View style={styles.typingDotsRow}>
                              {[0, 1, 2].map((i) => (
                                <RNAnimated.View
                                  key={i}
                                  style={[styles.typingDot, { opacity: dotAnims[i] }]}
                                />
                              ))}
                            </View>
                            {geminiTypingStatus ? (
                              <Text style={styles.typingStatusText}>{geminiTypingStatus}</Text>
                            ) : null}
                          </View>
                          <LinearGradient
                            colors={['#FF6B6B', '#FFD93D', '#6BCF7F', '#4D96FF', '#9D4EDD', '#FF6B6B']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={{
                              height: 3,
                              marginTop: -1,
                              marginRight: 8, // shorten gradient line on right (px)
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
                          <Text style={[styles.messageName, styles.messageNameLeft, { marginBottom: 0 }]}>
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
                            <View style={styles.typingDotsRow}>
                              <View style={styles.typingDot} />
                              <View style={styles.typingDot} />
                              <View style={styles.typingDot} />
                            </View>
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
                        <AnimatedGeminiIcon size={18} />
                      )}
                      <Text style={styles.mentionOptionText}>{option.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            <TextInput
              ref={messageInputRef}
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
                  {day.date != null && day.date !== '' && (
                    <Text style={styles.itineraryDayDate}>{formatDayDate(day.date)}</Text>
                  )}
                  <Text style={styles.itineraryDayTitle}>{day.title}</Text>
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
                        {activity.location != null && activity.location !== '' && (() => {
                          const loc = activity.location!;
                          // Only link for specific places with street address (number + comma); not cities/areas like "San Francisco", "Napa"
                          const isAddress = /,\s*/.test(loc) && /\d/.test(loc);
                          if (isAddress) {
                            return (
                              <Pressable
                                onPress={() => {
                                  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;
                                  Linking.openURL(url);
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                                style={({ pressed }: { pressed: boolean }) => [
                                  { opacity: pressed ? 0.7 : 1 },
                                  styles.itineraryActivityLocationPressable,
                                ]}
                              >
                                <View style={styles.itineraryActivityLocationLinkRow}>
                                  <IconSymbol name="map.fill" size={14} color={colors.tint} style={{ marginRight: 6 }} />
                                  <Text style={styles.itineraryActivityLocationLink}>{loc}</Text>
                                </View>
                              </Pressable>
                            );
                          }
                          return <Text style={styles.itineraryActivityLocation}>{loc}</Text>;
                        })()}
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

      {activeTab === 'Costs' && <CostsTab tripId={id!} colors={colors} styles={styles} user={user} trip={trip} />}

      {activeTab === 'Map' && (
        <View style={styles.mapContainer}>
          {(() => {
            // Extract all locations from the itinerary
            const locations: string[] = [];
            if (trip.itinerary) {
              trip.itinerary.forEach((day) => {
                day.activities.forEach((activity) => {
                  if (activity.location) {
                    locations.push(activity.location);
                  }
                });
              });
            }

            if (locations.length === 0) {
              return (
                <View style={styles.mapPlaceholder}>
                  <IconSymbol
                    name="map.fill"
                    size={48}
                    color={colors.textTertiary}
                  />
                  <Text style={styles.mapPlaceholderTitle}>No locations yet</Text>
                  <Text style={styles.mapPlaceholderText}>
                    Add locations to your itinerary in the Chat or Plan tab to see them on the map
                  </Text>
                </View>
              );
            }

            // For web: use iframe embed
            if (Platform.OS === 'web') {
              const origin = encodeURIComponent(locations[0]);
              const destination = encodeURIComponent(locations[locations.length - 1]);
              
              let embedUrl: string;
              if (locations.length === 1) {
                // Single location: show the place
                embedUrl = `https://www.google.com/maps?q=${origin}&output=embed`;
              } else {
                // Multiple locations: show directions with waypoints
                const waypoints = locations.length > 2
                  ? '&waypoints=' + locations.slice(1, -1).map(l => encodeURIComponent(l)).join('|')
                  : '';
                embedUrl = `https://www.google.com/maps/embed/v1/directions?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&origin=${origin}&destination=${destination}${waypoints}`;
              }

              return (
                <View style={{ flex: 1, position: 'relative' }}>
                  <iframe
                    src={embedUrl}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 0,
                    }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                  <View
                    style={{
                      position: 'absolute',
                      top: Spacing.md,
                      right: Spacing.md,
                      backgroundColor: colors.surface,
                      borderRadius: Radius.lg,
                      padding: Spacing.sm,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.25,
                      shadowRadius: 4,
                    }}>
                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 12, color: colors.text }}>
                      {locations.length} stop{locations.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
              );
            }

            // For native (iOS Expo Go): use react-native-maps with Apple Maps
            if (loadingCoordinates) {
              return (
                <View style={[styles.mapPlaceholder, { backgroundColor: colors.surface }]}>
                  <IconSymbol
                    name="map.fill"
                    size={48}
                    color={colors.textTertiary}
                  />
                  <Text style={styles.mapPlaceholderTitle}>Loading map...</Text>
                  <Text style={styles.mapPlaceholderText}>
                    Geocoding {locations.length} location{locations.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              );
            }

            if (mapCoordinates.length === 0) {
              return (
                <View style={styles.mapPlaceholder}>
                  <IconSymbol
                    name="exclamationmark.triangle.fill"
                    size={48}
                    color={colors.textTertiary}
                  />
                  <Text style={styles.mapPlaceholderTitle}>Unable to load map</Text>
                  <Text style={styles.mapPlaceholderText}>
                    Could not geocode locations. Check your network connection.
                  </Text>
                </View>
              );
            }

            return (
              <View style={{ flex: 1, position: 'relative' }}>
                <MapView
                  ref={mapRef}
                  style={{ flex: 1 }}
                  initialRegion={{
                    latitude: mapCoordinates[0].lat,
                    longitude: mapCoordinates[0].lng,
                    latitudeDelta: 0.1,
                    longitudeDelta: 0.1,
                  }}
                  showsUserLocation
                  showsMyLocationButton
                >
                  {mapCoordinates.map((coord, index) => (
                    <Marker
                      key={`${coord.location}-${index}`}
                      coordinate={{ latitude: coord.lat, longitude: coord.lng }}
                      title={`Stop ${index + 1}`}
                      description={coord.location}
                      pinColor={
                        index === 0
                          ? 'green'
                          : index === mapCoordinates.length - 1
                          ? 'red'
                          : '#E8A68A'
                      }
                    />
                  ))}
                  {mapCoordinates.length > 1 && (
                    <Polyline
                      coordinates={mapCoordinates.map(c => ({
                        latitude: c.lat,
                        longitude: c.lng,
                      }))}
                      strokeColor="#E8A68A"
                      strokeWidth={3}
                    />
                  )}
                </MapView>
                <View
                  style={{
                    position: 'absolute',
                    bottom: Spacing.lg,
                    left: Spacing.md,
                    right: Spacing.md,
                    backgroundColor: colors.surface,
                    borderRadius: Radius.lg,
                    padding: Spacing.md,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.25,
                    shadowRadius: 4,
                    elevation: 5,
                  }}>
                  <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 4 }}>
                    {mapCoordinates.length} location{mapCoordinates.length !== 1 ? 's' : ''} in route
                  </Text>
                  <Pressable
                    onPress={() => {
                      // Build Google Maps URL using lat,lng coordinates for better accuracy
                      if (mapCoordinates.length === 1) {
                        // Single location: just navigate to it
                        const coord = mapCoordinates[0];
                        const url = `https://www.google.com/maps/search/?api=1&query=${coord.lat},${coord.lng}`;
                        Linking.openURL(url);
                      } else {
                        // Multiple locations: use directions with waypoints
                        const origin = mapCoordinates[0];
                        const dest = mapCoordinates[mapCoordinates.length - 1];
                        const waypoints = mapCoordinates
                          .slice(1, -1)
                          .map(c => `${c.lat},${c.lng}`)
                          .join('|');
                        
                        const url = waypoints
                          ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&waypoints=${waypoints}`
                          : `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}`;
                        Linking.openURL(url);
                      }
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? colors.surfaceMuted : colors.tint,
                      borderRadius: Radius.md,
                      padding: Spacing.sm,
                      marginTop: Spacing.sm,
                      alignItems: 'center',
                    })}>
                    <Text style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 14, color: '#FFFFFF' }}>
                      Open in Google Maps App
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })()}
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
                const total = media.length + (tripCoverImage ? 1 : 0);
                return total > 0
                  ? `This trip has its own album. ${total} item${total !== 1 ? 's' : ''} in this shared space. Media is not shared with other trips.`
                  : 'Add photos and videos above. They stay in this trip only—no sharing between trips.';
              })()}
            </Text>
            {(() => {
              const media = albumMediaByTripId[id ?? ''] ?? [];
              const withCover = tripCoverImage
                ? [{ uri: tripCoverImage.uri, type: 'image' as const, isCover: true, attributions: tripCoverImage.attributions }]
                : [];
              const allItems = [...withCover, ...media.map((m) => ({ ...m, isCover: false as const, attributions: [] as { displayName?: string; uri?: string }[] }))];
              if (allItems.length === 0) return null;
              let imageIndex = 0;
              return (
                <View style={styles.albumMediaGrid}>
                  {allItems.map((item, index) => (
                    <View key={item.isCover ? 'cover' : `${item.uri}-${index}`} style={styles.albumMediaItem}>
                      {item.type === 'image' ? (() => {
                          const idx = imageIndex++;
                          return (
                            <View>
                              <Pressable
                                style={{ width: 96, height: 96 }}
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  setViewingImageIndex(idx);
                                }}>
                                <Image source={{ uri: item.uri }} style={{ width: 96, height: 96 }} contentFit="cover" />
                              </Pressable>
                              {item.isCover && item.attributions && item.attributions.length > 0 && (
                                <Text style={styles.albumCoverAttribution} numberOfLines={1}>
                                  Photo: {item.attributions.map((a) => a.displayName).filter(Boolean).join(', ') || 'Google'}
                                </Text>
                              )}
                            </View>
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
              const coverUris = tripCoverImage ? [tripCoverImage.uri] : [];
              const media = albumMediaByTripId[id ?? ''] ?? [];
              const imageUris = media.filter((m): m is { uri: string; type: 'image' } => m.type === 'image').map((m) => m.uri);
              return [...coverUris, ...imageUris];
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

      <Modal
        visible={!!addToPlanConflict}
        transparent
        animationType="fade"
        onRequestClose={() => setAddToPlanConflict(null)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setAddToPlanConflict(null)}>
          <Pressable
            style={{
              backgroundColor: colors.surface,
              borderRadius: Radius.lg,
              padding: Spacing.xl,
              width: '90%',
              maxWidth: 400,
              alignItems: 'stretch',
            }}
            onPress={(e) => e.stopPropagation()}>
            <Text
              style={{
                fontFamily: 'Fraunces_600SemiBold',
                fontSize: 18,
                color: colors.text,
                marginBottom: Spacing.sm,
              }}>
              Schedule conflict
            </Text>
            <Text
              style={{
                fontFamily: 'DMSans_400Regular',
                fontSize: 15,
                color: colors.textSecondary,
                marginBottom: Spacing.lg,
              }}>
              {addToPlanConflict?.message}
            </Text>
            <View style={{ gap: Spacing.sm }}>
              {addToPlanConflict?.resolutionOptions.map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => resolveAddToPlanConflict(opt)}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? colors.surfaceMuted : colors.tint,
                    borderRadius: Radius.md,
                    paddingVertical: Spacing.sm,
                    paddingHorizontal: Spacing.md,
                    alignItems: 'center',
                    opacity: pressed ? 0.9 : 1,
                  })}>
                  <Text
                    style={{
                      fontFamily: 'DMSans_600SemiBold',
                      fontSize: 15,
                      color: '#FFFFFF',
                    }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={() => setAddToPlanConflict(null)}
              style={({ pressed }) => ({
                marginTop: Spacing.md,
                paddingVertical: Spacing.sm,
                alignItems: 'center',
                opacity: pressed ? 0.6 : 1,
              })}>
              <Text
                style={{
                  fontFamily: 'DMSans_500Medium',
                  fontSize: 15,
                  color: colors.textTertiary,
                }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
