import { useState, type ReactNode, type ComponentProps } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePortfolio } from '../state/PortfolioContext';
import { useTheme } from './theme';
import type { Operation, Position } from '../domain/models';
import { dateLabel, money, percent } from './format';

export function Icon({ name, color, size = 21 }: { name: ComponentProps<typeof Ionicons>['name']; color?: ComponentProps<typeof Ionicons>['color']; size?: number }) {
  const { colors } = useTheme(); return <Ionicons name={name} size={size} color={color ?? colors.muted} />; }
export function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 52, padding: 15, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: secondary ? colors.elevated : colors.accent, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}><Text style={{ fontSize: 15, fontWeight: '600', color: secondary ? colors.text : colors.bg }}>{title}</Text></Pressable>;
}
export function Chip({ title, active, onPress }: { title: string; active?: boolean; onPress: () => void }) {
  const { colors, styles: s } = useTheme(); return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.chip, active && { backgroundColor: colors.accent }]}><Text style={{ color: active ? colors.bg : colors.muted, fontWeight: '600', fontSize: 13 }}>{title}</Text></Pressable>; }
export function DemoNote({ children }: { children?: ReactNode }) {
  const { styles: s } = useTheme(); return <Text style={[s.muted, { fontSize: 11 }]}>{children ?? 'Demo data · As of Oct 13, 2026 · No live market prices'}</Text>; }
export function Screen({ children, title, subtitle, controls = true }: { children: ReactNode; title: string; subtitle?: string; controls?: boolean }) {
  const { styles: s } = useTheme();
  return <SafeAreaView edges={['top']} style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={s.row}><View style={{ flex: 1 }}><Text style={s.title}>{title}</Text>{subtitle && <Text style={[s.muted, { marginTop: 5 }]}>{subtitle}</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => router.push('/settings')} style={{ padding: 12 }}><Icon name="options-outline" /></Pressable></View>
    {controls && <ScopeControls />}{children}
  </ScrollView></SafeAreaView>;
}
export function ScopeControls() {
  const { colors, styles: s } = useTheme();
  const { data, scope, setScope, currency, setCurrency } = usePortfolio();
  const [visible, setVisible] = useState(false);
  const name = scope === 'all' ? 'All portfolios' : data?.portfolios.find(p => p.id === scope)?.name ?? 'Portfolio';
  return <><View style={s.row}><Pressable accessibilityRole="button" accessibilityLabel={`Select portfolio, ${name}`} onPress={() => setVisible(true)} style={[s.chip, { flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }]}><Text numberOfLines={1} style={[s.text, { flex: 1, fontSize: 13 }]}>{name}</Text><Icon name="chevron-down" size={14} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Display currency ${currency}, switch to ${currency === 'USD' ? 'UAH' : 'USD'}`} onPress={() => setCurrency(currency === 'USD' ? 'UAH' : 'USD')} style={[s.chip, { flexDirection: 'row', gap: 8 }]}><Text style={[s.text, { fontSize: 13 }]}>{currency}</Text><Icon name="swap-horizontal" size={15} /></Pressable></View>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}><View style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }}><Pressable accessibilityRole="button" accessibilityLabel="Close portfolio picker" style={{ flex: 1 }} onPress={() => setVisible(false)} /><SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.panel, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}><View style={{ padding: 24, gap: 14 }}><View style={s.row}><Text style={s.heading}>Your portfolios</Text><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setVisible(false)} style={{ padding: 10 }}><Icon name="close" /></Pressable></View>{[{ id: 'all' as const, name: 'All portfolios', subtitle: 'Everything, together', color: colors.accent }, ...(data?.portfolios ?? [])].map(p => <Pressable key={p.id} accessibilityRole="button" onPress={() => { setScope(p.id); setVisible(false); }} style={[s.row, { paddingVertical: 10 }]}><View style={{ width: 9, height: 9, borderRadius: 9, backgroundColor: p.color }} /><View style={{ flex: 1 }}><Text style={s.text}>{p.name}</Text><Text style={s.muted}>{p.subtitle}</Text></View>{scope === p.id && <Icon name="checkmark" color={colors.accent} />}</Pressable>)}</View></SafeAreaView></View></Modal>
  </>;
}
export function DataGate({ children }: { children: ReactNode }) {
  const { colors, styles: s } = useTheme();
  const { data, state, refresh } = usePortfolio();
  if (state === 'loading') return <View style={[s.card, { paddingVertical: 60, alignItems: 'center' }]}><ActivityIndicator color={colors.accent} /><Text style={s.muted}>Loading your demo portfolio…</Text><Button title="Reload demo" secondary onPress={() => void refresh()} /></View>;
  if (state === 'error' || !data) return <View style={s.card}><Icon name="cloud-offline-outline" color={colors.warning} /><Text style={s.heading}>Couldn’t load your portfolio</Text><Text style={s.muted}>This is a simulated connection error. Your demo entries are safe for this session.</Text><Button title="Try again" onPress={() => void refresh()} /></View>;
  return <>{state === 'missing' && <Notice text="Prices unavailable. Totals are partial; profit and allocation are hidden." />}{state === 'stale' && <Notice text="Prices are out of date. Values use the last demo estimates." />}{children}</>;
}
export function Notice({ text }: { text: string }) {
  const { colors, styles: s } = useTheme(); return <View style={[s.card, { borderWidth: 1, borderColor: colors.warningBorder, padding: 14 }]}><Text style={[s.muted, { color: colors.warning }]}>{text}</Text></View>; }
export function Empty({ title = 'A fresh start', text = 'Add your first demo deposit to see this portfolio take shape.' }: { title?: string; text?: string }) {
  const { colors, styles: s } = useTheme(); return <View style={[s.card, { paddingVertical: 34, alignItems: 'center' }]}><Icon name="leaf-outline" size={32} color={colors.accent} /><Text style={s.heading}>{title}</Text><Text style={[s.muted, { textAlign: 'center' }]}>{text}</Text><Button title="Add demo operation" onPress={() => router.push('/add-operation')} /></View>; }
export function HoldingRow({ position }: { position: Position }) {
  const { colors, styles: s } = useTheme();
  const { currency, data } = usePortfolio();
  const p = position;
  const stale = !!data && (Date.parse(data.asOf) - Date.parse(p.asset.priceDate)) / 86400000 > 7;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${p.asset.name}`} onPress={() => router.push({ pathname: '/asset/[id]', params: { id: p.asset.id } })} style={[s.row, { paddingVertical: 12 }]}><View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: p.asset.color, fontWeight: '700', fontSize: 15 }}>{p.asset.symbol.slice(0, 1)}</Text></View><View style={{ flex: 1, gap: 3 }}><Text style={[s.text, { fontWeight: '600' }]}>{p.asset.symbol}</Text><Text style={[s.muted, { fontSize: 11 }]}>{p.quantity} units · {p.asset.kind}{stale ? ' · Old estimate' : ''}</Text></View><View style={{ alignItems: 'flex-end', gap: 3 }}><Text style={s.text}>{p.valueMinor === null ? 'No price' : money(p.valueMinor, currency)}</Text><Text style={{ color: p.valueMinor === null ? colors.warning : p.valueMinor >= p.costMinor ? colors.positive : colors.negative, fontSize: 12 }}>{p.valueMinor === null ? 'Value unavailable' : percent(p.costMinor ? (p.valueMinor - p.costMinor) / p.costMinor * 100 : 0)}</Text></View></Pressable>;
}
export const operationLabels: Record<Operation['kind'], string> = { deposit: 'Deposit', withdrawal: 'Withdrawal', buy: 'Buy', sell: 'Sell', dividend: 'Dividend', coupon: 'Coupon', fee: 'Fee' };
export function OperationRow({ operation: o }: { operation: Operation }) {
  const { colors, styles: s } = useTheme();
  const { data } = usePortfolio();
  const asset = data?.assets.find(a => a.id === o.assetId);
  const outgoing = ['buy', 'withdrawal', 'fee'].includes(o.kind);
  return <View style={[s.row, { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }]}><View style={{ backgroundColor: colors.elevated, width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}><Icon size={17} name={outgoing ? 'arrow-up-outline' : 'arrow-down-outline'} color={outgoing ? colors.muted : colors.positive} /></View><View style={{ flex: 1 }}><Text style={[s.text, { fontSize: 14 }]}>{operationLabels[o.kind]}{asset ? ` · ${asset.symbol}` : ''}</Text><Text style={[s.muted, { fontSize: 10 }]}>{dateLabel(o.date)} · {o.source === 'demo-import' ? 'Demo import' : 'Manual'}</Text><Text style={[s.muted, { fontSize: 10 }]}>{data?.portfolios.find(p => p.id === o.portfolioId)?.name}</Text></View><Text style={{ fontSize: 13, color: outgoing ? colors.text : colors.positive }}>{outgoing ? '−' : '+'}{money(o.amountMinor, o.currency)}</Text></View>;
}
