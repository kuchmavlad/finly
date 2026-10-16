import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../ui/components';
import { useTheme } from '../ui/theme';
import { requireSupabase } from '../data/supabase';

export default function Settings() {
  const { styles: s } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const signOut = async () => {
    if (lock.current) return;
    lock.current = true; setSigningOut(true); setError('');
    try {
      const { error: failure } = await requireSupabase().auth.signOut({ scope: 'local' });
      if (failure) throw failure;
    } catch { setError('Could not sign out. Please try again.'); }
    finally { lock.current = false; setSigningOut(false); }
  };
  return <ScrollView style={s.screen} contentContainerStyle={s.content}><Text style={s.title}>Settings</Text>
    <Button title="Manage portfolios" secondary onPress={() => router.push('/account')} />
    <View style={s.card}><Text style={s.heading}>About Finly</Text><Text style={s.muted}>Portfolios and cash movements are saved to your account. Cash balances use original currencies; currency conversion is not available yet.</Text><Text style={s.muted}>No broker is connected. Holdings, prices, imports and investment performance are not available yet.</Text></View>
    <View style={{ marginTop: 16 }}>{error ? <Text accessibilityRole="alert" style={s.muted}>{error}</Text> : null}<Button title={signingOut ? 'Signing out…' : 'Sign out'} secondary disabled={signingOut} onPress={() => void signOut()} /></View>
  </ScrollView>;
}
