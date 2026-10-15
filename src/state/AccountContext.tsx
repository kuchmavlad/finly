import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../data/supabase';

const Context = createContext<{ session: Session | null; loading: boolean; error: string | null }>({ session: null, loading: true, error: null });

export function AccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let authEvent = false;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => {
      authEvent = true;
      if (active) { setSession(next); setLoading(false); setError(null); }
    });
    client.auth.getSession().then(({ data, error: failure }) => {
      if (!active || authEvent) return;
      setSession(data.session); setLoading(false);
      if (failure) setError('Could not restore your session. Please sign in again.');
    }).catch(() => {
      if (active && !authEvent) { setLoading(false); setError('Could not restore your session. Please sign in again.'); }
    });
    const refresh = (state: string) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    if (Platform.OS !== 'web') refresh(AppState.currentState);
    const listener = Platform.OS !== 'web' ? AppState.addEventListener('change', refresh) : null;
    return () => { active = false; subscription.unsubscribe(); listener?.remove(); if (Platform.OS !== 'web') client.auth.stopAutoRefresh(); };
  }, []);
  return <Context.Provider value={{ session, loading, error }}>{children}</Context.Provider>;
}

export const useAccount = () => useContext(Context);
