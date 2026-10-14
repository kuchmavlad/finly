import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoRepository, seed } from '../src/data/demo.ts';
import { convert, mulDiv, parseAmount, summarize, unitValue, validateOperation } from '../src/domain/ledger.ts';
import { valueHistory } from '../src/domain/history.ts';
import type { OperationInput } from '../src/domain/models.ts';

const deposit: OperationInput = { portfolioId: 'ibkr', kind: 'deposit', currency: 'USD', amountMinor: 10000, date: seed.asOf };
test('decimal input becomes exact minor units and invalid input is rejected', () => {
  assert.equal(parseAmount('0.29'), 29);
  assert.equal(parseAmount('123,45'), 12345);
  for (const input of ['0', '-1', '1e5', '12.345', 'Infinity', '', '1 000']) assert.throws(() => parseAmount(input));
  assert.equal(mulDiv(199, 1, 2), 100);
  assert.equal(mulDiv(-199, 1, 2), -100);
});
test('seed balances reconcile to contributions plus profit and have a losing position', () => {
  for (const scope of ['all', 'ibkr', 'inzhur', 'bonds', 'empty'] as const) {
    for (const currency of ['USD', 'UAH'] as const) {
      const s = summarize(seed, scope, currency);
      assert.ok(Math.abs(s.valueMinor - s.netContributionsMinor - s.profitMinor) <= 2, `${scope}/${currency}`);
      assert.ok(s.cash.USD >= 0 && s.cash.UAH >= 0);
    }
  }
  const ibkr = summarize(seed, 'ibkr', 'USD');
  assert.equal(ibkr.realizedMinor, 15000);
  assert.equal(ibkr.positions.find(p => p.asset.id === 'aapl')?.quantity, 25);
  assert.equal(ibkr.positions.find(p => p.asset.id === 'bnd')!.valueMinor! - ibkr.positions.find(p => p.asset.id === 'bnd')!.costMinor, -14500);
});
test('adding a deposit changes value but not profit', async () => {
  const repo = createDemoRepository();
  const before = summarize(await repo.load(), 'all', 'USD');
  const after = summarize(await repo.add(deposit), 'all', 'USD');
  assert.equal(after.valueMinor - before.valueMinor, 10000);
  assert.equal(after.netContributionsMinor - before.netContributionsMinor, 10000);
  assert.equal(after.profitMinor, before.profitMinor);
});
test('sale releases proportional basis and changes units and cash', async () => {
  const repo = createDemoRepository();
  const before = summarize(await repo.load(), 'ibkr', 'USD');
  const after = summarize(await repo.add({ ...deposit, kind: 'sell', assetId: 'aapl', quantity: 5, amountMinor: 112250 }), 'ibkr', 'USD');
  assert.equal(after.positions.find(p => p.asset.id === 'aapl')?.quantity, 20);
  assert.equal(after.realizedMinor - before.realizedMinor, 12250);
  assert.equal(after.valueMinor, before.valueMinor);
  assert.equal(after.profitMinor, before.profitMinor);
});
test('rejects overselling, cash shortfalls, wrong currency and invalid dates', () => {
  assert.throws(() => validateOperation(seed, { ...deposit, kind: 'sell', assetId: 'aapl', quantity: 26 }), /units/);
  assert.throws(() => validateOperation(seed, { ...deposit, kind: 'withdrawal', amountMinor: 90000000 }), /cash/);
  assert.throws(() => validateOperation(seed, { ...deposit, kind: 'buy', assetId: 'aapl', quantity: 1, currency: 'UAH' }), /currency/);
  assert.throws(() => validateOperation(seed, { ...deposit, date: '2026-02-30' }), /date/);
  assert.throws(() => validateOperation(seed, { ...deposit, date: '2026-10-14' }), /date/);
  assert.throws(() => validateOperation(seed, { ...deposit, kind: 'coupon', assetId: 'aapl' }), /bond/);
  assert.throws(() => validateOperation(seed, { ...deposit, kind: 'buy', assetId: 'aapl', quantity: 1.5 }), /whole units/);
});
test('backdated withdrawal cannot break a later purchase', () => {
  assert.throws(() => validateOperation(seed, { ...deposit, kind: 'withdrawal', date: '2026-01-02', amountMinor: 100000 }), /cash/);
});
test('bond valuation uses percent of face plus accrued interest', () => {
  const bond = seed.assets.find(a => a.id === 'ust')!;
  assert.equal(unitValue(bond), 100080);
  assert.equal(unitValue({ ...bond, priceMinor: null }), null);
  assert.equal(convert(4200, 'UAH', 'USD'), 100);
});
test('missing quotes remain missing and flag partial totals', () => {
  const data = { ...seed, assets: seed.assets.map(a => ({ ...a, priceMinor: null })) };
  const s = summarize(data, 'all', 'USD');
  assert.equal(s.missingPrices, true);
  assert.ok(s.positions.every(p => p.valueMinor === null));
});
test('history ends at current portfolio value and includes manual cash flows', async () => {
  const repo = createDemoRepository();
  const updated = await repo.add(deposit);
  for (const scope of ['all', 'ibkr', 'inzhur', 'bonds', 'empty'] as const) {
    const history = valueHistory(updated, scope, 'USD');
    assert.equal(history.at(-1), summarize(updated, scope, 'USD').valueMinor);
  }
});
test('repository returns isolated snapshots and resets session operations', async () => {
  const repo = createDemoRepository();
  const snapshot = await repo.load(); snapshot.operations.length = 0;
  assert.equal((await repo.load()).operations.length, seed.operations.length);
  const updated = await repo.add(deposit);
  assert.equal(updated.operations.at(-1)?.source, 'manual');
  assert.equal((await repo.reset()).operations.length, seed.operations.length);
});
