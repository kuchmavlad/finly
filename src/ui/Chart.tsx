import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Path, Line, Circle, Text as SvgText } from 'react-native-svg';
import { useTheme } from './theme';
import { axisLabels, chartScale, nearestPoint, pointFraction, type ChartPoint } from './chartMath';
import { dateLabel, money, percent } from './format';
import type { Currency } from '../domain/models';

type ChartProps = {
  points: ChartPoint[];
  display: { kind: 'money'; currency: Currency } | { kind: 'percent' };
  selected: number | null;
  setSelected: Dispatch<SetStateAction<number | null>>;
  accessibilityLabel: string;
};
const LEFT = 74, RIGHT = 310, TOP = 14, BOTTOM = 160, WIDTH = 320;

export function Chart({ points, display, accessibilityLabel, selected, setSelected }: ChartProps) {
  const { colors, styles: s } = useTheme();
  const [width, setWidth] = useState(WIDTH);
  const [left, setLeft] = useState(0);
  const plot = useRef<View>(null);
  const scale = chartScale(points.flatMap(p => p.comparison === undefined ? [p.amount] : [p.amount, p.comparison]));
  const x = (i: number) => LEFT + pointFraction(points, i) * (RIGHT - LEFT);
  const y = (amount: number) => BOTTOM - (amount - scale.min) / (scale.max - scale.min) * (BOTTOM - TOP);
  const selectAt = useCallback((pageX: number, toggle = false) => {
    const index = nearestPoint(points, ((pageX - left) / width * WIDTH - LEFT) / (RIGHT - LEFT));
    setSelected(previous => toggle && previous === index ? null : index);
  }, [points, width, left, setSelected]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderGrant: event => selectAt(event.nativeEvent.pageX),
    onPanResponderMove: event => selectAt(event.nativeEvent.pageX),
    onPanResponderTerminationRequest: () => true,
  }), [selectAt]);
  const format = (amount: number) => display.kind === 'money' ? money(amount, display.currency) : percent(amount);
  const tickLabels = axisLabels(scale.ticks, display.kind);
  const path = (comparison = false) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(comparison ? p.comparison! : p.amount)}`).join(' ');
  const hasComparison = points.length > 0 && points.every(p => p.comparison !== undefined);
  const current = selected === null ? null : points[selected];
  const description = current ? `${dateLabel(current.date)}. Portfolio ${format(current.amount)}${current.comparison === undefined ? '' : `. S&P 500 TR ${format(current.comparison)}`}` : 'Touch the chart to inspect a date.';
  const labelIndices = useMemo(() => [...new Set(Array.from({ length: Math.min(4, points.length) }, (_, i) => Math.round(i * (points.length - 1) / Math.max(1, Math.min(4, points.length) - 1))))], [points.length]);
  const stepSelection = (direction: number) => setSelected(i => Math.max(0, Math.min(points.length - 1, (i ?? (direction > 0 ? -1 : points.length)) + direction)));
  if (!points.length) return <View style={s.card}><Text style={s.muted}>No chart data available.</Text></View>;

  return <View style={{ gap: 8 }}>
    <View ref={plot} {...responder.panHandlers} onLayout={event => { setWidth(event.nativeEvent.layout.width); plot.current?.measureInWindow(x => setLeft(x)); }}>
      <Pressable onPress={event => selectAt(event.nativeEvent.pageX, true)}
      accessible accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: points.length - 1, now: selected ?? 0, text: description }}
      accessibilityHint="Swipe up or down to select a date. Activate to return to the latest result."
      accessibilityActions={[{ name: 'increment', label: 'Next date' }, { name: 'decrement', label: 'Previous date' }, { name: 'activate', label: 'Latest result' }]}
      onAccessibilityAction={event => event.nativeEvent.actionName === 'activate' ? setSelected(null) : stepSelection(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
      onLongPress={() => setSelected(null)}>
      <View pointerEvents="none"><Svg width="100%" height={width / WIDTH * 200} viewBox="0 0 320 200">
        <Defs><LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={colors.accent} stopOpacity="0.18" /><Stop offset="1" stopColor={colors.accent} stopOpacity="0" /></LinearGradient></Defs>
        {scale.ticks.map((tick, i) => <ViewlessTick key={tick} tick={tick} y={y(tick)} label={tickLabels[i]} line={colors.line} text={colors.muted} />)}
        {!hasComparison && points.length > 1 && <Path d={`${path()} L${x(points.length - 1)},${BOTTOM} L${x(0)},${BOTTOM} Z`} fill="url(#fill)" />}
        {hasComparison && <Path d={path(true)} stroke={colors.comparison} strokeWidth={2} fill="none" strokeDasharray="5 5" />}
        <Path d={path()} stroke={colors.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {points.length === 1 && <Circle cx={x(0)} cy={y(points[0].amount)} r={4} fill={colors.accent} />}
        {selected !== null && current && <>
          <Line x1={x(selected)} x2={x(selected)} y1={TOP} y2={BOTTOM} stroke={colors.muted} strokeDasharray="3 4" />
          <Circle cx={x(selected)} cy={y(current.amount)} r={5} fill={colors.accent} stroke={colors.bg} strokeWidth={2} />
          {current.comparison !== undefined && <Circle cx={x(selected)} cy={y(current.comparison)} r={5} fill={colors.comparison} stroke={colors.bg} strokeWidth={2} />}
        </>}
        {labelIndices.map(i => <SvgText key={i} x={x(i)} y={188} textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fill={colors.muted} fontSize={10}>{new Date(points[i].date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()}</SvgText>)}
      </Svg></View></Pressable>
    </View>
  </View>;
}

function ViewlessTick({ tick, y, label, line, text }: { tick: number; y: number; label: string; line: string; text: string }) {
  return <><Line x1={LEFT} x2={RIGHT} y1={y} y2={y} stroke={line} strokeDasharray={tick === 0 ? undefined : '3 5'} /><SvgText x={LEFT - 10} y={y + 3} textAnchor="end" fill={text} fontSize={10}>{label}</SvgText></>;
}
