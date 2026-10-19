import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePreview } from '../src/domain/ibkr/preview.ts';
import { cashReport } from './fixtures/ibkr.ts';
import { importIssueMessage } from '../src/domain/ibkr/issueMessage.ts';

// Synthetic fixtures, not copies of private reports.
function report(notes: string) {
  return cashReport('', '-1.250000000000000001').replace('<Trades/>', `<Trades><Trade accountId="TEST" tradeID="fraction-1" levelOfDetail="EXECUTION" transactionType="ExchTrade" tradeDate="20260712" settleDateTarget="20260714" currency="USD" assetCategory="STK" conid="123" symbol="TEST" notes="${notes}" buySell="BUY" quantity="0.125" tradePrice="10" multiplier="1" proceeds="-1.25" ibCommission="-0.000000000000000001" ibCommissionCurrency="USD" taxes="0" netCash="-1.250000000000000001"/></Trades>`);
}
test('fractional and partial execution notes preserve exact trade cash', async () => {
  for (const notes of ['FP', 'RP', 'FP;P', 'RP;P', 'IA;P']) {
    const preview = await parsePreview(report(notes));
    assert.deepEqual(preview.issues, []);
    assert.equal(preview.events[0].postings[0].amount, '-1.250000000000000001');
    assert.equal(preview.balances[0].difference, '0');
  }
});
test('unknown, correction and malformed note combinations stay blocked', async () => {
  for (const notes of ['FP;Co', 'FP;Ca', 'RP;UNKNOWN', 'FP;', 'FP;;P', 'AFx']) {
    const preview = await parsePreview(report(notes));
    assert.equal(preview.events[0].supported, false);
    assert.deepEqual(preview.events[0].postings, []);
    assert.ok(preview.issues.some(i => i.code === 'UNSUPPORTED_CODE'));
  }
  const mismatch = await parsePreview(report('FP').replace('netCash="-1.250000000000000001"', 'netCash="-1.25"'));
  assert.ok(mismatch.issues.some(i => i.code === 'NET_CASH_MISMATCH'));
});
test('a base summary never substitutes for original currency reconciliation', async () => {
  const preview = await parsePreview(report('FP').replace('currency="USD" fromDate=', 'currency="BASE_SUMMARY" fromDate='));
  assert.equal(preview.balances.length, 0);
  assert.ok(preview.issues.some(i => i.code === 'BASE_SUMMARY_ONLY'));
  assert.ok(preview.issues.some(i => i.code === 'MISSING_CURRENCY_BALANCE'));
  assert.match(importIssueMessage('BASE_SUMMARY_ONLY'), /Currency Breakout/);
  assert.doesNotMatch(importIssueMessage('UNKNOWN'), /resume|Refresh status/);
});
