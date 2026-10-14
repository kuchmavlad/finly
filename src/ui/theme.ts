import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
const shared = { positive: '#A6DCB5', negative: '#F0A49C', warning: '#E7C68E', warningBorder: '#65573B', cash: '#89949F' };
export const palettes = {
  Blue: { bg: '#111318', panel: '#1B1F27', elevated: '#29313F', line: '#354052', text: '#F0F2F7', muted: '#A8B2C3', accent: '#91B9FF', comparison: '#DEC08C', ...shared },
  Lavender: { bg: '#141318', panel: '#211E29', elevated: '#302B3D', line: '#443B55', text: '#F3EFF8', muted: '#B7AEC7', accent: '#BCA7F5', comparison: '#83CED4', ...shared },
  Sand: { bg: '#181614', panel: '#25211D', elevated: '#363029', line: '#494036', text: '#F5F0E8', muted: '#BEB2A3', accent: '#DCC39A', comparison: '#9ABDE8', ...shared },
  Monochrome: { bg: '#101113', panel: '#1D1F23', elevated: '#2D3036', line: '#3E424A', text: '#F2F3F5', muted: '#ADB2BC', accent: '#E5E7EB', comparison: '#A4B8DA', ...shared },
  Green: { bg: '#101917', panel: '#192420', elevated: '#24332C', line: '#2C3B32', text: '#F1F1E8', muted: '#A2B0A6', accent: '#BFE4C8', comparison: '#C5B9E8', ...shared },
};
export type ThemeName = keyof typeof palettes;
export type Palette = typeof palettes.Blue;
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

const themes = Object.fromEntries(Object.entries(palettes).map(([name, colors]) => [name, { colors, styles: makeStyles(colors) }])) as Record<ThemeName, { colors: Palette; styles: ReturnType<typeof makeStyles> }>;
const ThemeContext = createContext<(typeof themes.Blue) & { theme: ThemeName; setTheme: (name: ThemeName) => void } | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>('Blue');
  const value = useMemo(() => ({ ...themes[theme], theme, setTheme }), [theme]);
  return createElement(ThemeContext.Provider, { value }, children);
}
export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('Missing theme provider');
  return theme;
}
