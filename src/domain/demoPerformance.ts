import type { Currency, Dataset, Operation, PortfolioScope } from './models.ts';
import { summarize } from './ledger.ts';
import { demoValuationAt, HISTORY_DATES } from './history.ts';

export type PerformancePoint = { date: string; returnPercent: number | null; profitMinor: number; valueMinor: number };

// Geometrically link valuation changes; external flows are applied between links.
// A zero-capital interval is neutral only if it has no investment gain/loss.
export function linkReturn(factor: number, before: number, after: number): number | null {
  if (before < 0 || after < 0 || ![factor, before, after].every(Number.isFinite)) return null;
  if (before === 0) return after === 0 ? factor : null;
  return factor * after / before;
}

export function demoPerformanceHistory(data: Dataset, scope: PortfolioScope, currency: Currency): PerformancePoint[] {
  const operations = data.operations.filter(o => (scope === 'all' || o.portfolioId === scope) && o.date <= data.asOf)
    .sort((a, b) => a.date.localeCompare(b.date));
  const samples = HISTORY_DATES.filter(date => date <= data.asOf);
  const dates = [...new Set([...samples, ...operations.map(o => o.date)])].sort();
  const processed: Operation[] = [];
  const result: PerformancePoint[] = [];
  let factor: number | null = 1, previousValue = 0, funded = false, cursor = 0;
  for (const date of dates) {
    const valued = demoValuationAt(data, date);
    const summary = () => summarize({ ...valued, operations: processed }, scope, currency, date);
    let current = summary();
    factor = current.missingPrices || factor === null ? null : linkReturn(factor, previousValue, current.valueMinor);
    while (cursor < operations.length && operations[cursor].date === date) {
      const op = operations[cursor++];
      const before = current.valueMinor;
      processed.push(op);
      current = summary();
      if (current.missingPrices) factor = null;
      if (op.kind === 'deposit' || op.kind === 'withdrawal') {
        // Exact before/after demo valuations remove the flow itself from performance.
        if (op.kind === 'deposit' && current.valueMinor > 0) funded = true;
      } else if (factor !== null) {
        factor = linkReturn(factor, before, current.valueMinor);
      }
    }
    previousValue = current.valueMinor;
    if (samples.includes(date)) result.push({ date, returnPercent: funded && factor !== null ? (factor - 1) * 100 : null, profitMinor: current.profitMinor, valueMinor: current.valueMinor });
  }
  return result;
}
