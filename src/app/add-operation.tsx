import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { usePortfolio } from '../state/PortfolioContext';
import type { Currency, OperationKind, PortfolioId } from '../domain/models';
import { parseAmount } from '../domain/ledger';
import { Button, Chip, DemoNote, operationLabels } from '../ui/components';
import { colors, styles as s } from '../ui/theme';

export default function AddOperation() {
  const { data, scope, setScope, add } = usePortfolio();
  const { assetId: initialAsset } = useLocalSearchParams<{ assetId?: string }>();
  const asset = data?.assets.find(a => a.id === initialAsset);
  const [portfolioId, setPortfolioId] = useState<PortfolioId>(asset?.portfolioId ?? (scope === 'all' ? 'ibkr' : scope));
  const [kind, setKind] = useState<OperationKind>(asset ? 'buy' : 'deposit');
  const [assetId, setAssetId] = useState(asset?.id ?? '');
  const [currency, setCurrency] = useState<Currency>(asset?.currency ?? (portfolioId === 'inzhur' || portfolioId === 'bonds' ? 'UAH' : 'USD'));
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(data?.asOf ?? '2026-10-13');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const needsAsset = ['buy', 'sell', 'dividend', 'coupon'].includes(kind);
  const isTrade = ['buy', 'sell'].includes(kind);
  const available = data?.assets.filter(a => a.portfolioId === portfolioId && (kind === 'coupon' ? !!a.bond : kind === 'dividend' ? !a.bond : true)) ?? [];
  const selected = available.find(a => a.id === assetId);
  const operationCurrency = needsAsset && selected ? selected.currency : currency;
  const submit = async () => {
    if (inFlight.current || !data) return;
    inFlight.current = true; setSaving(true); setError('');
    try {
      if (isTrade && !/^\d+$/.test(quantity)) throw new Error('Enter a whole number of units.');
      await add({ portfolioId, kind, currency: operationCurrency, amountMinor: parseAmount(amount), date, assetId: needsAsset ? assetId : undefined, quantity: isTrade ? Number(quantity) : undefined });
      setScope(portfolioId);
      setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Please try again.'); }
    finally { inFlight.current = false; setSaving(false); }
  };
  if (saved) return <View style={[s.screen, { justifyContent: 'center', padding: 24, gap: 24 }]}><Text style={[s.title, { color: colors.mint }]}>Operation added.</Text><Text style={s.muted}>Your demo balances and activity are updated. This entry lasts until the app reloads.</Text><Button title="View activity" onPress={() => router.replace('/activity')} /></View>;
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <DemoNote>DEMO ENTRY · Stored for this session only · No broker connection</DemoNote>
    <View style={{ gap: 10 }}><Text style={s.eyebrow}>Portfolio</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{data?.portfolios.map(p => <Chip key={p.id} title={p.name} active={portfolioId === p.id} onPress={() => { setPortfolioId(p.id); setAssetId(''); setCurrency(p.id === 'inzhur' || p.id === 'bonds' ? 'UAH' : 'USD'); }} />)}</View></View>
    <View style={{ gap: 10 }}><Text style={s.eyebrow}>Operation</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(Object.keys(operationLabels) as OperationKind[]).map(type => <Chip key={type} title={operationLabels[type]} active={kind === type} onPress={() => setKind(type)} />)}</View></View>
    {needsAsset && <View style={{ gap: 10 }}><Text style={s.eyebrow}>Asset</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{available.map(a => <Chip key={a.id} title={a.symbol} active={assetId === a.id} onPress={() => setAssetId(a.id)} />)}</View>{available.length === 0 && <Text style={s.muted}>No eligible demo assets here. Choose another portfolio or operation type.</Text>}</View>}
    {!needsAsset && <View style={{ flexDirection: 'row', gap: 8 }}>{(['USD', 'UAH'] as const).map(c => <Chip key={c} title={c} active={currency === c} onPress={() => setCurrency(c)} />)}</View>}
    <View style={{ gap: 10 }}><Text style={s.eyebrow}>{isTrade ? 'Total settlement amount' : 'Amount'} · {operationCurrency}</Text><TextInput accessibilityLabel="Amount" style={s.input} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.muted} keyboardType="decimal-pad" />{isTrade && <Text style={s.muted}>Total cash paid or received, not unit price. Include accrued interest for bonds. Add commissions separately as a Fee.</Text>}</View>
    {isTrade && <View style={{ gap: 10 }}><Text style={s.eyebrow}>Quantity · Whole units</Text><TextInput accessibilityLabel="Quantity" style={s.input} value={quantity} onChangeText={setQuantity} placeholder="10" placeholderTextColor={colors.muted} keyboardType="number-pad" /></View>}
    <View style={{ gap: 10 }}><Text style={s.eyebrow}>Date · YYYY-MM-DD</Text><TextInput accessibilityLabel="Operation date" style={s.input} value={date} onChangeText={setDate} placeholder="2026-10-13" placeholderTextColor={colors.muted} autoCapitalize="none" /><Text style={s.muted}>Demo window: Jan 1 – Oct 13, 2026.</Text></View>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.red, lineHeight: 22 }}>{error}</Text>}
    <Button title={saving ? 'Saving…' : 'Save demo operation'} onPress={() => void submit()} disabled={saving || !data} />
  </ScrollView></KeyboardAvoidingView>;
}
