import { requireSupabase } from './supabase';

export interface AccountPortfolio { id: string; name: string }
export interface CashEntry { id: string; portfolio_id: string; kind: 'deposit' | 'withdrawal'; currency: string; amount: string; occurred_on: string }

export async function loadAccount() {
  const client = requireSupabase();
  const [portfolios, entries] = await Promise.all([
    client.from('portfolios').select('id,name').order('created_at'),
    client.rpc('list_cash_entries').limit(100),
  ]);
  if (portfolios.error) throw portfolios.error;
  if (entries.error) throw entries.error;
  return { portfolios: portfolios.data as AccountPortfolio[], entries: entries.data as CashEntry[] };
}

export async function createPortfolio(name: string) {
  const { error } = await requireSupabase().rpc('create_portfolio', { p_name: name.trim() });
  if (error) throw error;
}

export interface CashInput { requestId: string; portfolioId: string; kind: 'deposit' | 'withdrawal'; currency: string; amount: string; date: string }
export async function addCashEntry(input: CashInput) {
  const { error } = await requireSupabase().rpc('add_cash_entry', {
    p_request_id: input.requestId, p_portfolio_id: input.portfolioId,
    p_kind: input.kind, p_currency: input.currency, p_amount: input.amount, p_date: input.date,
  });
  if (error) throw error;
}
