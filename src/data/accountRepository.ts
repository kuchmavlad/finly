import { requireSupabase } from './supabase';
import type { AccountPortfolio, CashBalance, CashCursor, CashEntry, CashFilter, CashInput, PortfolioScope } from '../domain/account';

export async function loadPortfolios(): Promise<AccountPortfolio[]> {
  const { data, error } = await requireSupabase().from('portfolios').select('id,name').order('created_at').order('id');
  if (error) throw error;
  return data;
}
export async function loadBalances(scope: PortfolioScope): Promise<CashBalance[]> {
  const { data, error } = await requireSupabase().rpc('cash_balances', { p_portfolio_id: scope === 'all' ? null : scope });
  if (error) throw error;
  return data;
}
export async function loadCashPage(scope: PortfolioScope, filter: CashFilter, cursor: CashCursor | null = null): Promise<CashEntry[]> {
  const { data, error } = await requireSupabase().rpc('cash_entries_page', {
    p_portfolio_id: scope === 'all' ? null : scope, p_kind: filter === 'all' ? null : filter,
    p_before_date: cursor?.occurred_on ?? null, p_before_created_at: cursor?.created_at ?? null,
    p_before_id: cursor?.id ?? null,
  });
  if (error) throw error;
  return data;
}
export async function createPortfolio(name: string): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_portfolio', { p_name: name.trim() });
  if (error) throw error;
  return data;
}
export async function addCashEntry(input: CashInput): Promise<string> {
  const { data, error } = await requireSupabase().rpc('add_cash_entry', {
    p_request_id: input.requestId, p_portfolio_id: input.portfolioId,
    p_kind: input.kind, p_currency: input.currency, p_amount: input.amount, p_date: input.date,
  });
  if (error) throw error;
  return data;
}
