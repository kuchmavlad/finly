import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { usePortfolio } from '../../state/PortfolioContext';
import { summarize } from '../../domain/ledger';
import { valueHistory } from '../../domain/history';
import { Chart } from '../../ui/Chart';
import { Chip, DataGate, DemoNote, Empty, HoldingRow, Screen } from '../../ui/components';
import { colors, styles as s } from '../../ui/theme';
import { money, percent } from '../../ui/format';

export default function Overview() {
  const { data, scope, currency } = usePortfolio();
  const [period, setPeriod] = useState<'3M' | '6M' | 'YTD'>('YTD');
  const summary = data ? summarize(data, scope, currency) : null;
  const empty = data && !data.operations.some(o => scope === 'all' || o.portfolioId === scope);
  const history = data ? valueHistory(data, scope, currency) : [];
  const values = period === '3M' ? history.slice(-4) : period === '6M' ? history.slice(-7) : history;
  return <Screen title="Finly" subtitle="A little clarity. A bigger picture."><DataGate>{summary && (empty ? <Empty /> : <>
    <View style={{ gap: 10 }}><View style={s.row}><Text style={s.eyebrow}>{summary.missingPrices ? 'Known value · partial' : 'Portfolio value'}</Text><View style={{ backgroundColor: colors.elevated, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 }}><Text style={[s.eyebrow, { color: colors.mint, fontSize: 9 }]}>DEMO</Text></View></View><Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.text, fontSize: 44, fontWeight: '500', letterSpacing: -1.8 }}>{money(summary.valueMinor, currency)}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ color: summary.profitMinor >= 0 ? colors.mint : colors.red, fontWeight: '600', fontSize: 14 }}>{summary.missingPrices ? 'Profit unavailable' : `${summary.profitMinor >= 0 ? '+' : ''}${money(summary.profitMinor, currency)}  (${percent(summary.netContributionsMinor > 0 ? summary.profitMinor / summary.netContributionsMinor * 100 : 0)})`}</Text></View><Text style={[s.muted, { fontSize: 11 }]}>Since inception · Simple gain on net contributions</Text></View>
    {!summary.missingPrices && <View style={{ gap: 12 }}><Chart values={values} labels={period === '3M' ? ['JUL', 'AUG', 'SEP', 'OCT'] : period === '6M' ? ['APR', 'JUN', 'AUG', 'OCT'] : undefined} accessibilityLabel={`Illustrative portfolio value history, ending at ${money(summary.valueMinor, currency)}`} /><View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>{(['3M', '6M', 'YTD'] as const).map(p => <Chip key={p} title={p} active={period === p} onPress={() => setPeriod(p)} />)}</View><DemoNote>Value history · Includes deposits and withdrawals · Synthetic prices</DemoNote></View>}
    <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-between' }]}><View style={{ gap: 5, flex: 1 }}><Text style={s.eyebrow}>Net invested</Text><Text style={[s.text, { fontSize: 18 }]}>{money(summary.netContributionsMinor, currency, true)}</Text></View><View style={{ width: 1, backgroundColor: colors.line }} /><View style={{ gap: 5, flex: 1, alignItems: 'flex-end' }}><Text style={s.eyebrow}>Income received</Text><Text style={[s.text, { fontSize: 18, color: colors.mint }]}>{money(summary.incomeMinor, currency, true)}</Text></View></View>
    <View><View style={s.row}><Text style={s.heading}>Your investments</Text><Pressable accessibilityRole="button" onPress={() => router.push('/holdings')} style={{ paddingVertical: 12 }}><Text style={{ color: colors.mint, fontSize: 12 }}>View all →</Text></Pressable></View>{summary.positions.slice(0, 3).map(p => <HoldingRow key={p.asset.id} position={p} />)}{summary.positions.length === 0 && <Text style={s.muted}>Your portfolio currently holds cash.</Text>}</View>
    <DemoNote />
  </>)}</DataGate></Screen>;
}
