import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { requireSupabase } from '../data/supabase';
import { Button } from './components';
import { useTheme } from './theme';

export function SignIn() {
  const { styles: s, colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const resendAfter = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current) return;
    if (registering && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (registering && password.length < 8) { setError('Use at least 8 characters for your password.'); return; }
    if (registering && password !== confirmation) { setError('Passwords do not match.'); return; }
    submitting.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const auth = requireSupabase().auth;
      const { data, error } = registering
        ? await auth.signUp({ email: email.trim(), password })
        : await auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword('');
      setConfirmation('');
      if (registering && !data.session) {
        setConfirmationEmail(email.trim());
        resendAfter.current = Date.now() + 60_000;
        setRegistering(false);
        setNotice('Check your inbox and spam folder for a confirmation email. After confirming, return here and sign in. If you already have an account, sign in with your existing password.');
      }
    } catch (failure) {
      const code = failure && typeof failure === 'object' && 'code' in failure ? failure.code : '';
      if (code === 'email_not_confirmed') {
        setConfirmationEmail(email.trim());
        setError('Confirm your email before signing in. Check your inbox and spam folder.');
      }
      else if (code === 'over_email_send_rate_limit') setError('The email service has reached its sending limit. Please try again later. Repeated attempts will not send another email.');
      else if (code === 'over_request_rate_limit') setError('Too many attempts. Please wait before trying again.');
      else if (code === 'weak_password') setError('Choose a stronger password with a mix of letters, numbers and symbols.');
      else setError(registering ? 'Could not create an account. Check your details and connection, or sign in if you already have an account.' : 'Could not sign in. Check your email, password and connection.');
    }
    finally { submitting.current = false; setBusy(false); }
  };
  const resendConfirmation = async () => {
    if (submitting.current || !confirmationEmail) return;
    if (Date.now() < resendAfter.current) {
      setError('Please wait a minute before requesting another confirmation email.');
      return;
    }
    submitting.current = true; setBusy(true); setError(''); setNotice('');
    resendAfter.current = Date.now() + 60_000;
    try {
      const { error } = await requireSupabase().auth.resend({ type: 'signup', email: confirmationEmail });
      if (error) throw error;
      setNotice('If this account is awaiting confirmation, a new email has been sent. Check your inbox and spam folder.');
    } catch (failure) {
      const code = failure && typeof failure === 'object' && 'code' in failure ? failure.code : '';
      setError(code === 'over_email_send_rate_limit'
        ? 'The email service has reached its sending limit. Please try again later. Repeated attempts will not send another email.'
        : 'Could not resend the confirmation email. Check your connection and try again later.');
    } finally { submitting.current = false; setBusy(false); }
  };
  return <View style={s.card}>
    <Text style={s.heading}>{registering ? 'Create account' : 'Sign in'}</Text>
    <Text style={s.muted}>{registering ? 'Use your email and a password of at least 8 characters.' : 'Enter your email and password to continue.'}</Text>
    {notice ? <Text accessibilityRole="alert" style={s.text}>{notice}</Text> : null}
    <TextInput accessibilityLabel="Email" placeholder="Email" placeholderTextColor={colors.muted} style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" editable={!busy} />
    <TextInput key={registering ? 'new-password' : 'current-password'} accessibilityLabel="Password" placeholder="Password" placeholderTextColor={colors.muted} style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={registering ? 'new-password' : 'current-password'} editable={!busy} />
    {registering && <TextInput accessibilityLabel="Confirm password" placeholder="Confirm password" placeholderTextColor={colors.muted} style={s.input} value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!busy} />}
    {error ? <Text accessibilityRole="alert" style={s.muted}>{error}</Text> : null}
    <Button title={busy ? (registering ? 'Creating account…' : 'Signing in…') : (registering ? 'Create account' : 'Sign in')} disabled={busy || !email.trim() || !password || (registering && !confirmation)} onPress={() => void submit()} />
    {!registering && confirmationEmail && confirmationEmail === email.trim() ? <Button title="Resend confirmation email" secondary disabled={busy} onPress={() => void resendConfirmation()} /> : null}
    <Button title={registering ? 'Already have an account? Sign in' : 'New to Finly? Create account'} secondary disabled={busy} onPress={() => {
      if (submitting.current) return;
      setRegistering(!registering); setPassword(''); setConfirmation(''); setError(''); setNotice('');
    }} />
    <Text style={s.muted}>For access recovery during the private pilot, contact the project owner.</Text>
  </View>;
}
