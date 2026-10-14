import Svg, { Defs, LinearGradient, Stop, Path, Line, Circle } from 'react-native-svg';
import { Text, View } from 'react-native';
import { colors, styles as s } from './theme';
export function Chart({ values, comparison, labels = ['JAN', 'APR', 'JUL', 'OCT'], accessibilityLabel }: { values: number[]; comparison?: number[]; labels?: string[]; accessibilityLabel: string }) {
  const all = [...values, ...(comparison ?? [])];
  const min = Math.min(...all), max = Math.max(...all), range = max - min || 1;
  const point = (value: number, i: number, length: number) => ({ x: 4 + i / Math.max(1, length - 1) * 312, y: 155 - (value - min) / range * 125 });
  const path = (series: number[]) => series.map((v, i) => { const p = point(v, i, series.length); return `${i ? 'L' : 'M'}${p.x},${p.y}`; }).join(' ');
  const end = point(values[values.length - 1] ?? 0, values.length - 1, values.length);
  return <View accessible accessibilityLabel={accessibilityLabel}><Svg width="100%" height={190} viewBox="0 0 320 180">
    <Defs><LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={colors.mint} stopOpacity="0.18" /><Stop offset="1" stopColor={colors.mint} stopOpacity="0" /></LinearGradient></Defs>
    {[35, 95, 155].map(y => <Line key={y} x1={4} x2={316} y1={y} y2={y} stroke={colors.line} strokeDasharray="3 5" />)}
    {!comparison && <Path d={`${path(values)} L316,175 L4,175 Z`} fill="url(#fill)" />}
    {comparison && <Path d={path(comparison)} stroke={colors.lavender} strokeWidth={2} fill="none" strokeDasharray="5 5" />}
    <Path d={path(values)} stroke={colors.mint} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /><Circle cx={end.x} cy={end.y} r={4} fill={colors.mint} />
  </Svg><View style={s.row}>{labels.map((label, i) => <Text key={`${label}-${i}`} style={[s.eyebrow, { fontSize: 9 }]}>{label}</Text>)}</View></View>;
}
