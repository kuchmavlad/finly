import { FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { usePortfolio } from '../../state/PortfolioContext';
import { Button, Chip, DataGate, EmptyPortfolios, Notice, PendingNotice, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { exactAmount, type CashFilter } from '../../domain/account';

export default function Activity() {
  const { styles: s } = useTheme();
  const { portfolios, entries, filter, hasMore, loading, loadingMore, pageError, store } = usePortfolio();
  return <Screen title="Activity" subtitle="Saved cash movements · Original currencies" scroll={false}>
    <FlatList data={entries ?? []} keyExtractor={entry => entry.id} contentContainerStyle={s.content}
      refreshing={loading} onRefresh={() => void store.refresh()}
      ListHeaderComponent={<><DataGate needs="entries">{!portfolios?.length && <EmptyPortfolios />}</DataGate>
        {!!portfolios?.length && <Button title="Record cash movement" onPress={() => router.push('/add-operation')} />}
        <PendingNotice /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 16 }}>
          {(['all', 'deposit', 'withdrawal'] as CashFilter[]).map(value => <Chip key={value} title={value === 'all' ? 'All' : value === 'deposit' ? 'Deposits' : 'Withdrawals'} active={filter === value} onPress={() => store.setFilter(value)} />)}
        </View></>}
      ListEmptyComponent={entries !== null && !!portfolios?.length ? <Text style={s.muted}>No cash movements match this selection.</Text> : null}
      renderItem={({ item }) => <View style={[s.card, { gap: 6 }]}><Text style={s.text}>{item.kind === 'deposit' ? 'Deposit' : 'Withdrawal'}</Text><Text selectable style={[s.heading, { fontVariant: ['tabular-nums'] }]}>{item.kind === 'deposit' ? '+' : '−'}{exactAmount(item.amount)} {item.currency}</Text><Text style={s.muted}>{item.occurred_on} · {portfolios?.find(p => p.id === item.portfolio_id)?.name} · Manual</Text></View>}
      ListFooterComponent={<>{pageError ? <Notice text={pageError} /> : null}{hasMore && <Button title={loadingMore ? 'Loading…' : 'Load more'} secondary disabled={loading || loadingMore} onPress={() => void store.loadMore()} />}</>}
    />
  </Screen>;
}
