export type ChartPoint = { date: string; amount: number; comparison?: number };

export function axisLabels(ticks: number[], kind: 'money' | 'percent'): string[] {
  for (let digits = 0; digits <= 8; digits++) {
    const formatter = new Intl.NumberFormat('en-US', { notation: kind === 'money' ? 'compact' : 'standard', maximumFractionDigits: digits });
    const labels = ticks.map(tick => formatter.format(kind === 'money' ? tick / 100 : tick) + (kind === 'percent' ? '%' : ''));
    if (new Set(labels).size === ticks.length) return labels;
  }
  return ticks.map(tick => kind === 'money' ? String(tick / 100) : `${tick}%`);
}

export function chartScale(values: number[]) {
  const finite = values.filter(Number.isFinite);
  let min = finite.length ? Math.min(...finite) : 0;
  let max = finite.length ? Math.max(...finite) : 1;
  const padding = max === min ? Math.max(Math.abs(min) * 0.1, 1) : (max - min) * 0.1;
  min -= padding;
  max += padding;
  const raw = (max - min) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(n => n * magnitude).find(n => n >= raw) ?? magnitude * 10;
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
  return { min, max, ticks };
}

export function pointFraction(points: ChartPoint[], index: number) {
  if (points.length < 2) return 0.5;
  const first = Date.parse(points[0].date);
  const span = Date.parse(points[points.length - 1].date) - first;
  return span > 0 ? (Date.parse(points[index].date) - first) / span : index / (points.length - 1);
}

export function nearestPoint(points: ChartPoint[], fraction: number): number | null {
  if (!points.length) return null;
  let nearest = 0;
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(pointFraction(points, i) - fraction) < Math.abs(pointFraction(points, nearest) - fraction)) nearest = i;
  }
  return nearest;
}
