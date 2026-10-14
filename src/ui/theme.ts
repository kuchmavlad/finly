import { StyleSheet } from 'react-native';
export const colors = { bg: '#101917', panel: '#192420', elevated: '#24332C', line: '#2C3B32', text: '#F1F1E8', muted: '#A2B0A6', mint: '#BFE4C8', red: '#ECA69C', gold: '#E7C68E', lavender: '#C5B9E8' };
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32, gap: 24, width: '100%', maxWidth: 640, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: colors.text, fontSize: 30, fontWeight: '600', letterSpacing: -0.8 },
  heading: { color: colors.text, fontSize: 19, fontWeight: '600', letterSpacing: -0.3 },
  text: { color: colors.text, fontSize: 15, lineHeight: 23 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 1.7, textTransform: 'uppercase' },
  card: { backgroundColor: colors.panel, borderRadius: 22, padding: 20, gap: 16 },
  divider: { height: 1, backgroundColor: colors.line },
  chip: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 13, backgroundColor: colors.panel, justifyContent: 'center', alignItems: 'center' },
  input: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 15, fontSize: 16, color: colors.text, minHeight: 52 },
});
