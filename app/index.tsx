import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useUser } from '@/contexts/user-context';
import { useTheme } from '@/contexts/theme-context';

export default function Index() {
  const { user, isLoading, setUser } = useUser();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  // Check if user has invalid ID format (old temporary ID)
  if (user && user.id.startsWith('user_')) {
    // Clear invalid user and redirect to onboarding
    setUser(null);
    return <Redirect href="/onboarding" />;
  }

  if (!user) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
