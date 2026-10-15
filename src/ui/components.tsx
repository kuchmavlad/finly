import { useState, type ReactNode, type ComponentProps } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePortfolio } from '../state/PortfolioContext';
import { useTheme } from './theme';

export function Icon({ name, color, size = 21 }: { name: ComponentProps<typeof Ionicons>['name']; color?: ComponentProps<typeof Ionicons>['color']; size?: number }) {
  const { colors } = useTheme(); return <Ionicons name={name} size={size} color={color ?? colors.muted} />;
}
export function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 52, padding: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: secondary ? colors.elevated : colors.accent, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}><Text style={{ fontSize: 15, fontWeight: '600', color: secondary ? colors.text : colors.bg }}>{title}</Text></Pressable>;
}
export function Chip({ title, active, onPress, disabled = false }: { title: string; active?: boolean; onPress: () => void; disabled?: boolean }) {
  const { colors, styles: s } = useTheme();
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: active, disabled }} onPress={onPress} style={[s.chip, active && { backgroundColor: colors.accent }, disabled && { opacity: 0.5 }]}><Text style={{ color: active ? colors.bg : colors.muted, fontWeight: '600', fontSize: 13 }}>{title}</Text></Pressable>;
}
export function Screen({ children, title, subtitle, controls = true, scroll = true }: { children: ReactNode; title: string; subtitle?: string; controls?: boolean; scroll?: boolean }) {
  const { styles: s } = useTheme();
  const header = <><View style={s.row}><View style={{ flex: 1 }}><Text style={s.title}>{title}</Text>{subtitle && <Text style={[s.muted, { marginTop: 5 }]}>{subtitle}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={{ padding: 12 }}><Icon name="options-outline" /></Pressable></View>{controls && <ScopeControls />}</>;
  return <SafeAreaView edges={['top']} style={s.screen}>{scroll ? <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">{header}{children}</ScrollView> : <View style={{ flex: 1 }}><View style={s.content}>{header}</View>{children}</View>}</SafeAreaView>;
}
export function ScopeControls() {
  const { colors, styles: s } = useTheme();
  const { portfolios, scope, store } = usePortfolio();
  const [visible, setVisible] = useState(false);
  const name = scope === 'all' ? 'All portfolios' : portfolios?.find(p => p.id === scope)?.name ?? 'Portfolio';
  return <><Pressable accessibilityRole="button" accessibilityLabel={`Select portfolio, ${name}`} onPress={() => setVisible(true)} style={[s.chip, s.row]}><Text numberOfLines={1} style={[s.text, { flex: 1 }]}>{name}</Text><Icon name="chevron-down" size={14} /></Pressable>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}><View style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }}><Pressable accessibilityRole="button" accessibilityLabel="Close portfolio picker" style={{ flex: 1 }} onPress={() => setVisible(false)} /><SafeAreaView edges={['bottom']} style={{ maxHeight: '80%', backgroundColor: colors.panel, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}><ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}><Text style={s.heading}>Your portfolios</Text>{[{ id: 'all', name: 'All portfolios' }, ...(portfolios ?? [])].map(p => <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: scope === p.id }} onPress={() => { store.setScope(p.id); setVisible(false); }} style={[s.row, { paddingVertical: 12 }]}><Text style={[s.text, { flex: 1 }]}>{p.name}</Text>{scope === p.id && <Icon name="checkmark" color={colors.accent} />}</Pressable>)}<Button title="Create portfolio" onPress={() => { setVisible(false); router.push('/account'); }} /><Button title="Close" secondary onPress={() => setVisible(false)} /></ScrollView></SafeAreaView></View></Modal>
  </>;
}
export function Notice({ text }: { text: string }) {
  const { colors, styles: s } = useTheme();
  return <View style={[s.card, { borderWidth: 1, borderColor: colors.warningBorder, padding: 14 }]}><Text accessibilityRole="alert" style={[s.muted, { color: colors.warning }]}>{text}</Text></View>;
}
export function DataGate({ children, needs = 'balances' }: { children: ReactNode; needs?: 'balances' | 'entries' | 'portfolios' }) {
  const { colors, styles: s } = useTheme();
  const state = usePortfolio();
  const ready = state.portfolios !== null && state[needs] !== null;
  return <>{state.loading && <ActivityIndicator accessibilityLabel="Loading server data" color={colors.accent} />}
    {state.error ? <><Notice text={state.error} /><Button title="Try again" disabled={state.loading} onPress={() => void state.store.refresh()} /></> : null}
    {!ready && !state.loading && !state.error && <Text style={s.muted}>Server data has not loaded.</Text>}
    {ready && children}
  </>;
}
export function EmptyPortfolios() {
  const { styles: s } = useTheme();
  return <View style={s.card}><Text style={s.heading}>No portfolios yet</Text><Text style={s.muted}>Create a portfolio for a broker, bank or another place where you keep investments.</Text><Button title="Create portfolio" onPress={() => router.push('/account')} /></View>;
}
export function PendingNotice() {
  const { pending, pendingReady } = usePortfolio();
  const { styles: s } = useTheme();
  if (pendingReady && !pending) return null;
  return <View style={s.card}><Text style={s.muted}>{pending ? 'A cash movement needs confirmation. Retry its original request safely.' : 'Checking for an unfinished cash movement.'}</Text><Button title="Review cash operation" secondary onPress={() => router.push('/add-operation')} /></View>;
}
