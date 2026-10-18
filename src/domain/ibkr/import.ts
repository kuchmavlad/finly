import type { Preview } from './preview.ts';
export type ImportSummary = {
  id: string; portfolioId: string; account: string; from: string; to: string; digest: string;
  status: 'ready' | 'blocked' | 'applied'; newCount: number; unchangedCount: number; changedCount: number;
  issues: Preview['issues']; balances: Preview['balances']; createdAt: string; appliedAt: string | null;
};
export type ImportRecord = { date: string; kind: string; label: string; location: string; postings: {currency: string; amount: string}[] };
export type ImportPending = { reportId: string; digest: string; requestId: string };
export class ImportFailure extends Error {
  code: string;
  constructor(code: string) { super(importMessage(code)); this.code = code; }
}
export function importMessage(code: string): string {
  const messages: Record<string,string> = {
    UNAUTHORIZED: 'Sign in again to continue.', PORTFOLIO_UNAVAILABLE: 'Select an available portfolio.',
    MANUAL_OVERLAP: 'This portfolio has manual cash entries. Choose an empty portfolio for IBKR.',
    ACCOUNT_MAPPING_CONFLICT: 'This broker account is linked to another portfolio, or this portfolio has another broker account.',
    STORAGE_LIMIT: 'Report storage limit reached. Contact the project administrator before uploading more reports.',
    INVALID_REPORT: 'The server could not validate this XML. Check it in the local preview.',
    LIMIT_EXCEEDED: 'The report exceeds import limits. Export a shorter period.',
    REPORT_UNAVAILABLE: 'This report is unavailable for the signed-in account.',
    PREVIEW_STALE: 'Saved records changed. Choose the same XML and check it on the server again before confirming.',
    REPORT_BLOCKED: 'This report has validation issues or changed records. Nothing was applied.',
    REVISION_CONFLICT: 'An existing operation changed. Nothing was applied; review the report.',
    REQUEST_CONFLICT: 'The confirmation ID conflicts with another request. Nothing was applied by this request.',
    INVALID_DECIMAL: 'A monetary value failed server validation. Nothing was applied.',
  };
  return messages[code] ?? 'Could not reach the import service. Retry or check the saved report status; do not assume the import failed.';
}
