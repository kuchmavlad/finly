import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { pickReport } from '../data/pickReport';
import { comparePreviews, parsePreview, ReportError, type Preview, type Comparison } from '../domain/ibkr/preview';
import { Button, Notice } from '../ui/components';
import { useTheme } from '../ui/theme';
import { exactAmount } from '../domain/account';

type Loaded = { name: string; report: Preview };
const PAGE_SIZE = 25;
export default function ImportPreview() {
  const { styles: s, colors } = useTheme();
  const [base, setBase] = useState<Loaded | null>(null);
  const [current, setCurrent] = useState<Loaded | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [page, setPage] = useState(0);
  const generation = useRef(0); const locked = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const clear = () => {
    generation.current++; locked.current = false; setBusy(false); setBase(null); setCurrent(null); setComparison(null); setPage(0); setError('');
  };
  const load = async () => {
    if (locked.current) return;
    locked.current = true; const token = ++generation.current; setBusy(true); setError('');
    try {
      const input = await pickReport();
      if (!input || token !== generation.current) return;
      const report = await parsePreview(input.xml, () => token !== generation.current);
      if (token !== generation.current) return;
      const diff = comparePreviews(report, base?.report);
      const loaded = { name: input.name, report };
      if (!base) setBase(loaded);
      setCurrent(loaded); setComparison(diff); setPage(0);
    } catch (failure) {
      if (token === generation.current) setError(failure instanceof ReportError ? failure.message : 'Could not read this report. Try exporting it again.');
    } finally { if (token === generation.current) { locked.current = false; setBusy(false); } }
  };
  const report = current?.report;
  const pages = Math.max(1, Math.ceil((report?.events.length ?? 0) / PAGE_SIZE));
  return <ScrollView style={s.screen} contentContainerStyle={s.content}>
    <Text style={s.title}>IBKR report preview</Text>
    <Text style={s.muted}>Check an Activity Flex XML, then compare another report with the first. Reports stay on this device during this screen session. No operations are saved or sent to the server.</Text>
    <Button title={base ? 'Compare another XML' : 'Choose Activity Flex XML'} disabled={busy} onPress={() => void load()} />
    {(base || busy) && <Button title={busy ? 'Cancel and clear' : 'Clear reports'} secondary onPress={clear} />}
    {busy && <ActivityIndicator accessibilityLabel="Reading report" color={colors.accent} />}
    {error ? <Notice text={error} /> : null}
    {report && comparison && <>
      <View style={s.card}>
        <Text style={s.heading}>{current.name}</Text>
        <Text style={s.text}>Account ••••{report.account.slice(-4)}</Text>
        <Text style={s.text}>{report.from} — {report.to}</Text>
        {base && current !== base && <Text style={s.muted}>Compared with {base.name} ({base.report.from} — {base.report.to})</Text>}
        <Text style={s.muted}>Period coverage only. Full history and opening positions are not verified. Investment returns are unavailable.</Text>
        {report.issues.length ? <Notice text={`${report.issues.length} validation issues. Totals include supported rows only; this report is not verified.`} /> : <Text style={s.text}>Supported cash movements reconcile in every original currency.</Text>}
      </View>
      <View style={s.card}><Text style={s.heading}>Comparison</Text>
        {(['new', 'unchanged', 'changed', 'ambiguous'] as const).map(status => <Text key={status} style={s.text}>{status}: {comparison.statuses.filter(x => x === status).length}</Text>)}
        <Text style={s.muted}>“New” means absent from the first file, not absent from your saved account. Changed or ambiguous rows require review.</Text>
        {comparison.removed > 0 && <Notice text={`${comparison.removed} records from the first file are absent within this period. No deletion is inferred.`} />}
      </View>
      <View style={s.card}><Text style={s.heading}>Cash reconciliation</Text>
        <Text style={s.muted}>Full current report, including overlapping records. Original currencies; trade-date cash.</Text>
        {report.balances.map((b, i) => <View key={`${b.currency}-${i}`} style={{ gap: 4 }}>
          <Text style={s.heading}>{b.currency}</Text>
          <Text style={s.text}>Opening: {exactAmount(b.starting)}</Text>
          <Text style={s.text}>Movement: {exactAmount(b.movement)}</Text>
          <Text style={s.text}>Closing: {exactAmount(b.ending)}</Text>
          <Text style={s.text}>Difference: {exactAmount(b.difference)}</Text>
        </View>)}
      </View>
      <View style={s.card}><Text style={s.heading}>Movements by type</Text>
        {report.totals.map(t => <Text key={`${t.kind}-${t.currency}`} style={s.text}>{t.kind} · {t.currency}: {exactAmount(t.amount)}</Text>)}
      </View>
      {report.issues.length > 0 && <View style={s.card}><Text style={s.heading}>Validation issues</Text>
        {report.issues.slice(0, 30).map((issue, i) => <Text key={i} style={s.text}>{issue.location}: {issue.code.replace(/_/g, ' ').toLowerCase()}</Text>)}
        {report.issues.length > 30 && <Text style={s.muted}>{report.issues.length - 30} more issues. Export a shorter period to inspect them.</Text>}
      </View>}
      <View style={s.card}><Text style={s.heading}>Records · {report.events.length}</Text>
        {report.events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((event, index) => <View key={index} style={{ gap: 4 }}>
          <Text style={s.text}>{event.date || 'Invalid date'} · {event.label}</Text>
          <Text style={s.muted}>{event.location} · {comparison.statuses[page * PAGE_SIZE + index]}{event.supported ? '' : ' · unsupported'}</Text>
          {event.postings.map((p, i) => <Text key={i} style={s.text}>{p.currency} {exactAmount(p.amount)}</Text>)}
        </View>)}
        <Text style={s.muted}>Page {page + 1} of {pages}</Text>
        <Button title="Previous page" secondary disabled={page === 0} onPress={() => setPage(p => p - 1)} />
        <Button title="Next page" secondary disabled={page + 1 >= pages} onPress={() => setPage(p => p + 1)} />
      </View>
      <View style={s.card}><Text style={s.heading}>Report sections</Text>{report.sections.map(section => <Text key={section.name} style={s.muted}>{section.name}: {section.count} detail rows</Text>)}</View>
    </>}
  </ScrollView>;
}
