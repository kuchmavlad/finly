import { operationDate } from './serverInput.ts';

export function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Calendar selections are civil dates, not UTC timestamps. Noon avoids DST midnight gaps.
export function calendarDate(value: string): Date {
  operationDate(value);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function latestOperationDate(now = new Date()): string {
  // The write RPC rejects dates later than the server's UTC day.
  const local = localDateString(now);
  const utc = now.toISOString().slice(0, 10);
  return local < utc ? local : utc;
}
