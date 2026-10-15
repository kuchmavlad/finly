import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountStore, parsePending, type AccountDependencies } from '../src/state/accountStore.ts';
import { exactAmount, type CashEntry, type CashInput } from '../src/domain/account.ts';

const portfolioId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const draft = { portfolioId, kind: 'deposit' as const, currency: 'USD', amount: '100.123456789012345678', date: '2023-01-01' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(overrides: Partial<AccountDependencies> = {}) {
  const saved = new Map<string, string>();
  const calls: CashInput[] = [];
  const deps: AccountDependencies = {
    loadPortfolios: async () => [{ id: portfolioId, name: 'Broker' }], loadBalances: async () => [], loadCashPage: async () => [],
    createPortfolio: async () => portfolioId, addCashEntry: async input => { calls.push(input); return requestId; },
    storage: { getItem: async key => saved.get(key) ?? null, setItem: async (key, value) => { saved.set(key, value); }, removeItem: async key => { saved.delete(key); } },
    pendingKey: 'project.user-a.pending-cash', uuid: () => requestId, ...overrides,
  };
  const store = new AccountStore(deps);
  return { store, deps, saved, calls, ready: async () => { await store.restorePending(); await store.refresh(); } };
}

test('decimal display and legacy pending retain precision', () => {
  assert.equal(exactAmount('999999999999999999.123456789012345678'), '999,999,999,999,999,999.123456789012345678');
  assert.equal(exactAmount('0.000000000000000001'), '0.000000000000000001');
  assert.equal(exactAmount('10.000'), '10');
  const input = { ...draft, requestId };
  assert.deepEqual(parsePending(JSON.stringify(input)), input);
  assert.throws(() => parsePending('{}'));
});

test('double press sends one persisted request; success with failed refresh is still success', async () => {
  const write = deferred<string>();
  let sends = 0;
  const h = harness({ addCashEntry: async () => { sends++; return write.promise; } });
  await h.ready();
  const first = h.store.save(draft);
  assert.equal(await h.store.save(draft), false);
  await Promise.resolve();
  assert.equal(sends, 1);
  assert.equal(h.saved.size, 1);
  h.deps.loadBalances = async () => { throw new Error('offline'); };
  write.resolve(requestId);
  assert.equal(await first, true);
  assert.equal(h.store.getSnapshot().pending, null);
  assert.equal(h.saved.size, 0);
  assert.equal(h.store.getSnapshot().message, 'Cash movement saved.');
  assert.match(h.store.getSnapshot().error, /refresh/);
});

test('lost response survives restart and reuses original payload despite changed draft', async () => {
  const h = harness();
  h.deps.addCashEntry = async input => { h.calls.push(input); throw new Error('lost response'); };
  await h.ready();
  assert.equal(await h.store.save(draft), false);
  h.store.dispose();
  const restarted = new AccountStore(h.deps);
  await restarted.restorePending();
  await restarted.refresh();
  h.deps.addCashEntry = async input => { h.calls.push(input); return requestId; };
  assert.equal(await restarted.save({ ...draft, amount: '500' }), true);
  assert.deepEqual(h.calls[0], h.calls[1]);
  assert.equal(h.saved.size, 0);
});

test('storage failure never sends; cleanup failure retries same request', async () => {
  const h = harness(); await h.ready();
  const set = h.deps.storage.setItem;
  h.deps.storage.setItem = async () => { throw new Error('keychain'); };
  assert.equal(await h.store.save(draft), false);
  assert.equal(h.calls.length, 0);
  h.deps.storage.setItem = set;
  const remove = h.deps.storage.removeItem;
  h.deps.storage.removeItem = async () => { throw new Error('keychain cleanup'); };
  assert.equal(await h.store.save(draft), false);
  assert.ok(h.store.getSnapshot().pending);
  h.deps.storage.removeItem = remove;
  assert.equal(await h.store.save(draft), true);
  assert.deepEqual(h.calls[0], h.calls[1]);
});

test('confirmed rejection unlocks editing; malformed recovery fails closed', async () => {
  const h = harness({ addCashEntry: async () => { throw { code: 'P0001', message: 'Insufficient recorded cash' }; } });
  await h.ready();
  assert.equal(await h.store.save(draft), false);
  assert.equal(h.store.getSnapshot().pending, null);
  assert.equal(h.saved.size, 0);
  h.saved.set(h.deps.pendingKey, '{}');
  await h.store.restorePending();
  assert.equal(h.store.getSnapshot().pendingReady, false);
  assert.equal(await h.store.save(draft), false);
});

test('user change cancels reads and a write waiting for local persistence; pending is user scoped', async () => {
  const h = harness(); await h.ready();
  const storage = deferred<void>();
  h.deps.storage.setItem = async () => storage.promise;
  const write = h.store.save(draft);
  h.store.dispose(); storage.resolve();
  assert.equal(await write, false);
  assert.equal(h.calls.length, 0);
  const other = new AccountStore({ ...h.deps, pendingKey: 'project.user-b.pending-cash' });
  await other.restorePending();
  assert.equal(other.getSnapshot().pending, null);
  const balances = deferred<{ currency: string; amount: string }[]>();
  const late = harness({ loadBalances: () => balances.promise });
  const refresh = late.store.refresh(); late.store.dispose();
  balances.resolve([{ currency: 'USD', amount: '123' }]); await refresh;
  assert.equal(late.store.getSnapshot().balances, null);
});

test('scope/filter changes discard stale pages and stale balances', async () => {
  const page = Array.from({ length: 50 }, (_, i) => ({ id: String(i), portfolio_id: portfolioId, kind: 'deposit', currency: 'USD', amount: '1', occurred_on: '2023-01-01', created_at: '2023-01-01T00:00:00Z' } as CashEntry));
  const more = deferred<CashEntry[]>();
  const h = harness({ loadCashPage: async (_scope, filter, cursor) => cursor ? more.promise : filter === 'withdrawal' ? [] : page });
  await h.ready();
  const loading = h.store.loadMore();
  h.store.setFilter('withdrawal');
  await h.store.refresh();
  more.resolve([{ ...page[0], id: 'old-page' }]); await loading;
  assert.deepEqual(h.store.getSnapshot().entries, []);
  h.store.setScope(portfolioId);
  assert.equal(h.store.getSnapshot().balances, null);
});

test('new account stays empty until creation returns its server ID; duplicate presses are blocked', async () => {
  const created = deferred<string>();
  let calls = 0;
  const h = harness({ loadPortfolios: async () => [], createPortfolio: async name => { assert.equal(name, 'New'); calls++; return created.promise; } });
  await h.ready();
  assert.deepEqual(h.store.getSnapshot().portfolios, []);
  const first = h.store.create(' New ');
  assert.equal(await h.store.create('New'), false);
  created.resolve(portfolioId);
  assert.equal(await first, true);
  assert.equal(calls, 1);
  assert.equal(h.store.getSnapshot().scope, portfolioId);
});

test('network error preserves known balances and entries; retry replaces them', async () => {
  const h = harness({ loadBalances: async () => [{ currency: 'EUR', amount: '1.000000000000000001' }] });
  await h.ready();
  h.deps.loadBalances = async () => { throw new Error('offline'); };
  await h.store.refresh();
  assert.equal(h.store.getSnapshot().balances?.[0].amount, '1.000000000000000001');
  assert.ok(h.store.getSnapshot().error);
  h.deps.loadBalances = async () => [{ currency: 'EUR', amount: '2' }];
  await h.store.refresh();
  assert.equal(h.store.getSnapshot().balances?.[0].amount, '2');
  assert.equal(h.store.getSnapshot().error, '');
});

test('authentication rejection and request conflict retain the original pending request', async () => {
  for (const message of ['Authentication required', 'Request ID already used with different values']) {
    const h = harness({ addCashEntry: async () => { throw { code: 'P0001', message }; } });
    await h.ready();
    assert.equal(await h.store.save(draft), false);
    assert.equal(h.store.getSnapshot().pending?.requestId, requestId);
    assert.equal(h.saved.size, 1);
  }
});

test('a write response after logout cannot remove the pending request of a later session', async () => {
  const response = deferred<string>();
  const h = harness({ addCashEntry: async () => response.promise });
  await h.ready();
  const saving = h.store.save(draft);
  await Promise.resolve();
  h.store.dispose();
  const replacement = JSON.stringify({ ...draft, requestId: '33333333-3333-4333-8333-333333333333' });
  h.saved.set(h.deps.pendingKey, replacement);
  response.resolve(requestId);
  assert.equal(await saving, false);
  assert.equal(h.saved.get(h.deps.pendingKey), replacement);
});
