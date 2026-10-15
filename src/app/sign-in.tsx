import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SignIn } from '../ui/SignIn';
import { useTheme } from '../ui/theme';
import { useAccount } from '../state/AccountContext';
import { supabase } from '../data/supabase';

export default function SignInScreen() {
  const { styles: s } = useTheme();
  const { error } = useAccount();
  return <SafeAreaView style={s.screen}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.content, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
        <View><Text style={s.title}>Welcome to Finly</Text><Text style={[s.muted, { marginTop: 8 }]}>Your investments, in one place.</Text></View>
        {supabase ? <SignIn /> : <Text style={s.text}>Account connection is not configured.</Text>}
        {error && <Text accessibilityRole="alert" style={s.muted}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
