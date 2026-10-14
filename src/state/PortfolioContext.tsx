import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createDemoRepository } from '../data/demo';
import type { Currency, Dataset, DemoState, OperationInput, PortfolioScope } from '../domain/models';

const repository = createDemoRepository();
function usePortfolioState() {
  const [data, setData] = useState<Dataset | null>(null);
  const [scope, setScope] = useState<PortfolioScope>('all');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [state, setState] = useState<DemoState>('loading');
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    setState('loading');
    try {
      const next = await repository.load();
      if (current === request.current) { setData(next); setState('ready'); }
    } catch { if (current === request.current) setState('error'); }
  }, []);
  useEffect(() => {
    let active = true;
    repository.load().then(next => { if (active) { setData(next); setState('ready'); } }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, []);
  const add = async (input: OperationInput) => { setData(await repository.add(input)); };
  const reset = async () => { setData(await repository.reset()); setScope('all'); setState('ready'); };
  const displayedData = data && (state === 'missing' || state === 'stale') ? {
    ...data,
    assets: data.assets.map(a => ({ ...a, priceMinor: state === 'missing' ? null : a.priceMinor, priceDate: '2026-01-01' })),
  } : data;
  return { data: displayedData, scope, setScope, currency, setCurrency, state, setState, refresh, add, reset };
}
const Context = createContext<ReturnType<typeof usePortfolioState> | null>(null);
export function PortfolioProvider({ children }: { children: ReactNode }) { return <Context.Provider value={usePortfolioState()}>{children}</Context.Provider>; }
export function usePortfolio() { const context = useContext(Context); if (!context) throw new Error('Missing portfolio provider'); return context; }
