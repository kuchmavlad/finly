// Synthetic fixtures for validation only; not evidence of a real broker format.
export const cashRow = (id = 'cash-1', amount = '10') => `<CashTransaction accountId="TEST" transactionID="${id}" currency="USD" dateTime="20260712;120000" amount="${amount}" type="Deposits/Withdrawals" levelOfDetail="DETAIL"/>`;
export function cashReport(rows = cashRow(), ending = '10', from = '20260701', to = '20260731') {
  return `<?xml version="1.0"?><FlexQueryResponse type="AF"><FlexStatements count="1"><FlexStatement accountId="TEST" fromDate="${from}" toDate="${to}">
    <AccountInformation accountId="TEST" currency="USD"/><ChangeInNAV/><EquitySummaryInBase/>
    <CashReport><CashReportCurrency accountId="TEST" currency="USD" fromDate="${from}" toDate="${to}" startingCash="0" endingCash="${ending}"/></CashReport>
    <Trades/><CashTransactions>${rows}</CashTransactions><Transfers/><OpenPositions/><SecuritiesInfo/>
    <CorporateActions/><TransactionTaxes/><InterestAccruals/><ChangeInDividendAccruals/>
    </FlexStatement></FlexStatements></FlexQueryResponse>`;
}
