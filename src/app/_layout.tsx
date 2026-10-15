import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PortfolioProvider } from '../state/PortfolioContext';
import { ThemeProvider, useTheme } from '../ui/theme';
import { ChartSelectionProvider } from '../state/ChartSelectionContext';

function Navigation() {
  const { colors } = useTheme();
  return <><StatusBar style="light" /><Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg }, headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="asset/[id]" options={{ title: 'Asset details' }} />
    <Stack.Screen name="add-operation" options={{ title: 'Add operation', presentation: 'modal' }} />
    <Stack.Screen name="settings" options={{ title: 'Settings' }} />
  </Stack></>;
}

export default function RootLayout() {
  return <SafeAreaProvider><ThemeProvider><PortfolioProvider><ChartSelectionProvider><Navigation /></ChartSelectionProvider></PortfolioProvider></ThemeProvider></SafeAreaProvider>;
}
