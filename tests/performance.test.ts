import assert from 'node:assert/strict';
import test from 'node:test';
import { demoPerformanceHistory, linkReturn } from '../src/domain/demoPerformance.ts';
import { seed } from '../src/data/demo.ts';
import { summarize } from '../src/domain/ledger.ts';
import type { Dataset, Operation } from '../src/domain/models.ts';

const op = (kind: Operation['kind'], amountMinor: number, date = seed.asOf): Operation => ({ id: `test-${kind}`, portfolioId: 'ibkr', currency: 'USD', kind, amountMinor, date, source: 'manual' });
const last = (data: Dataset) => demoPerformanceHistory(data, 'ibkr', 'USD').at(-1)!;
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('TWR links subperiod returns geometrically, including losses and zero capital', () => {
  close(linkReturn(linkReturn(1, 100, 110)!, 210, 189)!, 0.99);
  assert.equal(linkReturn(1, 0, 0), 1);
  assert.equal(linkReturn(1, 0, 10), null);
  assert.equal(linkReturn(1, 100, 0), 0);
  assert.equal(linkReturn(1, -10, 10), null);
});
test('final deposits and withdrawals change NAV but not the existing TWR', () => {
  const original = last(seed);
  for (const cashFlow of [op('deposit', 100000), op('withdrawal', 10000)]) {
    const next = last({ ...seed, operations: [...seed.operations, cashFlow] });
    close(next.returnPercent!, original.returnPercent!);
    assert.notEqual(next.valueMinor, original.valueMinor);
    assert.equal(next.profitMinor, original.profitMinor);
  }
});
test('income and fees are performance, not external cash flows', () => {
  const original = last(seed);
  for (const [kind, sign] of [['dividend', 1], ['fee', -1]] as const) {
    const entry = { ...op(kind, 1000), ...(kind === 'dividend' ? { assetId: 'aapl' } : {}) };
    const next = last({ ...seed, operations: [...seed.operations, entry] });
    close(next.returnPercent!, ((1 + original.returnPercent! / 100) * (original.valueMinor + sign * 1000) / original.valueMinor - 1) * 100);
  }
});
test('a deposit between market moves starts the next return link at the funded NAV', () => {
  const data: Dataset = { ...seed, assets: [{ ...seed.assets[0], priceMinor: 10000 }], operations: [
    op('deposit', 10000, '2026-01-01'),
    { ...op('buy', 9000, '2026-01-01'), assetId: 'aapl', quantity: 1 },
    op('deposit', 10000, '2026-02-01'),
  ] };
  const points = demoPerformanceHistory(data, 'ibkr', 'USD');
  close(points[1].returnPercent!, 2);
  close(points[2].returnPercent!, (1.02 * 20100 / 20200 - 1) * 100);
});
test('cash-only flows, full withdrawal and re-funding do not manufacture returns', () => {
  const cash: Dataset = { ...seed, assets: [], operations: [op('deposit', 10000, '2026-01-01'), op('withdrawal', 10000, '2026-02-01'), op('deposit', 50000, '2026-05-01')] };
  assert.ok(demoPerformanceHistory(cash, 'ibkr', 'USD').every(p => p.returnPercent === 0));
  assert.ok(demoPerformanceHistory({ ...cash, operations: [] }, 'ibkr', 'USD').every(p => p.returnPercent === null));
});
test('missing held valuations make TWR unavailable; final values match the ledger', () => {
  const missing = { ...seed, assets: seed.assets.map(a => ({ ...a, priceMinor: null })) };
  assert.equal(last(missing).returnPercent, null);
  for (const scope of ['all', 'ibkr', 'inzhur', 'bonds'] as const) {
    for (const currency of ['USD', 'UAH'] as const) {
      const final = demoPerformanceHistory(seed, scope, currency).at(-1)!;
      const total = summarize(seed, scope, currency);
      assert.equal(final.valueMinor, total.valueMinor);
      assert.equal(final.profitMinor, total.profitMinor);
      assert.ok(Number.isFinite(final.returnPercent));
    }
  }
});
