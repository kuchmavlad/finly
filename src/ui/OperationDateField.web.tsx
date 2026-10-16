import { latestOperationDate } from '../domain/calendarDate';
import { useTheme } from './theme';

export default function OperationDateField({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled: boolean }) {
  const { colors } = useTheme();
  return <input type="date" aria-label="Operation date" value={value} disabled={disabled}
    min="1900-01-01" max={latestOperationDate()} onChange={event => onChange(event.target.value)}
    style={{ colorScheme: 'dark', color: colors.text, background: colors.panel, border: `1px solid ${colors.line}`, borderRadius: 14, padding: 15, minHeight: 52, fontSize: 16, boxSizing: 'border-box', width: '100%' }} />;
}
