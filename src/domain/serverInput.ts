// Keep decimal input as text all the way to PostgreSQL; never round through Number.
export function decimalAmount(input: string): string {
  const value = input.trim().replace(',', '.');
  if (!/^(0|[1-9]\d{0,17})(\.\d{1,18})?$/.test(value) || !/[1-9]/.test(value)) {
    throw new Error('Enter a positive amount, with up to 18 digits before and after the decimal point.');
  }
  return value;
}

export function operationDate(input: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error('Use a valid date: YYYY-MM-DD.');
  const date = new Date(`${input}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input || input < '1900-01-01') {
    throw new Error('Use a valid date on or after 1900-01-01.');
  }
  return input;
}
