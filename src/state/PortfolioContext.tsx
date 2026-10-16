import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';
import * as repository from '../data/accountRepository';
import { deviceStorage, pendingCashKey } from '../data/supabase';
import { AccountStore } from './accountStore';
import { useAccount } from './AccountContext';

const Context = createContext<AccountStore | null>(null);
export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { session } = useAccount();
  const userId = session?.user.id;
  const [store] = useState(() => new AccountStore({ ...repository, storage: deviceStorage, pendingKey: pendingCashKey(userId ?? 'signed-out'), uuid: randomUUID }));
  useEffect(() => {
    if (!userId) return;
    store.activate();
    void store.restorePending();
    void store.refresh();
    return () => store.dispose();
  }, [store, userId]);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function usePortfolio() {
  const store = useContext(Context);
  if (!store) throw new Error('Missing portfolio provider');
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...state, store };
}
