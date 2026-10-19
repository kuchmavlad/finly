const messages: Record<string, string> = {
  UNSUPPORTED_CODE: 'This operation has an unsupported IBKR code. Retrying the download will not resolve it; importer support is required.',
  UNSUPPORTED_FX: 'This currency conversion is not supported by the importer yet.',
  UNSUPPORTED_TRADE: 'This trade type or correction is not supported by the importer.',
  UNSUPPORTED_ASSET: 'This asset type is not supported by the importer.',
  UNSUPPORTED_CASH: 'This cash operation type is not supported by the importer.',
  UNSUPPORTED_TRANSFER: 'This transfer type is not supported by the importer.',
  CASH_MISMATCH: 'Reported cash movement does not match supported operations exactly. Missing or unsupported operations must be resolved before confirmation.',
  BASE_SUMMARY_ONLY: 'The XML contains only a converted base-currency total. Check Currency Breakout in the IBKR Cash Report settings and obtain balances in each original currency. This saved XML cannot be reconciled.',
  MISSING_BALANCES: 'No valid currency balances were available for reconciliation. Check the Cash Report section of the query.',
  MISSING_CURRENCY_BALANCE: 'A currency used by operations has no cash balance in the report. Obtain a report with balances in each original currency.',
  CASH_PERIOD_GAP: 'Cash statement dates leave a gap or omit reported operations.',
  INVALID_CASH_REPORT: 'Cash statement fields could not be validated. Check the query fields and date format.',
  MISSING_FIELD: 'A required operation field is missing. Check the Flex query fields.',
  MISSING_ID: 'An operation has no stable broker ID. It cannot be imported safely.',
  AMBIGUOUS_ID: 'Multiple operations share the same broker ID. Review is required.',
  NET_CASH_MISMATCH: 'Trade net cash does not equal proceeds plus commission and taxes.',
};

// Report validation is distinct from transport failures: never recommend network retries here.
export function importIssueMessage(code: string): string {
  return messages[code] ?? 'Report validation failed. Review the operation and query configuration; no operations were applied.';
}
