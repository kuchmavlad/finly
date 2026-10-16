// Bounded signed decimals; never convert financial values to Number.
const SCALE = 10n ** 18n;
export function units(value: string): bigint {
  if (!/^-?(0|[1-9]\d{0,17})(\.\d{1,18})?$/.test(value)) throw new Error('INVALID_DECIMAL');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  return (BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, '0'))) * (negative ? -1n : 1n);
}
export function decimal(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString().padStart(19, '0');
  const fraction = digits.slice(-18).replace(/0+$/, '');
  return sign + digits.slice(0, -18) + (fraction ? '.' + fraction : '');
}
