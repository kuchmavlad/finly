import test from 'node:test';
import assert from 'node:assert/strict';
import { coversCashPeriod } from '../supabase/functions/_shared/ibkr/cashPeriod.ts';
import { parsePreview } from '../supabase/functions/_shared/ibkr/preview.ts';
import { cashReport,cashRow } from './fixtures/ibkr.ts';

test('cash period: only empty weekend edges are allowed; weekdays and weekend events block',()=>{
  assert.ok(coversCashPeriod('2026-10-12','2026-10-18','2026-10-12','2026-10-16',[]));
  assert.ok(coversCashPeriod('2026-10-10','2026-10-18','2026-10-12','2026-10-16',['2026-10-14']));
  assert.ok(!coversCashPeriod('2026-10-09','2026-10-18','2026-10-12','2026-10-16',[]));
  assert.ok(!coversCashPeriod('2026-10-12','2026-10-19','2026-10-12','2026-10-16',[]));
  assert.ok(!coversCashPeriod('2026-10-12','2026-10-18','2026-10-12','2026-10-16',['2026-10-17']));
  assert.ok(!coversCashPeriod('2026-10-12','2026-10-18','2026-10-12','2026-10-16',['']));
});
test('parser preserves cash dates and exact reconciliation; gaps do not become missing balances silently',async()=>{
  const xml=cashReport('','0','20261012','20261018').replace('toDate="20261018" startingCash','toDate="20261016" startingCash');
  const preview=await parsePreview(xml);assert.deepEqual(preview.issues,[]);
  assert.equal(preview.to,'2026-10-18');assert.equal(preview.balances[0].to,'2026-10-16');
  const mismatch=await parsePreview(xml.replace('endingCash="0"','endingCash="0.000000000000000001"'));
  assert.ok(mismatch.issues.some(i=>i.code==='CASH_MISMATCH'));
  const gap=await parsePreview(xml.replace('toDate="20261016"','toDate="20261015"'));assert.ok(gap.issues.some(i=>i.code==='CASH_PERIOD_GAP'));
  const weekendEvent=await parsePreview(xml.replace('<CashTransactions></CashTransactions>',`<CashTransactions>${cashRow('weekend','10').replace('20260712','20261017')}</CashTransactions>`));
  assert.ok(weekendEvent.issues.some(i=>i.code==='CASH_PERIOD_GAP'));
});
