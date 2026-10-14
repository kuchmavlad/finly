import assert from 'node:assert/strict';
import test from 'node:test';
import { axisLabels, chartScale, nearestPoint, pointFraction } from '../src/ui/chartMath.ts';
import { HISTORY_DATES, valueHistory } from '../src/domain/history.ts';
import { seed } from '../src/data/demo.ts';

test('chart scale contains negative and positive values and readable ordered ticks', () => {
  const scale = chartScale([-2.1, 0, 14.4]);
  assert.ok(scale.min <= -2.1 && scale.max >= 14.4);
  assert.ok(scale.ticks.includes(0));
  assert.ok(scale.ticks.length >= 3 && scale.ticks.length <= 8);
  assert.ok(scale.ticks.every((n, i) => i === 0 || n > scale.ticks[i - 1]));
});
test('flat, single and empty charts always have a finite nonzero scale', () => {
  for (const values of [[], [0], [100], [-100, -100], [1e-6, 1e-6], [1e12]]) {
    const scale = chartScale(values);
    assert.ok(Number.isFinite(scale.min) && Number.isFinite(scale.max));
    assert.ok(scale.max > scale.min);
    for (const n of values) assert.ok(n > scale.min && n < scale.max);
  }
});
test('selection uses dated points, clamps edges and never invents interpolated values', () => {
  const points = [{ date: '2026-01-01', amount: 0 }, { date: '2026-01-02', amount: -10 }, { date: '2026-01-11', amount: 20 }];
  assert.equal(pointFraction(points, 1), 0.1);
  assert.equal(nearestPoint(points, 0.2), 1);
  assert.equal(nearestPoint(points, -1), 0);
  assert.equal(nearestPoint(points, 2), 2);
  assert.equal(nearestPoint([], 0.5), null);
  assert.equal(nearestPoint(points.slice(0, 1), 0.9), 0);
  assert.equal(pointFraction(points.slice(0, 1), 0), 0.5);
});
test('period slicing preserves exact dates and USD/UAH endpoint values', () => {
  for (const currency of ['USD', 'UAH'] as const) {
    const values = valueHistory(seed, 'all', currency);
    const points = values.map((amount, i) => ({ date: HISTORY_DATES[i], amount }));
    for (const count of [4, 7, 10]) {
      const sliced = points.slice(-count);
      assert.equal(sliced[0].date, HISTORY_DATES[10 - count]);
      assert.deepEqual(sliced.at(-1), { date: '2026-10-13', amount: values.at(-1) });
      assert.equal(nearestPoint(sliced, 1), count - 1);
    }
  }
});

test('compact UAH and small percentage ticks remain distinguishable', () => {
  const moneyTicks = chartScale(valueHistory(seed, 'all', 'UAH').slice(-4)).ticks;
  const labels = axisLabels(moneyTicks, 'money');
  assert.equal(new Set(labels).size, moneyTicks.length);
  assert.ok(labels.every(label => label.length < 10));
  assert.deepEqual(axisLabels([-0.01, 0, 0.01], 'percent'), ['-0.01%', '0%', '0.01%']);
});
