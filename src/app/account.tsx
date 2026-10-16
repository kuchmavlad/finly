import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { usePortfolio } from '../state/PortfolioContext';
import { Button, DataGate, Notice, Screen } from '../ui/components';
import { useTheme } from '../ui/theme';
export default function Account() {
  const { styles: s, colors } = useTheme();
  const { portfolios, busy, mutationError, message, store } = usePortfolio();
  const [name, setName] = useState('');
  return <Screen title="Your portfolios" controls={false}><DataGate needs="portfolios">
    <View style={s.card}><Text style={s.heading}>Create portfolio</Text><Text style={s.muted}>Use a broker, bank or another place where you keep investments. Reusing an existing name selects that portfolio.</Text>
      <TextInput accessibilityLabel="Portfolio name" placeholder="Portfolio name" placeholderTextColor={colors.muted} style={s.input} value={name} onChangeText={setName} maxLength={80} editable={!busy} />
      <Button title={busy ? 'Saving…' : 'Create portfolio'} disabled={busy || !name.trim()} onPress={() => { void store.create(name).then(saved => { if (saved) setName(''); }); }} />
    </View>
    {mutationError ? <Notice text={mutationError} /> : null}{message ? <Text accessibilityRole="alert" style={s.muted}>{message}</Text> : null}
    {!portfolios?.length && <Text style={s.muted}>No portfolios yet. Create your first one above.</Text>}
    {portfolios?.map(p => <Button key={p.id} title={p.name} secondary onPress={() => { store.setScope(p.id); router.replace('/'); }} />)}
    {!!portfolios?.length && <Button title="Record cash movement" onPress={() => router.push('/add-operation')} />}
  </DataGate></Screen>;
}
