import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePreview, comparePreviews, MAX_REPORT_BYTES } from '../src/domain/ibkr/preview.ts';
import { decimal, units } from '../src/domain/ibkr/decimal.ts';

// Authored synthetic unit fixtures, NOT real broker reports or format evidence.
const cash = (id = 'cash-1', amount = '10', extra = '') => `<CashTransaction accountId="TEST" transactionID="${id}" currency="USD" dateTime="20260712;120000" amount="${amount}" type="Deposits/Withdrawals" levelOfDetail="DETAIL" ${extra}/>`;
function report(records = cash(), ending = '10', other = '', from = '20260701', to = '20260731') {
  return `<?xml version="1.0"?><FlexQueryResponse type="AF"><FlexStatements count="1"><FlexStatement accountId="TEST" fromDate="${from}" toDate="${to}">
    <AccountInformation accountId="TEST" currency="USD"/><ChangeInNAV/><EquitySummaryInBase/>
    <CashReport><CashReportCurrency accountId="TEST" currency="USD" fromDate="${from}" toDate="${to}" startingCash="0" endingCash="${ending}"/></CashReport>
    <Trades/><CashTransactions>${records}</CashTransactions><Transfers/><OpenPositions/><SecuritiesInfo/>
    <CorporateActions/><TransactionTaxes/><InterestAccruals/><ChangeInDividendAccruals/>${other}
    </FlexStatement></FlexStatements></FlexQueryResponse>`;
}
test('signed decimal arithmetic preserves sub-cent and large values exactly', () => {
  assert.equal(decimal(units('999999999999999999.123456789012345678') + units('0.000000000000000001')), '999999999999999999.123456789012345679');
  assert.equal(decimal(units('-1.000000000000000001') + units('1')), '-0.000000000000000001');
  for (const value of ['1e2', 'NaN', '', '01', '+1', '.1', '0.0000000000000000001']) assert.throws(() => units(value));
});
test('same and overlapping reports do not produce new identities', async () => {
  const first = await parsePreview(report(cash() + cash('cash-2', '20'), '30'));
  const subset = await parsePreview(report(cash(), '10', '', '20260710', '20260722'));
  assert.deepEqual(first.issues, []);
  assert.equal(first.balances[0].difference, '0');
  assert.deepEqual(comparePreviews(first, first).statuses, ['unchanged', 'unchanged']);
  assert.deepEqual(comparePreviews(subset, first).statuses, ['unchanged']);
  assert.equal(comparePreviews(subset, first).removed, 1);
});
test('two identical legitimate payments with different IDs remain separate', async () => {
  const preview = await parsePreview(report(cash() + cash('cash-2'), '20'));
  assert.equal(preview.events.length, 2);
  assert.deepEqual(preview.issues, []);
  assert.deepEqual(comparePreviews(preview).statuses, ['new', 'new']);
});
test('changed payload is a revision candidate, while duplicate and missing IDs are ambiguous', async () => {
  const base = await parsePreview(report());
  const changed = await parsePreview(report(cash('cash-1', '11'), '11'));
  assert.deepEqual(comparePreviews(changed, base).statuses, ['changed']);
  const duplicate = await parsePreview(report(cash() + cash(), '20'));
  assert.ok(duplicate.issues.some(i => i.code === 'AMBIGUOUS_ID'));
  assert.deepEqual(comparePreviews(duplicate, base).statuses, ['ambiguous', 'ambiguous']);
  assert.deepEqual(comparePreviews(await parsePreview(report(cash('')))).statuses, ['ambiguous']);
});
test('comparison ignores attribute order but not missing source attributes', async () => {
  const a = await parsePreview(report());
  const b = await parsePreview(report().replace('transactionID="cash-1" currency="USD"', 'currency="USD" transactionID="cash-1"'));
  assert.deepEqual(comparePreviews(a, b).statuses, ['unchanged']);
});
test('different accounts and mixed account records cannot be verified', async () => {
  const base = await parsePreview(report());
  const other = await parsePreview(report().replaceAll('TEST', 'OTHER'));
  assert.throws(() => comparePreviews(other, base), /different accounts/);
  const mixed = await parsePreview(report(cash().replace('TEST', 'OTHER')));
  assert.ok(mixed.issues.some(i => i.code === 'ACCOUNT_MISMATCH'));
});
test('cash reconciliation detects tiny differences without epsilon or rounding', async () => {
  const preview = await parsePreview(report(cash('cash-1', '0.000000000000000001'), '0.000000000000000002'));
  assert.equal(preview.balances[0].difference, '0.000000000000000001');
  assert.ok(preview.issues.some(i => i.code === 'CASH_MISMATCH'));
});
test('unsupported types, sections, missing sections and invalid dates block verification', async () => {
  for (const xml of [report().replace('Deposits/Withdrawals', 'Dividends'), report('', '0', '<Unknown/>'), report().replace('<Transfers/>', ''), report().replace('20260712;120000', '20260230;120000'), report().replace('<CorporateActions/>', '<CorporateActions><CorporateAction/></CorporateActions>')]) {
    assert.ok((await parsePreview(xml)).issues.length > 0);
  }
  await assert.rejects(parsePreview(report().replaceAll('20260731', '20260230')));
});
test('XML security and resource limits reject malformed or untrusted structures', async () => {
  for (const xml of [
    '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]>' + report(),
    report().replace('amount="10"', 'amount="&unknown;"'),
    report().replace('<Trades/>', '<Trades><Trade></Trades>'),
    report().replace('accountId="TEST" currency="USD"', 'accountId="TEST" accountId="TEST" currency="USD"'),
    '<FlexStatementResponse><Status>Fail</Status></FlexStatementResponse>',
    report().replace('<Trades/>', '<xi:include href="https://example.invalid"/>'),
    report().replace('<Trades/>', '<a>'.repeat(9) + '</a>'.repeat(9)),
    report().replace('<Trades/>', '<Trades>' + '<Trade/>'.repeat(20001) + '</Trades>'),
    report().replace('<Trades/>', '<Trades note="' + 'x'.repeat(4097) + '"/>'),
    ' '.repeat(MAX_REPORT_BYTES + 1),
  ]) await assert.rejects(parsePreview(xml));
  await assert.rejects(parsePreview(report(), () => true), /cancelled/);
});
test('multiple statements, duplicate sections and missing currency balances are rejected or flagged', async () => {
  await assert.rejects(parsePreview(report().replace('count="1"', 'count="2"')), /one account/);
  assert.ok((await parsePreview(report('', '0', '<Trades/>'))).issues.some(i => i.code === 'DUPLICATE_SECTION'));
  assert.ok((await parsePreview(report(cash().replace('currency="USD"', 'currency="EUR"')))).issues.some(i => i.code === 'MISSING_CURRENCY_BALANCE'));
});
test('FX uses both legs even when netCash is zero; cashTransfer closes reconciliation', async () => {
  const fx = '<Trade accountId="TEST" tradeID="fx-1" levelOfDetail="EXECUTION" transactionType="ExchTrade" tradeDate="20260712" settleDateTarget="20260714" currency="USD" assetCategory="CASH" symbol="EUR.USD" notes="AFx" buySell="SELL" quantity="-10" tradePrice="1.1" multiplier="1" proceeds="11" ibCommission="0" ibCommissionCurrency="USD" taxes="0" netCash="0" origOrderID="0" origTradePrice="0"/>';
  const transfer = '<Transfer accountId="TEST" transactionID="transfer-1" levelOfDetail="TRANSFER" assetCategory="CASH" type="INTERNAL" direction="IN" date="20260712" settleDate="20260712" currency="USD" cashTransfer="2" positionAmount="0"/>';
  const xml = report('', '13').replace('<Trades/>', `<Trades>${fx}</Trades>`).replace('<Transfers/>', `<Transfers>${transfer}</Transfers>`).replace('</CashReport>', '<CashReportCurrency accountId="TEST" currency="EUR" fromDate="20260701" toDate="20260731" startingCash="10" endingCash="0"/></CashReport>');
  const preview = await parsePreview(xml);
  assert.deepEqual(preview.issues, []);
  assert.deepEqual(preview.balances.map(b => b.difference), ['0', '0']);
  assert.ok((await parsePreview(xml.replace('cashTransfer="2"', ''))).issues.some(i => i.code === 'MISSING_FIELD'));
});
