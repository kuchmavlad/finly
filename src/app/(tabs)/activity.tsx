import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { usePortfolio } from '../../state/PortfolioContext';
import { Button, Chip, DataGate, DemoNote, Empty, OperationRow, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';

export default function Activity() {
  const { styles: s } = useTheme();
  const { data, scope } = usePortfolio();
  const [filter, setFilter] = useState('All');
  const operations = data?.operations.filter(o => (scope === 'all' || o.portfolioId === scope) && (filter === 'All' || filter === 'Income' && ['dividend', 'coupon'].includes(o.kind) || filter === 'Trades' && ['buy', 'sell'].includes(o.kind) || filter === 'Cash' && ['deposit', 'withdrawal', 'fee'].includes(o.kind))).slice().sort((a, b) => b.date.localeCompare(a.date)) ?? [];
  return <Screen title="Activity" subtitle="The story behind your portfolio."><DataGate><Button title="＋ Add operation" onPress={() => router.push('/add-operation')} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{['All', 'Trades', 'Income', 'Cash'].map(type => <Chip key={type} title={type} active={filter === type} onPress={() => setFilter(type)} />)}</ScrollView><View><Text style={s.eyebrow}>{operations.length} operations · Original currencies</Text>{operations.map(o => <OperationRow key={o.id} operation={o} />)}{operations.length === 0 && <Empty title="No operations to show" text="Try a different filter or add a demo operation." />}</View><DemoNote>Demo imports and manual entries are labelled separately. New entries last until the app reloads.</DemoNote></DataGate></Screen>;
}
