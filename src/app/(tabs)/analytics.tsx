import { Text, View } from 'react-native';
import { usePortfolio } from '../../state/PortfolioContext';
import { DataGate, EmptyPortfolios, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
export default function Analytics() {
  const { styles: s } = useTheme();
  const { portfolios } = usePortfolio();
  return <Screen title="Analytics"><DataGate needs="portfolios">{!portfolios?.length ? <EmptyPortfolios /> : <View style={s.card}><Text style={s.heading}>Investment analytics are not available yet</Text><Text style={s.muted}>Returns, allocation and index comparisons need holdings, valuations and a verified calculation method. Cash deposits and withdrawals alone cannot measure investment performance.</Text></View>}</DataGate></Screen>;
}
