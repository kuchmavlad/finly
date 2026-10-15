import { createClient, processLock } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Web preview keeps credentials in memory only; native sessions use Keychain/Keystore.
const webSession = new Map<string, string>();
export const deviceStorage = {
  getItem: (name: string) => Platform.OS === 'web'
    ? Promise.resolve(webSession.get(name) ?? null) : SecureStore.getItemAsync(name),
  setItem: async (name: string, value: string) => {
    if (Platform.OS === 'web') webSession.set(name, value);
    else await SecureStore.setItemAsync(name, value);
  },
  removeItem: async (name: string) => {
    if (Platform.OS === 'web') webSession.delete(name);
    else await SecureStore.deleteItemAsync(name);
  },
};

export const supabase = url && key ? createClient(url, key, {
  auth: { storage: deviceStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: processLock },
}) : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Account connection is not configured.');
  return supabase;
}

export const pendingCashKey = (userId: string) => `finly.${url ? new URL(url).hostname : 'unconfigured'}.${userId}.pending-cash`;
