import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../ui/components';
import { useTheme } from '../../ui/theme';
export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line, height: 64 + insets.bottom, paddingBottom: Math.max(insets.bottom, 8) }, tabBarLabelStyle: { fontSize: 10, lineHeight: 14, flexShrink: 0 }, tabBarItemStyle: { paddingTop: 6 } }}>
    <Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: ({ color }) => <Icon name="grid-outline" color={color} /> }} />
    <Tabs.Screen name="holdings" options={{ title: 'Holdings', tabBarIcon: ({ color }) => <Icon name="layers-outline" color={color} /> }} />
    <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: ({ color }) => <Icon name="swap-vertical-outline" color={color} /> }} />
    <Tabs.Screen name="analytics" options={{ title: 'Analytics', tabBarIcon: ({ color }) => <Icon name="stats-chart-outline" color={color} /> }} />
  </Tabs>;
}
