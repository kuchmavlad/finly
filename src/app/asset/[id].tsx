import { ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { usePortfolio } from '../../state/PortfolioContext';
import { summarize, unitValue } from '../../domain/ledger';
import { Button, DataGate, DemoNote, OperationRow, Notice } from '../../ui/components';
import { colors, styles as s } from '../../ui/theme';
import { dateLabel, money } from '../../ui/format';

export default function AssetDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, currency } = usePortfolio();
  const asset = data?.assets.find(a => a.id === id);
  const position = data && asset ? summarize(data, asset.portfolioId, currency).positions.find(p => p.asset.id === asset.id) : undefined;
  if (!data) return <View style={[s.screen, { padding: 24 }]}><DataGate>{null}</DataGate></View>;
  if (!asset) return <View style={[s.screen, { padding: 24 }]}><Text style={s.heading}>Asset not found</Text><Button title="Back to holdings" onPress={() => router.replace('/holdings')} /></View>;
  const price = unitValue(asset);
  const old = data && (Date.parse(data.asOf) - Date.parse(asset.priceDate)) / 86400000 > 7;
  return <ScrollView style={s.screen} contentContainerStyle={s.content}><DataGate>
    <View style={{ gap: 10 }}><Text style={[s.eyebrow, { color: asset.color }]}>{asset.kind} · {asset.currency}</Text><Text style={s.title}>{asset.symbol}</Text><Text style={s.muted}>{asset.name}</Text></View>
    <View style={s.card}><Text style={s.eyebrow}>Your position</Text><Text style={s.title}>{position?.valueMinor == null ? position ? 'Unavailable' : money(0, currency) : money(position.valueMinor, currency)}</Text><View style={s.row}><Text style={s.muted}>Units held</Text><Text style={s.text}>{position?.quantity ?? 0}</Text></View><View style={s.row}><Text style={s.muted}>Cost basis</Text><Text style={s.text}>{money(position?.costMinor ?? 0, currency)}</Text></View><View style={s.row}><Text style={s.muted}>Unrealized gain</Text><Text style={[s.text, { color: (position?.valueMinor ?? 0) >= (position?.costMinor ?? 0) ? colors.mint : colors.red }]}>{position?.valueMinor == null ? '—' : money(position.valueMinor - position.costMinor, currency)}</Text></View></View>
    <View style={{ gap: 12 }}><Text style={s.heading}>{asset.bond ? 'Settlement value per bond' : 'Last valuation per unit'}</Text><Text style={[s.title, { fontSize: 28 }]}>{price === null ? 'No price available' : money(price, asset.currency)}</Text><Text style={s.muted}>Demo estimate · {dateLabel(asset.priceDate)}</Text>{old && <Notice text="This estimate is more than 7 days old. Portfolio totals use this last available value." />}</View>
    {asset.bond && <View style={s.card}><Text style={s.heading}>Bond terms</Text>{[
      ['Face value', money(asset.bond.faceMinor, asset.currency)], ['Clean price', `${(asset.bond.cleanPriceBps / 100).toFixed(2)}% of face`], ['Accrued interest / bond', money(asset.bond.accruedMinor, asset.currency)], ['Annual coupon', `${(asset.bond.couponBps / 100).toFixed(2)}%`], ['Coupon schedule', asset.bond.frequency], ['Maturity', dateLabel(asset.bond.maturity)],
    ].map(([label, value]) => <View key={label} style={s.row}><Text style={[s.muted, { flex: 1 }]}>{label}</Text><Text style={[s.text, { textAlign: 'right', flex: 1 }]}>{value}</Text></View>)}<DemoNote>Settlement value = clean price × face value + accrued interest. These are fictional terms. No yield-to-maturity or accrual engine is implemented.</DemoNote></View>}
    <Button title="Add operation for this asset" onPress={() => router.push({ pathname: '/add-operation', params: { assetId: asset.id } })} />
    <View><Text style={s.heading}>Related activity</Text>{data?.operations.filter(o => o.assetId === asset.id).slice().sort((a, b) => b.date.localeCompare(a.date)).map(o => <OperationRow key={o.id} operation={o} />)}</View><DemoNote />
  </DataGate></ScrollView>;
}
