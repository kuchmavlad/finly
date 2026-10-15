import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useAccount } from '../state/AccountContext';
import { deviceStorage, pendingCashKey, requireSupabase, supabase } from '../data/supabase';
import { addCashEntry, createPortfolio, loadAccount, type CashInput } from '../data/accountRepository';
import { decimalAmount, operationDate } from '../domain/serverInput';
import { Button, Chip } from '../ui/components';
import { useTheme } from '../ui/theme';

export default function AccountScreen() {
  const { styles: s, colors } = useTheme();
  const { session, loading, error } = useAccount();
  return <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>Your account</Text>
    <Text style={s.muted}>Private pilot · Server data is separate from the demo screens.</Text>
    {!supabase ? <Text style={s.text}>Account connection is not configured.</Text> : loading ? <ActivityIndicator color={colors.accent} /> : session ? <AccountData key={session.user.id} userId={session.user.id} /> : null}
    {error && <Text accessibilityRole="alert" style={s.muted}>{error}</Text>}
  </ScrollView>;
}

function AccountData({ userId }: { userId: string }) {
  const { styles: s, colors } = useTheme();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAccount>> | null>(null);
  const [name, setName] = useState('');
  const [portfolioId, setPortfolioId] = useState('');
  const [kind, setKind] = useState<'deposit' | 'withdrawal'>('deposit');
  const [currency, setCurrency] = useState('USD');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const lock = useRef(false);
  // Retain the same request on an ambiguous network failure, even if the form changes.
  const [pending, setPending] = useState<CashInput | null>(null);
  const [pendingReady, setPendingReady] = useState(false);
  const refresh = useCallback(async () => {
    const next = await loadAccount();
    if (mounted.current) { setData(next); setPortfolioId(current => current || next.portfolios[0]?.id || ''); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    deviceStorage.getItem(pendingCashKey(userId)).then(value => {
      if (!mounted.current) return;
      if (value) {
        const input = JSON.parse(value) as CashInput;
        setPending(input); setPortfolioId(input.portfolioId); setKind(input.kind);
        setCurrency(input.currency); setAmount(input.amount); setDate(input.date);
      }
      setPendingReady(true);
    }).catch(() => { if (mounted.current) setError('Could not restore a pending operation. Reopen this screen before adding cash.'); });
    refresh().catch(() => { if (mounted.current) setError('Could not load server data. Check your connection and database setup, then retry.'); });
    return () => { mounted.current = false; };
  }, [refresh, userId]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not complete the request. Check the connection and database setup, then retry.'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const saveCash = async () => {
    const input = pending ?? { requestId: randomUUID(), portfolioId, kind, currency,
      amount: decimalAmount(amount), date: operationDate(date) };
    setPending(input);
    await deviceStorage.setItem(pendingCashKey(userId), JSON.stringify(input));
    try { await addCashEntry(input); }
    catch (failure) {
      // P0001 is a confirmed rejection raised by our SQL function, not a lost response.
      if (failure && typeof failure === 'object' && 'code' in failure && failure.code === 'P0001') {
        await deviceStorage.removeItem(pendingCashKey(userId));
        if (mounted.current) setPending(null);
        throw new Error('Entry rejected. Check the date, portfolio and available cash. Future dates are not allowed.');
      }
      throw failure;
    }
    await deviceStorage.removeItem(pendingCashKey(userId));
    if (!mounted.current) return;
    setPending(null);
    setAmount('');
    await refresh();
  };
  return <>
    <Button title="Sign out" secondary disabled={busy} onPress={() => void run(async () => { const { error } = await requireSupabase().auth.signOut({ scope: 'local' }); if (error) throw error; })} />
    {error ? <Text accessibilityRole="alert" style={s.muted}>{error}</Text> : null}
    <Button title={busy ? 'Please wait…' : 'Refresh server data'} secondary disabled={busy} onPress={() => void run(refresh)} />
    {!data ? <Text style={s.muted}>Server data has not loaded.</Text> : <>
      <View style={s.card}><Text style={s.heading}>Your portfolios</Text>
        {!data.portfolios.length && <Text style={s.muted}>No portfolios yet. Create your first one below.</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{data.portfolios.map(p => <Chip key={p.id} title={p.name} active={p.id === portfolioId} onPress={() => { if (!busy && !pending) setPortfolioId(p.id); }} />)}</View>
        <TextInput accessibilityLabel="Portfolio name" placeholder="Portfolio name" placeholderTextColor={colors.muted} style={s.input} value={name} onChangeText={setName} maxLength={80} editable={!busy} />
        <Button title="Create portfolio" disabled={busy || !name.trim()} onPress={() => void run(async () => { await createPortfolio(name); if (mounted.current) setName(''); await refresh(); })} />
      </View>
      {portfolioId && <View style={s.card}><Text style={s.heading}>Record cash movement</Text>
        <Text style={s.muted}>Saved to your account. This pilot records deposits and withdrawals only; it does not calculate investment returns.</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>{(['deposit', 'withdrawal'] as const).map(value => <Chip key={value} title={value === 'deposit' ? 'Deposit' : 'Withdrawal'} active={kind === value} onPress={() => { if (!busy && !pending) setKind(value); }} />)}</View>
        <TextInput accessibilityLabel="Currency code" style={s.input} value={currency} onChangeText={value => setCurrency(value.toUpperCase())} autoCapitalize="characters" maxLength={3} editable={!busy && !pending} />
        <TextInput accessibilityLabel="Amount" placeholder="Amount" placeholderTextColor={colors.muted} style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy && !pending} />
        <TextInput accessibilityLabel="Operation date, YYYY-MM-DD" placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={s.input} value={date} onChangeText={setDate} maxLength={10} editable={!busy && !pending} />
        <Button title={pending ? 'Retry pending operation' : 'Save cash movement'} disabled={busy || !pendingReady || !amount || !date || !/^[A-Z]{3}$/.test(currency)} onPress={() => void run(saveCash)} />
      </View>}
      <View style={s.card}><Text style={s.heading}>Latest cash movements</Text><Text style={s.muted}>Up to 100 latest entries across your portfolios. Amounts remain in their original currencies.</Text>
        {!data.entries.length && <Text style={s.muted}>No saved cash movements.</Text>}
        {data.entries.map(entry => <View key={entry.id}><Text style={s.text}>{entry.kind === 'deposit' ? '+' : '−'}{entry.amount} {entry.currency}</Text><Text style={s.muted}>{entry.occurred_on} · {data.portfolios.find(p => p.id === entry.portfolio_id)?.name}</Text></View>)}
      </View>
    </>}
  </>;
}
