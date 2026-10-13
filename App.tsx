import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>FINLY / DEMO</Text>
      <Text style={styles.title}>Your investments.{ '\n' }A clearer view.</Text>
      <Text style={styles.description}>Your preview is connected. This first screen checks that Finly runs on your iPhone.</Text>
      <Pressable accessibilityRole="button" onPress={() => setConfirmed(true)} style={({ pressed }) => [styles.button, { opacity: pressed ? 0.75 : 1 }]}>
        <Text style={styles.buttonText}>{confirmed ? 'Connection confirmed' : 'Test connection'}</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.note}>{confirmed ? 'Everything is ready for the next step.' : 'Setup preview · No real financial data'}</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101918',
    paddingHorizontal: 28,
    justifyContent: 'center',
  },
  label: { color: '#9FD9BF', fontSize: 13, letterSpacing: 3, marginBottom: 28 },
  title: { color: '#F1F4EF', fontSize: 36, fontWeight: '600', lineHeight: 44 },
  description: { color: '#A4B5AC', fontSize: 16, lineHeight: 25, marginTop: 20 },
  button: { backgroundColor: '#B6E4C8', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 36 },
  buttonText: { color: '#142C23', fontSize: 16, fontWeight: '600' },
  note: { color: '#A4B5AC', fontSize: 12, marginTop: 18, textAlign: 'center' },
});
