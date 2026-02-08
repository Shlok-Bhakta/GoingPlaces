/**
 * Going Places — Warm travel editorial aesthetic
 * Cream backgrounds, terracotta accents, refined typography
 * Light and dark mode with user preference in Settings.
 */

import { Platform } from 'react-native';

// Primary palette — warm, inviting, travel-inspired
export const Colors = {
  light: {
    background: '#F8F6F2',
    backgroundElevated: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#F0EDE8',
    text: '#1C1C1E',
    textSecondary: '#6B6B6F',
    textTertiary: '#8E8E93',
    tint: '#C45C3E',
    accent: '#C45C3E',
    accentMuted: '#E8A68A',
    success: '#5B8A72',
    warning: '#D4A054',
    error: '#D44B47',
    border: '#E5E2DD',
    borderLight: '#EDEBE7',
    icon: '#6B6B6F',
    tabIconDefault: '#8E8E93',
    tabIconSelected: '#C45C3E',
  },
  dark: {
    // Fallback for system dark mode — still warm
    background: '#1C1B19',
    backgroundElevated: '#252422',
    surface: '#2D2C2A',
    surfaceMuted: '#252422',
    text: '#F5F3F0',
    textSecondary: '#A8A6A3',
    textTertiary: '#7A7875',
    tint: '#E8A68A',
    accent: '#E8A68A',
    accentMuted: '#C45C3E',
    success: '#7BA88E',
    warning: '#E4B87A',
    error: '#E37067',
    border: '#3D3B38',
    borderLight: '#353330',
    icon: '#A8A6A3',
    tabIconDefault: '#7A7875',
    tabIconSelected: '#E8A68A',
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const Fonts = Platform.select({
  ios: {
    display: 'System',
    body: 'System',
    rounded: 'System',
    mono: 'Menlo',
  },
  default: {
    display: 'System',
    body: 'System',
    rounded: 'System',
    mono: 'monospace',
  },
});
