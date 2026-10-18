import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useAccount } from '../state/AccountContext';
import { usePortfolio } from '../state/PortfolioContext';
import { ImportConfirmation } from '../state/importConfirmation';
import { deviceStorage, pendingCashKey } from '../data/supabase';
import { confirmImport, importHistory, importRecords, importStatus, stageImport } from '../data/importRepository';
import { pickReport } from '../data/pickReport';
import { ImportFailure, type ImportRecord, type ImportSummary } from '../domain/ibkr/import';
import { exactAmount } from '../domain/account';
import { Button, Notice } from '../ui/components';
import { useTheme } from '../ui/theme';

export default function ImportJournal() {
  const { session } = useAccount(); const owner = session!.user.id;
  const { portfolios } = usePortfolio(); const { styles:s, colors } = useTheme();
  const [confirmation] = useState(() => new ImportConfirmation({storage:deviceStorage,
    key:`${pendingCashKey(owner)}.ibkr-confirmation`,uuid:randomUUID,
    status:id=>importStatus(owner,id),confirm:p=>confirmImport(owner,p)}));
  const pending = useSyncExternalStore(confirmation.subscribe,confirmation.getSnapshot,confirmation.getSnapshot);
  const [file,setFile] = useState<{name:string;xml:string}|null>(null);
  const [portfolio,setPortfolio] = useState(''); const [selected,setSelected] = useState<ImportSummary|null>(null);
  const [history,setHistory] = useState<ImportSummary[]|null>(null);
  const [records,setRecords] = useState<ImportRecord[]|null>(null); const [page,setPage] = useState(0);
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const live = useRef(true); const locked = useRef(false);
  useEffect(() => {
    live.current=true; void confirmation.restore();
    return () => { live.current=false; confirmation.dispose(); };
  },[confirmation]);
  const apply = async (summary?: ImportSummary) => {
    await confirmation.apply(summary);
    const result = confirmation.getSnapshot().result;
    if (live.current && result) {
      setSelected(result); setRecords(null); setPage(0);
      setHistory(old=>old?.map(r=>r.id===result.id ? result : r) ?? null);
    }
  };
  const run = async (action: () => Promise<void>) => {
    if (locked.current || pending.busy) return;
    locked.current=true; setBusy(true); setError('');
    try { await action(); }
    catch (failure) { if (live.current) setError(failure instanceof ImportFailure ? failure.message : 'Could not complete this step. Retry or refresh saved reports.'); }
    finally { if (live.current) { locked.current=false; setBusy(false); } }
  };
  const show = async (id:string) => {
    const value = await importStatus(owner,id);
    if (live.current) { setSelected(value); setRecords(null); setPage(0); }
  };
  const lockedUi = busy || pending.busy;
  const selectFile = () => run(async()=>{
    const value = await pickReport();
    if (live.current && value) {setFile(value);setSelected(null);setRecords(null);setPage(0);}
  });
  const upload = () => run(async()=>{
    if (!file || !portfolio || pending.pending || !pending.ready) return;
    const result = await stageImport(owner,portfolio,file.xml);
    if (live.current) {setSelected(result);setRecords(null);setPage(0);setFile(null);}
  });
  const loadPage = (next:number) => run(async()=>{
    if (!selected) return;
    const result = await importRecords(owner,selected.id,next*25);
    if (live.current) {setRecords(result);setPage(next);}
  });
  return <ScrollView style={s.screen} contentContainerStyle={s.content}>
    <Text style={s.title}>IBKR import journal</Text>
    <Text style={s.muted}>Check on server uploads and privately stores this XML in your Finly account. Confirm saves supported operations to the IBKR journal. Full history, opening positions and portfolio balances are not verified; this journal does not update Overview or calculate returns.</Text>
    {!pending.ready && <Button title="Recover pending confirmation" disabled={lockedUi} onPress={()=>void confirmation.restore()} />}
    {pending.error ? <Notice text={pending.error} /> : null}
    {pending.pending && <View style={s.card}>
      <Text style={s.heading}>Unfinished confirmation</Text>
      <Text style={s.muted}>Check its server status and retry with the original request. A lost response will not duplicate operations.</Text>
      <Button title="Check status and retry confirmation" disabled={lockedUi} onPress={()=>void apply()} />
    </View>}
    <View style={s.card}><Text style={s.heading}>Choose portfolio</Text>
      <Text style={s.muted}>Use an empty portfolio for the first import. It will be linked to this broker account; manual cash entries will then be unavailable there.</Text>
      {portfolios?.map(p=><Button key={p.id} title={`${portfolio===p.id ? '✓ ' : ''}${p.name}`} secondary disabled={lockedUi || !!pending.pending} onPress={()=>{setPortfolio(p.id);setSelected(null);setRecords(null);}} />)}
      <Button title="Manage portfolios" secondary disabled={lockedUi} onPress={()=>router.push('/account')} />
    </View>
    <Button title="Choose Activity Flex XML" disabled={lockedUi || !!pending.pending || !pending.ready} onPress={()=>void selectFile()} />
    {file && <><Text style={s.text}>{file.name}</Text>
      <Button title="Check on server" disabled={lockedUi || !portfolio || !!pending.pending || !pending.ready} onPress={()=>void upload()} />
      <Button title="Clear selected file" secondary disabled={lockedUi} onPress={()=>setFile(null)} />
    </>}
    <Button title="Refresh saved reports" secondary disabled={lockedUi} onPress={()=>void run(async()=>{
      const result=await importHistory(owner); if(live.current) setHistory(result);
    })} />
    {lockedUi && <ActivityIndicator accessibilityLabel="Checking import" color={colors.accent} />}
    {error ? <Notice text={error} /> : null}
    {history && <View style={s.card}><Text style={s.heading}>Latest saved reports</Text>
      {!history.length && <Text style={s.muted}>No server reports yet.</Text>}
      {history.map(r=><Button key={r.id} title={`${r.from} — ${r.to} · ${r.account} · ${r.status}`} secondary disabled={lockedUi} onPress={()=>void run(()=>show(r.id))} />)}
      <Text style={s.muted}>Latest 20 reports. Rechecking an older XML retrieves the same report.</Text>
    </View>}
    {selected && <>
      <View style={s.card}><Text style={s.heading}>Server review · {selected.status}</Text>
        <Text style={s.text}>{selected.account} · {selected.from} — {selected.to}</Text>
        <Text style={s.text}>Portfolio: {portfolios?.find(p=>p.id===selected.portfolioId)?.name ?? 'Unavailable'}</Text>
        <Text style={s.text}>New: {selected.newCount} · Unchanged: {selected.unchangedCount} · Changed: {selected.changedCount}</Text>
        <Text style={s.muted}>Compared with your saved IBKR journal. Existing identical operations are not added again. Missing operations are never deleted automatically.</Text>
        {selected.status==='blocked' && <Notice text="This report cannot be applied. Changed or unsupported operations need review; no operations from this report were added." />}
        {selected.issues.slice(0,30).map((issue,i)=><Text key={i} style={s.text}>{issue.location}: {issue.code}</Text>)}
        {selected.status==='applied' && <Text accessibilityRole="alert" style={s.text}>Saved to the IBKR journal. Overview balances remain separate.</Text>}
        {selected.status==='ready' && <Button title="Confirm and save to IBKR journal" disabled={lockedUi || !!pending.pending || !pending.ready} onPress={()=>void apply(selected)} />}
      </View>
      <View style={s.card}><Text style={s.heading}>Report cash reconciliation</Text>
        <Text style={s.muted}>Original currencies, full report period. These are report figures, not published portfolio balances.</Text>
        {selected.balances.map(b=><View key={b.currency} style={{gap:4}}>
          <Text style={s.heading}>{b.currency}</Text>
          <Text style={s.text}>Opening: {exactAmount(b.starting)} · Closing: {exactAmount(b.ending)}</Text>
          <Text style={s.text}>Movement: {exactAmount(b.movement)} · Difference: {exactAmount(b.difference)}</Text>
        </View>)}
      </View>
      <View style={s.card}><Text style={s.heading}>Report operations</Text>
        <Button title="Load operations" secondary disabled={lockedUi} onPress={()=>void loadPage(0)} />
        {records?.map((r,i)=><View key={i} style={{gap:4}}><Text style={s.text}>{r.date} · {r.label}</Text>
          <Text style={s.muted}>{r.location}</Text>{r.postings.map((p,j)=><Text key={j} style={s.text}>{p.currency} {exactAmount(p.amount)}</Text>)}
        </View>)}
        {records && <><Text style={s.muted}>Page {page+1}</Text>
          <Button title="Previous page" secondary disabled={lockedUi || page===0} onPress={()=>void loadPage(page-1)} />
          <Button title="Next page" secondary disabled={lockedUi || records.length<25} onPress={()=>void loadPage(page+1)} />
        </>}
      </View>
    </>}
  </ScrollView>;
}
