import { Text, View } from 'react-native';
import { Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
export default function Asset() {
  const { styles: s } = useTheme();
  return <Screen title="Asset details" controls={false}><View style={s.card}><Text style={s.heading}>Asset unavailable</Text><Text style={s.muted}>Server holdings are not connected yet.</Text></View></Screen>;
}
