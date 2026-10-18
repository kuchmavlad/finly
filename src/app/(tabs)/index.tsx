import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { usePortfolio } from '../../state/PortfolioContext';
import { Button, DataGate, EmptyPortfolios, PendingNotice, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { exactAmount } from '../../domain/account';

export default function Overview() {
  const { styles: s } = useTheme();
  const { portfolios, balances, store, loading } = usePortfolio();
  return <Screen title="Overview" subtitle="Your recorded cash, in its original currencies."><DataGate>
    {!portfolios?.length ? <EmptyPortfolios /> : <>
      <View style={s.card}><Text style={s.heading}>Recorded cash balances</Text>
        <Text style={s.muted}>Deposits minus withdrawals. These balances do not include investments or broker activity.</Text>
        {balances?.length ? balances.map(balance => <View key={balance.currency} style={{ gap: 6 }}><Text style={s.eyebrow}>{balance.currency}</Text><Text selectable style={[s.heading, { fontVariant: ['tabular-nums'] }]}>{exactAmount(balance.amount)}</Text></View>) : <Text style={s.muted}>No manual cash movements. Imported broker operations are shown in the IBKR journal.</Text>}
      </View>
      <Button title="Record cash movement" onPress={() => router.push('/add-operation')} />
      <View style={s.card}><Text style={s.heading}>Investment performance</Text><Text style={s.muted}>Not available yet. Holdings, valuations and verified return calculations are not connected. Deposits are not investment profit.</Text></View>
    </>}
    <PendingNotice />
    <Button title="Refresh" secondary disabled={loading} onPress={() => void store.refresh()} />
  </DataGate></Screen>;
}
