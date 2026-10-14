import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { usePortfolio } from '../../state/PortfolioContext';
import { summarize } from '../../domain/ledger';
import { Chip, DataGate, DemoNote, Empty, HoldingRow, Screen } from '../../ui/components';
import { styles as s } from '../../ui/theme';
import { money } from '../../ui/format';

export default function Holdings() {
  const { data, scope, currency } = usePortfolio();
  const [filter, setFilter] = useState('All');
  const summary = data ? summarize(data, scope, currency) : null;
  const positions = summary?.positions.filter(p => filter === 'All' || p.asset.kind === filter) ?? [];
  return <Screen title="Holdings" subtitle="Every asset, in its place."><DataGate>{summary && <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{['All', 'Stock', 'ETF', 'Bond', 'OVGZ', 'Fund'].map(type => <Chip key={type} title={type} active={filter === type} onPress={() => setFilter(type)} />)}</ScrollView>
    <View><View style={s.row}><Text style={s.eyebrow}>{positions.length} investments</Text><Text style={s.eyebrow}>Value / unrealized</Text></View>{positions.map(p => <HoldingRow key={p.asset.id} position={p} />)}{positions.length === 0 && <Empty title="No holdings here yet" text={filter === 'All' ? 'Add a demo deposit, then buy an available asset.' : 'Try another asset category or portfolio.'} />}</View>
    <View style={s.card}><Text style={s.heading}>Cash balances</Text><View style={s.row}><Text style={s.muted}>US dollar</Text><Text style={s.text}>{money(summary.cash.USD, 'USD')}</Text></View><View style={s.row}><Text style={s.muted}>Ukrainian hryvnia</Text><Text style={s.text}>{money(summary.cash.UAH, 'UAH')}</Text></View><DemoNote>Original currencies · Cash is included in portfolio value.</DemoNote></View><DemoNote />
  </>}</DataGate></Screen>;
}
