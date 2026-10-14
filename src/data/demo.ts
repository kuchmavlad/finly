import type { Dataset, Operation, OperationInput } from '../domain/models.ts';
import { validateOperation } from '../domain/ledger.ts';

export const AS_OF = '2026-10-13';
const event = (id: string, portfolioId: Operation['portfolioId'], kind: Operation['kind'], currency: Operation['currency'], amountMinor: number, date: string, assetId?: string, quantity?: number): Operation => ({ id, portfolioId, kind, currency, amountMinor, date, assetId, quantity, source: portfolioId === 'ibkr' ? 'demo-import' : 'manual' });
export const seed: Dataset = {
  asOf: AS_OF,
  portfolios: [
    { id: 'ibkr', name: 'Interactive Brokers', subtitle: 'Global markets', color: '#BFE4C8' },
    { id: 'inzhur', name: 'Inzhur', subtitle: 'Fund certificates', color: '#C5B9E8' },
    { id: 'bonds', name: 'Ukrainian bonds', subtitle: 'OVGZ · UAH', color: '#E7C68E' },
    { id: 'empty', name: 'New portfolio', subtitle: 'Your next investment', color: '#98B8CA' },
  ],
  assets: [
    { id: 'aapl', symbol: 'AAPL', name: 'Apple', kind: 'Stock', portfolioId: 'ibkr', currency: 'USD', priceMinor: 22450, priceDate: AS_OF, color: '#BFE4C8' },
    { id: 'vti', symbol: 'VTI', name: 'Vanguard Total Stock Market', kind: 'ETF', portfolioId: 'ibkr', currency: 'USD', priceMinor: 29600, priceDate: AS_OF, color: '#98B8CA' },
    { id: 'bnd', symbol: 'BND', name: 'Vanguard Total Bond Market', kind: 'ETF', portfolioId: 'ibkr', currency: 'USD', priceMinor: 7210, priceDate: AS_OF, color: '#C5B9E8' },
    { id: 'ust', symbol: 'UST 2028', name: 'US Treasury · 4.25%', kind: 'Bond', portfolioId: 'ibkr', currency: 'USD', priceMinor: 100080, priceDate: AS_OF, color: '#E7C68E', bond: { faceMinor: 100000, cleanPriceBps: 9920, accruedMinor: 880, couponBps: 425, maturity: '2028-11-15', frequency: 'Semiannual' } },
    { id: 'inzhur', symbol: 'INZHUR', name: 'Inzhur · demo fund', kind: 'Fund', portfolioId: 'inzhur', currency: 'UAH', priceMinor: 112000, priceDate: '2026-09-01', color: '#C5B9E8' },
    { id: 'ovgz', symbol: 'OVGZ 2027', name: 'Ukraine government · 16%', kind: 'OVGZ', portfolioId: 'bonds', currency: 'UAH', priceMinor: 103200, priceDate: '2026-10-01', color: '#E7C68E', bond: { faceMinor: 100000, cleanPriceBps: 10000, accruedMinor: 3200, couponBps: 1600, maturity: '2027-06-16', frequency: 'Semiannual' } },
  ],
  operations: [
    event('01', 'ibkr', 'deposit', 'USD', 2000000, '2026-01-01'),
    event('02', 'ibkr', 'buy', 'USD', 600000, '2026-01-03', 'aapl', 30),
    event('03', 'ibkr', 'buy', 'USD', 780000, '2026-01-03', 'vti', 30),
    event('04', 'ibkr', 'buy', 'USD', 375000, '2026-01-04', 'bnd', 50),
    event('05', 'ibkr', 'buy', 'USD', 196000, '2026-01-04', 'ust', 2),
    event('06', 'ibkr', 'fee', 'USD', 800, '2026-01-04'),
    event('07', 'inzhur', 'deposit', 'UAH', 21000000, '2026-01-01'),
    event('08', 'inzhur', 'buy', 'UAH', 20000000, '2026-01-05', 'inzhur', 200),
    event('09', 'bonds', 'deposit', 'UAH', 16000000, '2026-01-01'),
    event('10', 'bonds', 'buy', 'UAH', 15000000, '2026-01-06', 'ovgz', 150),
    event('11', 'ibkr', 'dividend', 'USD', 18000, '2026-03-25', 'vti'),
    event('12', 'ibkr', 'dividend', 'USD', 750, '2026-04-15', 'aapl'),
    event('13', 'ibkr', 'deposit', 'USD', 200000, '2026-05-01'),
    event('14', 'ibkr', 'coupon', 'USD', 4250, '2026-05-15', 'ust'),
    event('15', 'bonds', 'coupon', 'UAH', 1200000, '2026-06-16', 'ovgz'),
    event('16', 'inzhur', 'dividend', 'UAH', 900000, '2026-06-30', 'inzhur'),
    event('17', 'ibkr', 'sell', 'USD', 115000, '2026-07-10', 'aapl', 5),
    event('18', 'ibkr', 'fee', 'USD', 200, '2026-07-10'),
    event('19', 'ibkr', 'dividend', 'USD', 12500, '2026-08-20', 'bnd'),
    event('20', 'ibkr', 'withdrawal', 'USD', 50000, '2026-09-01'),
    event('21', 'ibkr', 'dividend', 'USD', 21000, '2026-09-25', 'vti'),
  ],
};

export interface PortfolioRepository {
  load(): Promise<Dataset>;
  add(input: OperationInput): Promise<Dataset>;
  reset(): Promise<Dataset>;
}
const clone = (data: Dataset): Dataset => JSON.parse(JSON.stringify(data));
export function createDemoRepository(): PortfolioRepository {
  let data = clone(seed);
  let sequence = 0;
  return {
    async load() { return clone(data); },
    async add(input) {
      validateOperation(data, input);
      data.operations.push({ ...input, id: `manual-${++sequence}`, source: 'manual' });
      return clone(data);
    },
    async reset() { data = clone(seed); return clone(data); },
  };
}
