import type { Currency } from '../domain/models';
export function money(minor: number, currency: Currency, compact = false): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: compact ? 0 : 2, minimumFractionDigits: compact ? 0 : 2 }).format(minor / 100);
}
export const percent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
export const dateLabel = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
