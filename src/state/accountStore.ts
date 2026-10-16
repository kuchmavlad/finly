import type { AccountPortfolio, CashBalance, CashEntry, CashFilter, CashInput, PortfolioScope } from '../domain/account.ts';
import { decimalAmount, operationDate } from '../domain/serverInput.ts';

interface Storage { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> }
export interface AccountDependencies {
  loadPortfolios(): Promise<AccountPortfolio[]>;
  loadBalances(scope: PortfolioScope): Promise<CashBalance[]>;
  loadCashPage(scope: PortfolioScope, filter: CashFilter, cursor?: CashEntry | null): Promise<CashEntry[]>;
  createPortfolio(name: string): Promise<string>;
  addCashEntry(input: CashInput): Promise<string>;
  storage: Storage; pendingKey: string; uuid(): string;
}
interface Snapshot {
  portfolios: AccountPortfolio[] | null; balances: CashBalance[] | null; entries: CashEntry[] | null;
  scope: PortfolioScope; filter: CashFilter; loading: boolean; loadingMore: boolean; hasMore: boolean;
  error: string; pageError: string; mutationError: string; message: string;
  pending: CashInput | null; pendingReady: boolean; busy: boolean;
}

export function parsePending(value: string): CashInput {
  const p = JSON.parse(value);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!p || !uuid.test(p.requestId) || !uuid.test(p.portfolioId) || !['deposit', 'withdrawal'].includes(p.kind)
    || typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency) || typeof p.amount !== 'string' || typeof p.date !== 'string') {
    throw new Error('Invalid pending operation');
  }
  decimalAmount(p.amount); operationDate(p.date);
  return { requestId: p.requestId, portfolioId: p.portfolioId, kind: p.kind, currency: p.currency, amount: p.amount, date: p.date };
}

// One instance per authenticated user. No module-level account cache.
export class AccountStore {
  private state: Snapshot = { portfolios: null, balances: null, entries: null, scope: 'all', filter: 'all', loading: true,
    loadingMore: false, hasMore: false, error: '', pageError: '', mutationError: '', message: '', pending: null, pendingReady: false, busy: false };
  private listeners = new Set<() => void>();
  private generation = 0;
  private active = true;
  private restoring = false;
  private deps: AccountDependencies;
  constructor(deps: AccountDependencies) { this.deps = deps; }
  activate() { this.active = true; }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<Snapshot>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  dispose() { this.active = false; this.generation++; this.listeners.clear(); }
  async restorePending() {
    if (!this.active || this.restoring || this.state.busy) return;
    this.restoring = true;
    try {
      const value = await this.deps.storage.getItem(this.deps.pendingKey);
      this.update({ pending: value ? parsePending(value) : null, pendingReady: true, mutationError: '' });
    } catch {
      this.update({ pendingReady: false, mutationError: 'Could not restore a pending operation. Retry recovery before recording cash.' });
    } finally { this.restoring = false; }
  }
  async refresh() {
    if (!this.active) return;
    const generation = ++this.generation;
    const { scope, filter } = this.state;
    this.update({ loading: true, error: '', pageError: '', loadingMore: false });
    try {
      const [portfolios, balances, entries] = await Promise.all([
        this.deps.loadPortfolios(), this.deps.loadBalances(scope), this.deps.loadCashPage(scope, filter),
      ]);
      if (!this.active || generation !== this.generation) return;
      this.update({ portfolios, balances, entries, loading: false, hasMore: entries.length === 50 });
    } catch {
      if (generation === this.generation) this.update({ loading: false, error: 'Could not refresh server data. Check your connection and try again. Previously loaded data may be out of date.' });
    }
  }
  setScope(scope: PortfolioScope) {
    if (scope === this.state.scope) return;
    this.update({ scope, balances: null, entries: null, hasMore: false });
    void this.refresh();
  }
  setFilter(filter: CashFilter) {
    if (filter === this.state.filter) return;
    this.update({ filter, entries: null, hasMore: false });
    void this.refresh();
  }
  async loadMore() {
    if (!this.active || this.state.loading || this.state.loadingMore || !this.state.hasMore || !this.state.entries?.length) return;
    const generation = this.generation;
    const { scope, filter, entries } = this.state;
    this.update({ loadingMore: true, pageError: '' });
    try {
      const page = await this.deps.loadCashPage(scope, filter, entries[entries.length - 1]);
      if (!this.active || generation !== this.generation) return;
      const known = new Set(entries.map(entry => entry.id));
      this.update({ entries: [...entries, ...page.filter(entry => !known.has(entry.id))], hasMore: page.length === 50, loadingMore: false });
    } catch {
      if (generation === this.generation) this.update({ loadingMore: false, pageError: 'Could not load more operations. Try again.' });
    }
  }
  async create(name: string): Promise<boolean> {
    if (!this.active || this.state.busy) return false;
    const normalized = name.trim();
    if (!normalized || normalized.length > 80) { this.update({ mutationError: 'Enter a portfolio name of 1–80 characters.' }); return false; }
    this.update({ busy: true, mutationError: '', message: '' });
    try {
      const id = await this.deps.createPortfolio(normalized);
      if (!this.active) return false;
      this.update({ scope: id, balances: null, entries: null, message: 'Portfolio saved.' });
      await this.refresh();
      return true;
    } catch {
      this.update({ mutationError: 'Could not confirm the portfolio. Retry with the same name to avoid creating another portfolio.' });
      return false;
    } finally { this.update({ busy: false }); }
  }
  async save(draft: Omit<CashInput, 'requestId'>): Promise<boolean> {
    if (!this.active || this.state.busy || !this.state.pendingReady) return false;
    this.update({ busy: true, mutationError: '', message: '' });
    try {
      let input = this.state.pending;
      if (!input) {
        if (!this.state.portfolios?.some(p => p.id === draft.portfolioId)) throw new Error('Select a portfolio.');
        if (!/^[A-Z]{3}$/.test(draft.currency)) throw new Error('Enter a three-letter currency code.');
        input = { ...draft, amount: decimalAmount(draft.amount), date: operationDate(draft.date), requestId: this.deps.uuid() };
        this.update({ pending: input });
      }
      // Fail closed if storage is unavailable; never send an unpersisted request.
      await this.deps.storage.setItem(this.deps.pendingKey, JSON.stringify(input));
      if (!this.active) return false;
      try { await this.deps.addCashEntry(input); }
      catch (failure) {
        if (!this.active) return false;
        if (failure && typeof failure === 'object' && 'code' in failure && failure.code === 'P0001'
          && 'message' in failure && ['Invalid cash entry', 'Amount must be positive', 'Portfolio unavailable', 'Insufficient recorded cash'].includes(String(failure.message))) {
          await this.deps.storage.removeItem(this.deps.pendingKey);
          this.update({ pending: null });
          throw new Error('Entry rejected. Check the portfolio, date and recorded cash. Future dates and insufficient cash are not allowed.');
        }
        throw failure;
      }
      if (!this.active) return false;
      // On cleanup failure, keep the same request. Retrying it is safe even after success.
      await this.deps.storage.removeItem(this.deps.pendingKey);
      if (!this.active) return false;
      this.update({ pending: null, message: 'Cash movement saved.' });
      await this.refresh(); // Refresh errors are not write failures.
      return true;
    } catch (failure) {
      this.update({ mutationError: this.state.pending
        ? 'Could not finish confirming this operation. Retry the pending operation with its original values; it will not be duplicated.'
        : failure instanceof Error ? failure.message : 'Could not save this operation. Please try again.' });
      return false;
    } finally { this.update({ busy: false }); }
  }
}
