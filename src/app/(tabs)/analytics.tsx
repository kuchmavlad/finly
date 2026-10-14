import { Text, View } from 'react-native';
import { usePortfolio } from '../../state/PortfolioContext';
import { convert, summarize } from '../../domain/ledger';
import { INDEX_SAMPLE, RETURN_SAMPLES } from '../../domain/history';
import { Chart } from '../../ui/Chart';
import { DataGate, DemoNote, Empty, Notice, Screen } from '../../ui/components';
import { colors, styles as s } from '../../ui/theme';
import { money, percent } from '../../ui/format';

export default function Analytics() {
  const { data, scope, currency } = usePortfolio();
  const summary = data ? summarize(data, scope, currency) : null;
  const samples = RETURN_SAMPLES[scope];
  const categories = new Map<string, { value: number; color: string }>();
  summary?.positions.forEach(p => { const old = categories.get(p.asset.kind); categories.set(p.asset.kind, { value: (old?.value ?? 0) + (p.valueMinor ?? 0), color: old?.color ?? p.asset.color }); });
  if (summary) categories.set('Cash', { value: convert(summary.cash.USD, 'USD', currency) + convert(summary.cash.UAH, 'UAH', currency), color: '#718478' });
  const empty = data && !data.operations.some(o => scope === 'all' || o.portfolioId === scope);
  return <Screen title="Analytics" subtitle="See the bigger picture."><DataGate>{summary && (empty ? <Empty /> : <>
    {!summary.missingPrices && <View style={s.card}><Text style={s.heading}>Asset allocation</Text><View style={{ flexDirection: 'row', height: 14, borderRadius: 8, overflow: 'hidden', gap: 3 }}>{[...categories].filter(([, c]) => c.value > 0).map(([name, c]) => <View key={name} style={{ flex: c.value, backgroundColor: c.color }} />)}</View>{[...categories].filter(([, c]) => c.value > 0).map(([name, c]) => <View key={name} style={s.row}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} /><Text style={[s.muted, { flex: 1 }]}>{name}</Text><Text style={s.text}>{(summary.valueMinor ? c.value / summary.valueMinor * 100 : 0).toFixed(1)}%</Text></View>)}</View>}
    <View style={s.card}><Text style={s.heading}>What makes up your result</Text>{[['Realized gain', summary.realizedMinor], ['Unrealized gain', summary.missingPrices ? null : summary.unrealizedMinor], ['Dividends & coupons', summary.incomeMinor], ['Fees', -summary.feesMinor]] .map(([label, amount]) => <View key={String(label)} style={s.row}><Text style={[s.muted, { flex: 1 }]}>{label}</Text><Text style={[s.text, { color: amount === null ? colors.muted : Number(amount) < 0 ? colors.red : colors.mint }]}>{amount === null ? 'Unavailable' : money(Number(amount), currency)}</Text></View>)}<DemoNote>Demo accounting · Average cost · Fees expensed separately</DemoNote></View>
    <View style={{ gap: 16 }}><View style={s.row}><Text style={s.heading}>Portfolio vs. S&P 500</Text><Text style={[s.eyebrow, { color: colors.gold, fontSize: 9 }]}>SAMPLE</Text></View><Text style={s.muted}>Jan 1 – Oct 13, 2026 · Cumulative total return</Text><View style={s.row}><View><Text style={[s.eyebrow, { color: colors.mint }]}>Portfolio</Text><Text style={[s.title, { fontSize: 28, marginTop: 5, color: colors.mint }]}>{percent(samples[9])}</Text></View><View style={{ alignItems: 'flex-end' }}><Text style={[s.eyebrow, { color: colors.lavender }]}>S&P 500 TR</Text><Text style={[s.title, { fontSize: 28, marginTop: 5, color: colors.lavender }]}>{percent(INDEX_SAMPLE[9])}</Text></View></View><Chart values={samples} comparison={INDEX_SAMPLE} accessibilityLabel={`Illustrative return curves: portfolio ${percent(samples[9])}, S&P 500 total return ${percent(INDEX_SAMPLE[9])}`} /><DemoNote>Illustrative curves, not calculated returns or actual index data. Same period; reinvested income assumed. Fixed demo FX means USD/UAH curves match. Manual entries do not change this illustration.</DemoNote></View>
    <View style={s.card}><Text style={s.eyebrow}>Annualized return · XIRR</Text><Text style={[s.title, { color: colors.muted }]}>Coming next</Text><Text style={s.muted}>Date-aware personal return and verified TWR comparisons will arrive with the calculation engine.</Text></View>
    <Notice text="Demo valuations only. Inzhur and OVGZ use manual estimates; check each asset’s valuation date." />
  </>)}</DataGate></Screen>;
}
