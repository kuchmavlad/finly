import { createContext, createElement, useContext, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
const shared = { positive: '#A6DCB5', negative: '#F0A49C', warning: '#E7C68E', warningBorder: '#65573B', cash: '#89949F' };
const colors = { bg: '#101113', panel: '#1D1F23', elevated: '#2D3036', line: '#3E424A', text: '#F2F3F5', muted: '#ADB2BC', accent: '#E5E7EB', comparison: '#A4B8DA', ...shared };
type Palette = typeof colors;
const makeStyles = (colors: Palette) => StyleSheet.create({
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

const theme = { colors, styles: makeStyles(colors) };
const ThemeContext = createContext<typeof theme | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  return createElement(ThemeContext.Provider, { value: theme }, children);
}
export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('Missing theme provider');
  return theme;
}
