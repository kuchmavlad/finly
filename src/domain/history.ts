import type { Currency, Dataset, PortfolioScope } from './models.ts';
import { summarize } from './ledger.ts';

export const HISTORY_DATES = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-13'];
const PRICE_PATH = [0.9, 0.92, 0.91, 0.94, 0.93, 0.96, 0.95, 0.98, 0.97, 1];
export function valueHistory(data: Dataset, scope: PortfolioScope, currency: Currency): number[] {
  return HISTORY_DATES.map((date, i) => {
    const assets = data.assets.map(asset => ({ ...asset,
      priceMinor: asset.priceMinor === null ? null : Math.round(asset.priceMinor * PRICE_PATH[i]),
      bond: asset.bond ? { ...asset.bond, cleanPriceBps: Math.round(asset.bond.cleanPriceBps * (0.98 + 0.02 * i / 9)), accruedMinor: Math.round(asset.bond.accruedMinor * i / 9) } : undefined,
    }));
    return summarize({ ...data, assets }, scope, currency, date).valueMinor;
  });
}
// Illustrative curves only. Not derived TWR/XIRR or licensed index market data.
export const INDEX_SAMPLE = [0, 1.1, -1.6, 2.8, 1.4, 4.9, 4.2, 7.1, 6.4, 9.2];
export const RETURN_SAMPLES: Record<PortfolioScope, number[]> = {
  all: [0, 0.8, -0.9, 2.1, 1.6, 4.2, 5.0, 7.3, 6.8, 10.4],
  ibkr: [0, 1.2, -2.1, 2.3, 1.1, 3.7, 3.1, 6.3, 5.1, 8.6],
  inzhur: [0, 0.5, 1.7, 3.2, 4.5, 6.8, 8.1, 9.5, 11.2, 14.4],
  bonds: [0, 1.0, 2.1, 3.4, 4.7, 5.9, 7.1, 8.3, 9.6, 10.8],
  empty: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
