// Local integration check: no report values, account numbers or IDs in output.
import { readFile, stat } from 'node:fs/promises';
import { comparePreviews, MAX_REPORT_BYTES, parsePreview, ReportError } from '../src/domain/ibkr/preview.ts';

const paths = process.argv.slice(2);
if (paths.length !== 2) {
  console.error('Usage: node --experimental-strip-types scripts/check-ibkr-samples.ts <first.xml> <second.xml>');
  process.exitCode = 1;
} else {
  try {
    const reports = [];
    for (const path of paths) {
      if ((await stat(path)).size > MAX_REPORT_BYTES) throw new ReportError('Report exceeds 10 MiB.');
      reports.push(await parsePreview(await readFile(path, 'utf8')));
    }
    const comparison = comparePreviews(reports[1], reports[0]);
    console.log(JSON.stringify({
      reports: reports.map(r => ({ records: r.events.length, issues: r.issues,
        cashReconciles: r.issues.length === 0 && r.balances.every(b => b.difference === '0') })),
      comparison: Object.fromEntries(['new', 'unchanged', 'changed', 'ambiguous'].map(status => [status, comparison.statuses.filter(s => s === status).length])),
      absentWithinPeriod: comparison.removed,
    }, null, 2));
    if (reports.some(r => r.issues.length) || comparison.statuses.some(s => s === 'changed' || s === 'ambiguous')) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof ReportError ? error.message : 'Could not validate the local reports.');
    process.exitCode = 1;
  }
}
