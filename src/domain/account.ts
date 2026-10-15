export interface AccountPortfolio { id: string; name: string }
export type CashKind = 'deposit' | 'withdrawal';
export interface CashEntry { id: string; portfolio_id: string; kind: CashKind; currency: string; amount: string; occurred_on: string; created_at: string }
export interface CashBalance { currency: string; amount: string }
export interface CashInput { requestId: string; portfolioId: string; kind: CashKind; currency: string; amount: string; date: string }
export type CashCursor = Pick<CashEntry, 'id' | 'occurred_on' | 'created_at'>;
export type PortfolioScope = 'all' | string;
export type CashFilter = 'all' | CashKind;

// Formatting never converts PostgreSQL decimal text to binary floating point.
export function exactAmount(amount: string): string {
  const [whole, fraction = ''] = amount.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (trimmed ? `.${trimmed}` : '');
}
