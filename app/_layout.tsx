import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

import { UserProvider } from '@/contexts/user-context';
import { TripsProvider } from '@/contexts/trips-context';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/contexts/theme-context';
import { Colors } from '@/constants/theme';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

SplashScreen.preventAutoHideAsync();

const LightNavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.tint,
    background: Colors.light.background,
    card: Colors.light.backgroundElevated,
    text: Colors.light.text,
    border: Colors.light.border,
  },
};

const DarkNavTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.dark.tint,
    background: Colors.dark.background,
    card: Colors.dark.backgroundElevated,
    text: Colors.dark.text,
    border: Colors.dark.border,
  },
};

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="trip/[id]" />
    </Stack>
  );
}

function ThemedRoot() {
  const { colorScheme } = useTheme();
  const navTheme = colorScheme === 'dark' ? DarkNavTheme : LightNavTheme;
  return (
    <ConvexProvider client={convex}>
      <ThemeProvider value={navTheme}>
        <UserProvider>
          <TripsProvider>
            <RootLayoutNav />
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          </TripsProvider>
        </UserProvider>
      </ThemeProvider>
    </ConvexProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <AppThemeProvider>
      <ThemedRoot />
    </AppThemeProvider>
  );
}
