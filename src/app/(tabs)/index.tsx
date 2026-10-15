import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { usePortfolio } from '../../state/PortfolioContext';
import { useChartSelection } from '../../state/ChartSelectionContext';
import { summarize } from '../../domain/ledger';
import { demoPerformanceHistory } from '../../domain/demoPerformance';
import { Chart } from '../../ui/Chart';
import { Chip, DataGate, DemoNote, Empty, HoldingRow, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { dateLabel, money, percent } from '../../ui/format';

export default function Overview() {
  const { colors, styles: s } = useTheme();
  const { data, scope, currency } = usePortfolio();
  const [period, setPeriod] = useState<'3M' | '6M' | 'YTD'>('YTD');
  const summary = data ? summarize(data, scope, currency) : null;
  const empty = data && !data.operations.some(o => scope === 'all' || o.portfolioId === scope);
  const history = useMemo(() => data ? demoPerformanceHistory(data, scope, currency) : [], [data, scope, currency]);
  const points = useMemo(() => {
    const window = period === '3M' ? history.slice(-4) : period === '6M' ? history.slice(-7) : history;
    return window.flatMap(p => p.returnPercent === null ? [] : [{ date: p.date, amount: p.returnPercent, profitMinor: p.profitMinor }]);
  }, [history, period]);
  const [selected, setSelected] = useChartSelection('overview', `${scope}:${currency}:${period}:${JSON.stringify(data)}`);
  const chosen = selected === null ? null : points[selected];
  const profit = chosen?.profitMinor ?? summary?.profitMinor ?? 0;
  const returnPercent = chosen?.amount ?? history.at(-1)?.returnPercent;

  return <Screen title="Finly" subtitle="A little clarity. A bigger picture."><DataGate>{summary && (empty ? <Empty /> : <>
    <View style={{ gap: 10 }}>
      <View style={s.row}>
        <Text style={s.eyebrow}>{summary.missingPrices ? 'Known value · partial' : 'Portfolio value'}</Text>
        <View style={{ backgroundColor: colors.elevated, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 }}><Text style={[s.eyebrow, { color: colors.accent, fontSize: 9 }]}>DEMO</Text></View>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.text, fontSize: 44, fontWeight: '500', letterSpacing: -1.8 }}>{money(summary.valueMinor, currency)}</Text>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: profit >= 0 ? colors.positive : colors.negative, fontWeight: '600', fontSize: 14 }}>{summary.missingPrices ? 'Profit unavailable' : `${profit >= 0 ? '+' : ''}${money(profit, currency)}`}</Text>
        {!summary.missingPrices && <Text style={{ color: returnPercent == null ? colors.muted : returnPercent >= 0 ? colors.positive : colors.negative, fontWeight: '600', fontSize: 14 }}>{returnPercent == null ? 'TWR unavailable' : `${percent(returnPercent)} TWR`}</Text>}
      </View>
      <Text style={[s.muted, { fontSize: 11 }]}>{chosen ? `${dateLabel(chosen.date)} · Since inception` : 'Since inception'} · Demo TWR</Text>
    </View>
    {!summary.missingPrices && <View style={{ gap: 12 }}>
      <Chart points={points} display={{ kind: 'percent' }} selected={selected} setSelected={setSelected} accessibilityLabel="Demo time-weighted return. Select a date to read its return." />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>{(['3M', '6M', 'YTD'] as const).map(p => <Chip key={p} title={p} active={period === p} onPress={() => setPeriod(p)} />)}</View>
      <DemoNote>Demo TWR · Synthetic prices · Deposits and withdrawals excluded from return. Tap a point again to show the latest result.</DemoNote>
    </View>}
    <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-between' }]}><View style={{ gap: 5, flex: 1 }}><Text style={s.eyebrow}>Net invested</Text><Text style={[s.text, { fontSize: 18 }]}>{money(summary.netContributionsMinor, currency, true)}</Text></View><View style={{ width: 1, backgroundColor: colors.line }} /><View style={{ gap: 5, flex: 1, alignItems: 'flex-end' }}><Text style={s.eyebrow}>Income received</Text><Text style={[s.text, { fontSize: 18, color: colors.positive }]}>{money(summary.incomeMinor, currency, true)}</Text></View></View>
    <View><View style={s.row}><Text style={s.heading}>Your investments</Text><Pressable accessibilityRole="button" onPress={() => router.push('/holdings')} style={{ paddingVertical: 12 }}><Text style={{ color: colors.accent, fontSize: 12 }}>View all →</Text></Pressable></View>{summary.positions.slice(0, 3).map(p => <HoldingRow key={p.asset.id} position={p} />)}{summary.positions.length === 0 && <Text style={s.muted}>Your portfolio currently holds cash.</Text>}</View>
    <DemoNote />
  </>)}</DataGate></Screen>;
}
