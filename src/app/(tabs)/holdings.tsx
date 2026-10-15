import { Text, View } from 'react-native';
import { usePortfolio } from '../../state/PortfolioContext';
import { DataGate, EmptyPortfolios, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
export default function Holdings() {
  const { styles: s } = useTheme();
  const { portfolios } = usePortfolio();
  return <Screen title="Holdings"><DataGate needs="portfolios">{!portfolios?.length ? <EmptyPortfolios /> : <View style={s.card}><Text style={s.heading}>Holdings are not connected yet</Text><Text style={s.muted}>Asset records, trades and market prices will be added in a later stage. Your recorded cash is available in Overview. No broker account is connected.</Text></View>}</DataGate></Screen>;
}
