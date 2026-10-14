import type { Asset, Currency, Dataset, Operation, OperationInput, PortfolioScope, Summary } from './models.ts';

export const DEMO_FX = 42; // Fixed illustrative USD/UAH rate, never a live FX quote.
export function mulDiv(value: number, numerator: number, denominator: number): number {
  if (![value, numerator, denominator].every(Number.isSafeInteger) || denominator <= 0) throw new Error('Invalid amount');
  const product = BigInt(value) * BigInt(numerator);
  const sign = product < 0n ? -1n : 1n;
  const rounded = sign * ((product * sign + BigInt(Math.floor(denominator / 2))) / BigInt(denominator));
  const result = Number(rounded);
  if (!Number.isSafeInteger(result)) throw new Error('Amount exceeds supported range');
  return result;
}
export function convert(amount: number, from: Currency, to: Currency): number {
  return from === to ? amount : from === 'USD' ? mulDiv(amount, DEMO_FX, 1) : mulDiv(amount, 1, DEMO_FX);
}
export function parseAmount(text: string): number {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalized)) throw new Error('Enter a positive amount with up to 2 decimal places.');
  const [whole, fraction = ''] = normalized.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount <= 0) throw new Error('Amount must be greater than zero.');
  return amount;
}
export function unitValue(asset: Asset): number | null {
  if (asset.priceMinor === null) return null;
  return asset.bond ? mulDiv(asset.bond.faceMinor, asset.bond.cleanPriceBps, 10000) + asset.bond.accruedMinor : asset.priceMinor;
}
export function summarize(data: Dataset, scope: PortfolioScope, currency: Currency, until = data.asOf): Summary {
  const included = (id: string) => scope === 'all' || id === scope;
  const cash = { USD: 0, UAH: 0 };
  const balances = new Map<string, { quantity: number; cost: number }>();
  let realizedMinor = 0, incomeMinor = 0, feesMinor = 0, netContributionsMinor = 0;
  const operations = data.operations.filter(o => included(o.portfolioId) && o.date <= until).sort((a, b) => a.date.localeCompare(b.date));
  for (const op of operations) {
    const amount = convert(op.amountMinor, op.currency, currency);
    const outgoing = ['buy', 'withdrawal', 'fee'].includes(op.kind);
    cash[op.currency] += outgoing ? -op.amountMinor : op.amountMinor;
    if (op.kind === 'deposit') netContributionsMinor += amount;
    if (op.kind === 'withdrawal') netContributionsMinor -= amount;
    if (op.kind === 'fee') feesMinor += amount;
    if (op.kind === 'dividend' || op.kind === 'coupon') incomeMinor += amount;
    if (op.assetId && (op.kind === 'buy' || op.kind === 'sell')) {
      const p = balances.get(op.assetId) ?? { quantity: 0, cost: 0 };
      const quantity = op.quantity ?? 0;
      if (op.kind === 'buy') { p.quantity += quantity; p.cost += op.amountMinor; }
      else {
        if (quantity > p.quantity || p.quantity <= 0) throw new Error('Cannot sell more units than held.');
        const costSold = mulDiv(p.cost, quantity, p.quantity);
        p.quantity -= quantity; p.cost -= costSold;
        realizedMinor += convert(op.amountMinor - costSold, op.currency, currency);
      }
      balances.set(op.assetId, p);
    }
  }
  const positions = data.assets.filter(a => included(a.portfolioId) && (balances.get(a.id)?.quantity ?? 0) > 0).map(asset => {
    const p = balances.get(asset.id)!;
    const price = unitValue(asset);
    return { asset, quantity: p.quantity, costMinor: convert(p.cost, asset.currency, currency), valueMinor: price === null ? null : convert(mulDiv(price, p.quantity, 1), asset.currency, currency) };
  });
  const valueMinor = positions.reduce((sum, p) => sum + (p.valueMinor ?? 0), 0) + convert(cash.USD, 'USD', currency) + convert(cash.UAH, 'UAH', currency);
  const costMinor = positions.reduce((sum, p) => sum + p.costMinor, 0);
  const unrealizedMinor = positions.reduce((sum, p) => sum + (p.valueMinor === null ? 0 : p.valueMinor - p.costMinor), 0);
  return { positions, cash, valueMinor, costMinor, netContributionsMinor, profitMinor: realizedMinor + unrealizedMinor + incomeMinor - feesMinor, realizedMinor, unrealizedMinor, incomeMinor, feesMinor, missingPrices: positions.some(p => p.valueMinor === null) };
}

export function validateOperation(data: Dataset, input: OperationInput): void {
  if (!data.portfolios.some(p => p.id === input.portfolioId)) throw new Error('Choose a portfolio.');
  if (!['deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'coupon', 'fee'].includes(input.kind)) throw new Error('Unknown operation type.');
  if (!['USD', 'UAH'].includes(input.currency)) throw new Error('Unsupported currency.');
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > 99999999999) throw new Error('Enter a valid positive amount.');
  const date = new Date(input.date + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date || input.date < '2026-01-01' || input.date > data.asOf) throw new Error('Use a date from 2026-01-01 to ' + data.asOf + '.');
  const needsAsset = ['buy', 'sell', 'dividend', 'coupon'].includes(input.kind);
  const asset = data.assets.find(a => a.id === input.assetId);
  if (needsAsset && (!asset || asset.portfolioId !== input.portfolioId || asset.currency !== input.currency)) throw new Error('Choose an asset in this portfolio and its original currency.');
  if (input.kind === 'coupon' && !asset?.bond) throw new Error('Coupons require a bond.');
  if (input.kind === 'dividend' && asset?.bond) throw new Error('Choose Coupon for a bond payment.');
  if (['buy', 'sell'].includes(input.kind) && (!Number.isSafeInteger(input.quantity) || (input.quantity ?? 0) < 1 || (input.quantity ?? 0) > 1000000)) throw new Error('Enter 1–1,000,000 whole units for this demo.');
  // Replay the full ledger with the proposed entry: historical edits must not create a later shortfall.
  const trial: Operation = { ...input, id: 'validation', source: 'manual' };
  const ordered = [...data.operations, trial].filter(o => o.portfolioId === input.portfolioId).sort((a, b) => a.date.localeCompare(b.date));
  const cash: Record<Currency, number> = { USD: 0, UAH: 0 };
  const units: Record<string, number> = {};
  for (const op of ordered) {
    cash[op.currency] += (['buy', 'withdrawal', 'fee'].includes(op.kind) ? -1 : 1) * op.amountMinor;
    if (cash[op.currency] < 0) throw new Error('Not enough ' + op.currency + ' cash on or after this date. Add a deposit first.');
    if (op.assetId && (op.kind === 'buy' || op.kind === 'sell')) {
      units[op.assetId] = (units[op.assetId] ?? 0) + (op.kind === 'buy' ? 1 : -1) * (op.quantity ?? 0);
      if (units[op.assetId] < 0) throw new Error('Not enough units on or after this date.');
    }
  }
}
