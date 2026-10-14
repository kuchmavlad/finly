import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { usePortfolio } from '../state/PortfolioContext';
import { Button, Chip, DemoNote } from '../ui/components';
import { useTheme } from '../ui/theme';
import type { DemoState } from '../domain/models';

export default function Settings() {
  const { styles: s } = useTheme();
  const { state, setState, reset, currency, setCurrency } = usePortfolio();
  const [confirmReset, setConfirmReset] = useState(false);
  return <ScrollView style={s.screen} contentContainerStyle={s.content}><View><Text style={s.title}>Make it yours.</Text><Text style={[s.muted, { marginTop: 8 }]}>Finly · Demo preview</Text></View>
    <View style={s.card}><Text style={s.heading}>Display currency</Text><View style={{ flexDirection: 'row', gap: 8 }}>{(['USD', 'UAH'] as const).map(c => <Chip key={c} title={c} active={currency === c} onPress={() => setCurrency(c)} />)}</View><DemoNote>Fixed illustrative FX: 1 USD = 42 UAH. Original operation currencies are preserved.</DemoNote></View>
    <View style={s.card}><Text style={s.heading}>Preview data states</Text><Text style={s.muted}>Choose a state, then return to a tab to inspect it.</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{([['ready', 'Normal'], ['loading', 'Loading'], ['error', 'Error'], ['stale', 'Old prices'], ['missing', 'Missing prices']] as [DemoState, string][]).map(([value, label]) => <Chip key={value} title={label} active={state === value} onPress={() => setState(value)} />)}</View><Text style={s.muted}>For an empty state, select New portfolio from the portfolio picker.</Text></View>
    <View style={s.card}><Text style={s.heading}>About this preview</Text><Text style={s.muted}>All prices, fund terms, bond terms and index curves are fictional. Demo entries live in memory and reset when the app reloads. There is no account connection or server yet.</Text><Text style={s.muted}>Demo accounting uses whole units and average cost. Fees are separate expenses. Taxes, corporate actions, transfers, FX conversions and bond amortization are not implemented.</Text><Text style={s.muted}>Annualized XIRR and verified TWR will be implemented in a later stage.</Text></View>
    {confirmReset ? <View style={s.card}><Text style={s.text}>Reset all demo entries?</Text><Text style={s.muted}>This removes the operations you added in this session and restores the original demo.</Text><Button title="Reset demo" onPress={() => { void reset(); setConfirmReset(false); }} /><Button title="Keep my entries" secondary onPress={() => setConfirmReset(false)} /></View> : <Button title="Reset demo data" secondary onPress={() => setConfirmReset(true)} />}
    <DemoNote />
  </ScrollView>;
}
