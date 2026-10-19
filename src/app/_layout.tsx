import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PortfolioProvider } from '../state/PortfolioContext';
import { ThemeProvider, useTheme } from '../ui/theme';
import { AccountProvider, useAccount } from '../state/AccountContext';
import { ActivityIndicator, View } from 'react-native';

function Navigation() {
  const { colors } = useTheme();
  const { session, loading } = useAccount();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><StatusBar style="light" /><ActivityIndicator accessibilityLabel="Restoring your session" color={colors.accent} /></View>;
  return <><StatusBar style="light" /><Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg }, headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
    <Stack.Protected guard={!!session}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="asset/[id]" options={{ title: 'Asset details' }} />
    <Stack.Screen name="add-operation" options={{ title: 'Add operation', presentation: 'modal' }} />
    <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    <Stack.Screen name="account" options={{ title: 'Account' }} />
    <Stack.Screen name="import-preview" options={{ title: 'IBKR preview' }} />
    <Stack.Screen name="import-journal" options={{ title: 'IBKR import' }} />
    <Stack.Screen name="ibkr-sync" options={{ title: 'IBKR sync' }} />
    </Stack.Protected>
    <Stack.Protected guard={!session}>
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
    </Stack.Protected>
  </Stack></>;
}

export default function RootLayout() {
  return <SafeAreaProvider><ThemeProvider><AccountProvider><SessionContent /></AccountProvider></ThemeProvider></SafeAreaProvider>;
}

function SessionContent() {
  const { session } = useAccount();
  return <PortfolioProvider key={session?.user.id ?? 'signed-out'}><Navigation /></PortfolioProvider>;
}
