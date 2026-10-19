import { SaxesParser } from 'saxes';
import { decimal, units } from './decimal.ts';
import { coversCashPeriod } from './cashPeriod.ts';

export const MAX_REPORT_BYTES = 10 * 1024 * 1024;
const MAX_NODES = 20000;
export class ReportError extends Error {}
type Node = { name: string; attrs: Record<string, string>; children: Node[] };
export type Issue = { code: string; location: string };
export type Posting = { currency: string; amount: string };
export type PreviewEvent = {
  key: string; signature: string; kind: string; date: string; label: string;
  location: string; postings: Posting[]; supported: boolean;
};
export type Preview = {
  account: string; from: string; to: string; events: PreviewEvent[]; issues: Issue[];
  sections: { name: string; count: number }[];
  balances: { currency: string; starting: string; ending: string; movement: string; difference: string; from?:string; to?:string }[];
  totals: { kind: string; currency: string; amount: string }[];
};
export type Comparison = { statuses: ('new' | 'unchanged' | 'changed' | 'ambiguous')[]; removed: number };

function fail(message: string): never { throw new ReportError(message); }
function required(a: Record<string, string>, key: string): string {
  if (!a[key]) throw new Error('MISSING_FIELD');
  return a[key];
}
function date(value: string): string {
  if (!/^\d{8}$/.test(value)) throw new Error('INVALID_DATE');
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) throw new Error('INVALID_DATE');
  return iso;
}
function currency(value: string): string {
  if (!/^[A-Z]{3}$/.test(value)) throw new Error('INVALID_CURRENCY');
  return value;
}
function timestampDate(value: string): string {
  if (!/^\d{8}(;([01]\d|2[0-3])[0-5]\d[0-5]\d)?$/.test(value)) throw new Error('INVALID_DATE');
  return date(value.split(';')[0]);
}
export function byteLength(text: string): number {
  let bytes = 0;
  for (const char of text) { const cp = char.codePointAt(0)!; bytes += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4; }
  return bytes;
}

// Saxes validates XML grammar. No DTD, custom entities, namespaces, XInclude or I/O.
// Yield between bounded chunks so the mobile screen can repaint and cancel.
export async function parsePreview(xml: string, cancelled = () => false): Promise<Preview> {
  if (xml.length > MAX_REPORT_BYTES || byteLength(xml) > MAX_REPORT_BYTES) fail('Report exceeds 10 MiB. Export a shorter period.');
  if (/<!\s*(DOCTYPE|ENTITY)/i.test(xml)) fail('DTD and entity declarations are not allowed.');
  const started = Date.now();
  const stack: Node[] = [];
  let root: Node | undefined; let nodes = 0;
  const parser = new SaxesParser({ xmlns: false });
  parser.on('error', () => fail('Invalid XML. Export the report again.'));
  parser.on('doctype', () => fail('DTD is not allowed.'));
  parser.on('processinginstruction', () => fail('Processing instructions are not supported.'));
  parser.on('cdata', () => fail('Unexpected report content.'));
  parser.on('text', text => { if (text.trim()) fail('Expected an attribute-based Activity Flex report.'); });
  parser.on('opentag', tag => {
    if (++nodes > MAX_NODES || stack.length >= 8) fail('Report structure exceeds preview limits. Export a shorter period.');
    if (tag.name.includes(':') || Object.keys(tag.attributes).some(k => k.includes(':') || k === 'xmlns')) fail('XML namespaces are not supported.');
    if (Object.keys(tag.attributes).length > 160 || Object.values(tag.attributes).some(v => v.length > 4096)) fail('Report fields exceed preview limits.');
    const node: Node = { name: tag.name, attrs: { ...tag.attributes }, children: [] };
    if (stack.length) stack[stack.length - 1].children.push(node); else root = node;
    stack.push(node);
  });
  parser.on('closetag', () => { stack.pop(); });
  for (let offset = 0; offset < xml.length; offset += 16384) {
    if (cancelled()) fail('Preview cancelled.');
    if (Date.now() - started > 30000) fail('Preview timed out. Export a shorter period.');
    parser.write(xml.slice(offset, offset + 16384));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  parser.close();
  if (cancelled()) fail('Preview cancelled.');
  if (!root || root.name !== 'FlexQueryResponse' || root.attrs.type !== 'AF') fail('Choose an Activity Flex XML report, not a service response.');
  if (root.children.length !== 1 || root.children[0].name !== 'FlexStatements') fail('Invalid report envelope.');
  const statements = root.children[0];
  if (statements.attrs.count !== '1' || statements.children.length !== 1 || statements.children[0].name !== 'FlexStatement') fail('Choose a report for one account only.');
  try { return buildPreview(statements.children[0]); }
  catch (error) { if (error instanceof ReportError) throw error; fail('Invalid account or report period.'); }
}

const sectionRecords: Record<string, string> = {
  AccountInformation: '', ChangeInNAV: '', CashReport: 'CashReportCurrency', Trades: 'Trade',
  CashTransactions: 'CashTransaction', Transfers: 'Transfer', OpenPositions: 'OpenPosition',
  SecuritiesInfo: 'SecurityInfo', EquitySummaryInBase: 'EquitySummaryByReportDateInBase',
  CorporateActions: '', TransactionTaxes: '', InterestAccruals: '', ChangeInDividendAccruals: '',
};
function buildPreview(statement: Node): Preview {
  const account = required(statement.attrs, 'accountId');
  const from = date(required(statement.attrs, 'fromDate')); const to = date(required(statement.attrs, 'toDate'));
  if (from > to) fail('Invalid report period.');
  const issues: Issue[] = []; const events: PreviewEvent[] = []; const balances: Preview['balances'] = [];
  const issue = (code: string, location: string) => { issues.push({ code, location }); };
  const sections = new Map<string, Node>();
  for (const node of statement.children) {
    if (sections.has(node.name)) issue('DUPLICATE_SECTION', node.name);
    sections.set(node.name, node);
    if (!Object.hasOwn(sectionRecords, node.name)) { issue('UNKNOWN_SECTION', 'Report'); continue; }
    if (node.attrs.accountId && node.attrs.accountId !== account) issue('ACCOUNT_MISMATCH', node.name);
    if (!sectionRecords[node.name] && node.name !== 'AccountInformation' && node.name !== 'ChangeInNAV' && (node.children.length || Object.keys(node.attrs).length)) issue('UNSUPPORTED_SECTION', node.name);
    for (const child of node.children) {
      if (child.name !== sectionRecords[node.name] || child.children.length) issue('UNEXPECTED_RECORD', node.name);
      if (child.attrs.accountId && child.attrs.accountId !== account) issue('ACCOUNT_MISMATCH', node.name);
    }
  }
  for (const name of Object.keys(sectionRecords)) if (!sections.has(name)) issue('MISSING_SECTION', name);
  const info = sections.get('AccountInformation');
  if (!info || info.children.length || info.attrs.accountId !== account || !/^[A-Z]{3}$/.test(info.attrs.currency ?? '')) issue('INVALID_ACCOUNT', 'AccountInformation');
  for (const [section, kind] of [['Trades', 'Trade'], ['CashTransactions', 'CashTransaction'], ['Transfers', 'Transfer']]) {
    const rows = sections.get(section)?.children ?? [];
    rows.forEach((row, index) => {
      const a = row.attrs; const location = `${section} #${index + 1}`; const postings: Posting[] = [];
      const id = a[kind === 'Trade' ? 'tradeID' : 'transactionID'];
      const event: PreviewEvent = { key: id ? JSON.stringify([account, kind, id]) : '',
        signature: JSON.stringify(Object.keys(a).sort().map(k => [k, a[k]])), kind,
        date: '', label: kind === 'Trade' ? a.symbol || 'Trade' : a.type || kind, location, postings, supported: false };
      events.push(event);
      try {
        if (row.name !== kind || row.children.length) throw new Error('UNEXPECTED_RECORD');
        if (a.accountId !== account) throw new Error('ACCOUNT_MISMATCH');
        if (!id) throw new Error('MISSING_ID');
        event.date = timestampDate(required(a, kind === 'Trade' ? 'tradeDate' : kind === 'Transfer' ? 'date' : 'dateTime'));
        for (const field of ['reportDate', 'settleDate', 'availableForTradingDate', 'exDate']) if (a[field]) date(a[field]);
        if (a.dateTime) timestampDate(a.dateTime);
        if (event.date < from || event.date > to) throw new Error('OUTSIDE_PERIOD');
        const cur = currency(required(a, 'currency'));
        const add = (c: string, value: bigint) => postings.push({ currency: currency(c), amount: decimal(value) });
        const money = (key: string) => units(required(a, key));
        if (kind === 'Trade') {
          if (a.levelOfDetail !== 'EXECUTION' || a.transactionType !== 'ExchTrade' || a.origTradeID || (a.origOrderID && a.origOrderID !== '0') || a.origTradeDate || (a.origTradePrice && units(a.origTradePrice) !== 0n) || (a.changeInPrice && units(a.changeInPrice) !== 0n) || (a.changeInQuantity && units(a.changeInQuantity) !== 0n)) throw new Error('UNSUPPORTED_TRADE');
          // Only codes observed in the supplied samples are supported initially.
          if (!['', 'IA', 'AFx'].includes(a.notes ?? '')) throw new Error('UNSUPPORTED_CODE');
          date(required(a, 'settleDateTarget'));
          const qty = money('quantity'); const proceeds = money('proceeds'); const fee = money('ibCommission'); const taxes = money('taxes');
          money('tradePrice'); money('multiplier'); money('netCash');
          if (!['BUY', 'SELL'].includes(a.buySell) || qty === 0n || (a.buySell === 'BUY') !== (qty > 0n) || (proceeds !== 0n && (proceeds > 0n) === (qty > 0n))) throw new Error('INVALID_TRADE_SIGN');
          if (a.assetCategory === 'STK') {
            required(a, 'conid');
            if (a.ibCommissionCurrency !== cur || money('multiplier') !== units('1')) throw new Error('UNSUPPORTED_TRADE');
            if (money('netCash') !== proceeds + fee + taxes) throw new Error('NET_CASH_MISMATCH');
            add(cur, money('netCash'));
          } else if (a.assetCategory === 'CASH') {
            const pair = required(a, 'symbol').split('.');
            if (pair.length !== 2 || pair[1] !== cur || pair[0] === cur || a.notes !== 'AFx') throw new Error('UNSUPPORTED_FX');
            add(pair[0], qty); add(cur, proceeds + taxes); add(required(a, 'ibCommissionCurrency'), fee);
          } else throw new Error('UNSUPPORTED_ASSET');
        } else if (kind === 'CashTransaction') {
          if (a.levelOfDetail !== 'DETAIL' || a.type !== 'Deposits/Withdrawals' || a.code || a.actionID) throw new Error('UNSUPPORTED_CASH');
          if (money('amount') === 0n) throw new Error('INVALID_AMOUNT');
          add(cur, money('amount'));
        } else {
          if (a.levelOfDetail !== 'TRANSFER' || a.assetCategory !== 'CASH' || a.type !== 'INTERNAL' || a.direction !== 'IN' || a.code) throw new Error('UNSUPPORTED_TRANSFER');
          date(required(a, 'settleDate'));
          if (money('cashTransfer') <= 0n) throw new Error('INVALID_TRANSFER_SIGN');
          add(cur, money('cashTransfer'));
        }
        event.supported = true;
      } catch (error) {
        event.postings = [];
        issue(error instanceof Error ? error.message : 'INVALID_RECORD', location);
      }
    });
  }
  const keys = new Map<string, number>();
  for (const e of events) if (e.key) keys.set(e.key, (keys.get(e.key) ?? 0) + 1);
  for (const e of events) if (e.key && keys.get(e.key)! > 1) { e.supported = false; issue('AMBIGUOUS_ID', e.location); }
  const sums = new Map<string, bigint>(); const groups = new Map<string, bigint>();
  for (const e of events.filter(e => e.supported)) for (const p of e.postings) {
    sums.set(p.currency, (sums.get(p.currency) ?? 0n) + units(p.amount));
    const key = JSON.stringify([e.kind, p.currency]); groups.set(key, (groups.get(key) ?? 0n) + units(p.amount));
  }
  const seen = new Set<string>();
  for (const row of sections.get('CashReport')?.children ?? []) {
    if (row.attrs.currency === 'BASE_SUMMARY') continue;
    try {
      const a = row.attrs; const cur = currency(required(a, 'currency'));
      if (row.name !== 'CashReportCurrency' || a.accountId !== account) throw new Error('INVALID_CASH_REPORT');
      const cashFrom=date(a.fromDate),cashTo=date(a.toDate);
      if(!coversCashPeriod(from,to,cashFrom,cashTo,events.map(e=>e.date))) throw new Error('CASH_PERIOD_GAP');
      if (seen.has(cur)) throw new Error('DUPLICATE_CURRENCY'); seen.add(cur);
      const starting = units(required(a, 'startingCash')); const ending = units(required(a, 'endingCash')); const movement = sums.get(cur) ?? 0n;
      const difference = ending - starting - movement;
      balances.push({ currency: cur, starting: decimal(starting), ending: decimal(ending), movement: decimal(movement), difference: decimal(difference),from:cashFrom,to:cashTo });
      if (difference !== 0n) issue('CASH_MISMATCH', 'CashReport');
    } catch(error) { issue(error instanceof Error && error.message==='CASH_PERIOD_GAP' ? 'CASH_PERIOD_GAP' : 'INVALID_CASH_REPORT', 'CashReport'); }
  }
  if (!balances.length) issue('MISSING_BALANCES', 'CashReport');
  for (const cur of sums.keys()) if (!seen.has(cur)) issue('MISSING_CURRENCY_BALANCE', 'CashReport');
  return { account, from, to, events, issues, balances,
    totals: [...groups].map(([key, amount]) => { const [kind, currency] = JSON.parse(key) as string[]; return { kind, currency, amount: decimal(amount) }; }),
    sections: [...sections].map(([name, node]) => ({ name, count: node.children.length })) };
}

export function comparePreviews(current: Preview, previous?: Preview): Comparison {
  if (previous && previous.account !== current.account) fail('Reports belong to different accounts. Clear the preview to start again.');
  const before = new Map<string, PreviewEvent[]>(); const counts = new Map<string, number>();
  for (const e of previous?.events ?? []) {
    const group = before.get(e.key);
    if (group) group.push(e); else before.set(e.key, [e]);
  }
  for (const e of current.events) counts.set(e.key, (counts.get(e.key) ?? 0) + 1);
  const statuses = current.events.map(e => {
    const old = before.get(e.key);
    if (!e.key || !e.supported || counts.get(e.key)! > 1 || (old && (old.length > 1 || !old[0].supported))) return 'ambiguous';
    if (!old) return 'new';
    return old[0].signature === e.signature ? 'unchanged' : 'changed';
  });
  // Absence is informational only; never infer a cancellation or deletion.
  const removed = (previous?.events ?? []).filter(e => e.date >= current.from && e.date <= current.to && !counts.has(e.key)).length;
  return { statuses, removed };
}
