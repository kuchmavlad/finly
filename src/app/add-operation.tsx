import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { usePortfolio } from '../state/PortfolioContext';
import { Button, Chip, EmptyPortfolios, Notice, Screen } from '../ui/components';
import { useTheme } from '../ui/theme';
import type { CashKind } from '../domain/account';
import OperationDateField from '../ui/OperationDateField';

export default function AddOperation() {
  const { styles: s, colors } = useTheme();
  const { portfolios, scope, pending, pendingReady, busy, mutationError, message, error, loading, store } = usePortfolio();
  const [portfolioId, setPortfolioId] = useState(scope === 'all' ? '' : scope);
  const [kind, setKind] = useState<CashKind>('deposit');
  const [currency, setCurrency] = useState('USD');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const input = pending ?? { portfolioId, kind, currency, amount, date };
  const locked = busy || !!pending || !pendingReady;
  const save = async () => {
    const saved = await store.save(input);
    if (saved) { setAmount(''); setDate(''); }
    else if (!store.getSnapshot().pending) {
      // Keep restored values editable after a confirmed server rejection.
      setPortfolioId(input.portfolioId); setKind(input.kind); setCurrency(input.currency);
      setAmount(input.amount); setDate(input.date);
    }
  };
  return <Screen title="Record cash movement" controls={false}>
    <Text style={s.muted}>Deposits and withdrawals only. Amounts stay in their original currencies.</Text>
    {error ? <><Notice text={error} /><Button title="Refresh server data" secondary disabled={loading} onPress={() => void store.refresh()} /></> : null}
    {mutationError ? <Notice text={mutationError} /> : null}
    {message ? <Text accessibilityRole="alert" style={s.muted}>{message}</Text> : null}
    {!pendingReady && <Button title="Retry pending recovery" secondary onPress={() => void store.restorePending()} />}
    {pending && !busy && <Notice text="This unfinished operation is locked to its original values. Retrying uses the same request ID and cannot duplicate it." />}
    {portfolios?.length === 0 && !pending ? <EmptyPortfolios /> : <View style={s.card}>
      <Text style={s.heading}>Portfolio</Text>
      {!input.portfolioId && <Text style={s.muted}>Select the portfolio for this movement.</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{portfolios?.map(p => <Chip key={p.id} title={p.name} active={input.portfolioId === p.id} disabled={locked} onPress={() => setPortfolioId(p.id)} />)}</View>
      {pending && !portfolios?.some(p => p.id === pending.portfolioId) && <Text style={s.muted}>Pending portfolio: {pending.portfolioId}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>{(['deposit', 'withdrawal'] as const).map(value => <Chip key={value} title={value === 'deposit' ? 'Deposit' : 'Withdrawal'} active={input.kind === value} disabled={locked} onPress={() => setKind(value)} />)}</View>
      <Text style={s.muted}>Currency code</Text><TextInput accessibilityLabel="Currency code" style={s.input} value={input.currency} onChangeText={value => setCurrency(value.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={3} editable={!locked} />
      <Text style={s.muted}>Amount</Text><TextInput accessibilityLabel="Amount" placeholder="0.00" placeholderTextColor={colors.muted} style={s.input} value={input.amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!locked} />
      <Text style={s.muted}>Operation date · No future dates</Text>
      <OperationDateField value={input.date} onChange={setDate} disabled={locked} />
      <Button title={busy ? 'Saving…' : pending ? 'Retry pending operation' : 'Save cash movement'} disabled={busy || !pendingReady || !input.portfolioId || !input.amount || !input.date || !/^[A-Z]{3}$/.test(input.currency)} onPress={() => void save()} />
    </View>}
    <Button title="View activity" secondary onPress={() => router.replace('/activity')} />
  </Screen>;
}
