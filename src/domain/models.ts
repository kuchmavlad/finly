export type Currency = 'USD' | 'UAH';
export type PortfolioId = 'ibkr' | 'inzhur' | 'bonds' | 'empty';
export type PortfolioScope = PortfolioId | 'all';
export type OperationKind = 'deposit' | 'withdrawal' | 'buy' | 'sell' | 'dividend' | 'coupon' | 'fee';
export type AssetKind = 'Stock' | 'ETF' | 'Bond' | 'OVGZ' | 'Fund';
export interface Portfolio { id: PortfolioId; name: string; subtitle: string; color: string }
export interface Asset {
  id: string; symbol: string; name: string; kind: AssetKind; portfolioId: PortfolioId;
  currency: Currency; priceMinor: number | null; priceDate: string; color: string;
  bond?: { faceMinor: number; cleanPriceBps: number; accruedMinor: number; couponBps: number; maturity: string; frequency: string };
}
export interface Operation {
  id: string; portfolioId: PortfolioId; kind: OperationKind; currency: Currency;
  amountMinor: number; date: string; assetId?: string; quantity?: number;
  source: 'demo-import' | 'manual'; note?: string;
}
export type OperationInput = Omit<Operation, 'id' | 'source'>;
export interface Dataset { portfolios: Portfolio[]; assets: Asset[]; operations: Operation[]; asOf: string }
export interface Position { asset: Asset; quantity: number; costMinor: number; valueMinor: number | null }
export interface Summary {
  positions: Position[]; cash: Record<Currency, number>; valueMinor: number; costMinor: number;
  netContributionsMinor: number; profitMinor: number; realizedMinor: number; unrealizedMinor: number;
  incomeMinor: number; feesMinor: number; missingPrices: boolean;
}
export type DemoState = 'ready' | 'loading' | 'error' | 'stale' | 'missing';
