import { useMemo } from 'react';
import { useChartSelection } from '../../state/ChartSelectionContext';
import { Text, View } from 'react-native';
import { usePortfolio } from '../../state/PortfolioContext';
import { convert, summarize } from '../../domain/ledger';
import { HISTORY_DATES, INDEX_SAMPLE, RETURN_SAMPLES } from '../../domain/history';
import { Chart } from '../../ui/Chart';
import { DataGate, DemoNote, Empty, Notice, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { dateLabel, money, percent } from '../../ui/format';

export default function Analytics() {
  const { colors, styles: s } = useTheme();
  const { data, scope, currency } = usePortfolio();
  const summary = data ? summarize(data, scope, currency) : null;
  const samples = RETURN_SAMPLES[scope];
  const points = useMemo(() => samples.map((amount, i) => ({ date: HISTORY_DATES[i], amount, comparison: INDEX_SAMPLE[i] })), [samples]);
  const [selected, setSelected] = useChartSelection('analytics', `${scope}:${currency}:${JSON.stringify(data)}`);
  const shown = points[selected ?? points.length - 1];
  const categories = new Map<string, { valueMinor: number; color: string }>();
  summary?.positions.forEach(p => { const old = categories.get(p.asset.kind); categories.set(p.asset.kind, { valueMinor: (old?.valueMinor ?? 0) + (p.valueMinor ?? 0), color: old?.color ?? p.asset.color }); });
  if (summary) categories.set('Cash', { valueMinor: convert(summary.cash.USD, 'USD', currency) + convert(summary.cash.UAH, 'UAH', currency), color: colors.cash });
  const empty = data && !data.operations.some(o => scope === 'all' || o.portfolioId === scope);
  return <Screen title="Analytics" subtitle="See the bigger picture."><DataGate>{summary && (empty ? <Empty /> : <>
    {!summary.missingPrices && <View style={s.card}><Text style={s.heading}>Asset allocation</Text><View style={{ flexDirection: 'row', height: 14, borderRadius: 8, overflow: 'hidden', gap: 3 }}>{[...categories].filter(([, c]) => c.valueMinor > 0).map(([name, c]) => <View key={name} style={{ flex: c.valueMinor, backgroundColor: c.color }} />)}</View>{[...categories].filter(([, c]) => c.valueMinor > 0).map(([name, c]) => <View key={name} style={s.row}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} /><Text style={[s.muted, { flex: 1 }]}>{name}</Text><Text style={s.text}>{(summary.valueMinor ? c.valueMinor / summary.valueMinor * 100 : 0).toFixed(1)}%</Text></View>)}</View>}
    <View style={s.card}><Text style={s.heading}>What makes up your result</Text>{[['Realized gain', summary.realizedMinor], ['Unrealized gain', summary.missingPrices ? null : summary.unrealizedMinor], ['Dividends & coupons', summary.incomeMinor], ['Fees', -summary.feesMinor]] .map(([label, amount]) => <View key={String(label)} style={s.row}><Text style={[s.muted, { flex: 1 }]}>{label}</Text><Text style={[s.text, { color: amount === null ? colors.muted : Number(amount) < 0 ? colors.negative : colors.positive }]}>{amount === null ? 'Unavailable' : money(Number(amount), currency)}</Text></View>)}<DemoNote>Demo accounting · Average cost · Fees expensed separately</DemoNote></View>
    <View style={{ gap: 16 }}><View style={s.row}><Text style={s.heading}>Portfolio vs. S&P 500</Text><Text style={[s.eyebrow, { color: colors.warning, fontSize: 9 }]}>SAMPLE</Text></View><Text style={s.muted}>{selected === null ? 'Jan 1 – Oct 13, 2026 · Cumulative total return' : `${dateLabel(shown.date)} · Since Jan 1, 2026`}</Text><View style={s.row}><View><Text style={[s.eyebrow, { color: colors.accent }]}>Portfolio</Text><Text style={[s.title, { fontSize: 28, marginTop: 5, color: colors.accent }]}>{percent(shown.amount)}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={[s.eyebrow, { color: colors.comparison }]}>S&P 500 TR</Text><Text style={[s.title, { fontSize: 28, marginTop: 5, color: colors.comparison }]}>{percent(shown.comparison)}</Text></View></View><Chart points={points} display={{ kind: 'percent' }} selected={selected} setSelected={setSelected} accessibilityLabel={`Illustrative return curves: portfolio ${percent(shown.amount)}, S&P 500 total return ${percent(shown.comparison)}`} /><DemoNote>Illustrative curves, not calculated returns or actual index data. Same period; reinvested income assumed. Fixed demo FX means USD/UAH curves match. Manual entries do not change this illustration.</DemoNote></View>
    <View style={s.card}><Text style={s.eyebrow}>Annualized return · XIRR</Text><Text style={[s.title, { color: colors.muted }]}>Coming next</Text><Text style={s.muted}>Date-aware personal return and verified TWR comparisons will arrive with the calculation engine.</Text></View>
    <Notice text="Demo valuations only. Inzhur and OVGZ use manual estimates; check each asset’s valuation date." />
  </>)}</DataGate></Screen>;
}
