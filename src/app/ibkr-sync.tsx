import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAccount } from '../state/AccountContext';
import { usePortfolio } from '../state/PortfolioContext';
import { flexAction, flexMessage, flexStatus, disconnectFlex, setFlexDaily, type FlexStatus } from '../data/flexRepository';
import { Button, Notice } from '../ui/components';
import { useTheme } from '../ui/theme';
import { importIssueMessage } from '../domain/ibkr/issueMessage';

export default function IbkrSync() {
  const {session}=useAccount(); const owner=session!.user.id;
  const {portfolios}=usePortfolio(); const {styles:s,colors}=useTheme();
  const [status,setStatus]=useState<FlexStatus|null>(null); const [error,setError]=useState('');
  const [token,setToken]=useState(''); const [query,setQuery]=useState(''); const [portfolio,setPortfolio]=useState('');
  const [busy,setBusy]=useState(false); const live=useRef(true); const lock=useRef(false);
  const [focused,setFocused]=useState(true);
  const [historyFrom,setHistoryFrom]=useState('');
  const history=status?.history??[];
  const historyIncomplete=history.some(h=>h.state!=='received');
  const historyFailed=history.some(h=>h.state==='error');
  useFocusEffect(useCallback(()=>{
    let current=true;setFocused(true);
    void flexStatus(owner).then(value=>{if(current)setStatus(value);}).catch(()=>{if(current)setError(flexMessage('TEMPORARY_FAILURE'));});
    return ()=>{current=false;setFocused(false);setToken('');};
  },[owner]));
  const refresh=async()=>{const value=await flexStatus(owner); if(live.current) setStatus(value);};
  const run=async(action:()=>Promise<void>)=>{
    if(lock.current) return; lock.current=true; setBusy(true); setError('');
    try {await action(); await refresh();} catch(e) {if(live.current) setError(e instanceof Error?e.message:flexMessage('TEMPORARY_FAILURE'));}
    finally {lock.current=false;if(live.current) setBusy(false);}
  };
  useEffect(()=>{
    live.current=true;
    const sub=AppState.addEventListener('change',state=>{if(state!=='active')setToken('');});
    return ()=>{live.current=false;sub.remove();};
  },[owner]);
  useEffect(()=>{
    if(!focused || !status || (!['queued','waiting'].includes(status.state??'') && !(historyIncomplete&&!historyFailed)) || busy || error) return;
    const delay=Math.max(10000,new Date(status.nextAttemptAt??'').getTime()-Date.now());
    const timer=setTimeout(()=>{if(AppState.currentState==='active' || AppState.currentState===null) void run(()=>flexAction(owner,{action:historyIncomplete?'history-step':'step'}));},Math.min(300000,Number.isFinite(delay)?delay:10000));
    return ()=>clearTimeout(timer);
    // run closes over current owner; status changes after every persisted server step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[status,busy,error,owner,focused,historyIncomplete,historyFailed]);
  const save=()=>{
    const secret=token; setToken('');
    void run(()=>flexAction(owner,{action:'configure',token:secret,queryId:query.trim(),portfolioId:portfolio}));
  };
  const date=(value?:string|null)=>value?new Date(value).toLocaleString():'Never';
  return <ScrollView style={s.screen} contentContainerStyle={s.content} automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
    <Text style={s.title}>IBKR report sync</Text>
    <Text style={s.muted}>Load available history by month, then use weekly sync for updates. Reports are privately stored and checked. Operations are saved only after your confirmation in the import journal.</Text>
    {error?<Notice text={error}/>:null}
    {busy&&<ActivityIndicator color={colors.accent} accessibilityLabel="Synchronizing report"/>}
    <Button title="Refresh status" secondary disabled={busy} onPress={()=>void run(async()=>{})}/>
    {status?.configured&&<View style={s.card}>
      <Text style={s.heading}>Status: {status.state}</Text>
      <Text style={s.text}>Portfolio: {portfolios?.find(p=>p.id===status.portfolioId)?.name??'Unavailable'}</Text>
      <Text style={s.muted}>Last successful retrieval and check: {date(status.lastSuccessAt)}</Text>
      <Text style={s.muted}>Last received report: {date(status.lastReceivedAt)}</Text>
      {status.from&&<Text style={s.text}>Requested: {status.from} — {status.to}</Text>}
      {status.code&&<Notice text={flexMessage(status.code)}/>}
      {status.state==='blocked'&&<Notice text={status.issues?.length?status.issues.map(i=>`${i.location}: ${importIssueMessage(i.code)}`).join('\n'):'The report contains changed or unsupported operations. Open review for details. Nothing was applied automatically.'}/>}
      <Button title={status.state==='queued'||status.state==='waiting'?'Resume sync':'Sync last 7 days'} disabled={busy||historyIncomplete} onPress={()=>void run(()=>flexAction(owner,{action:status.state==='queued'||status.state==='waiting'?'step':'start'}))}/>
      {status.reportId&&<Button title="Review report and confirm import" secondary disabled={busy} onPress={()=>router.push({pathname:'/import-journal',params:{reportId:status.reportId!}})}/>}
      <Text style={s.muted}>Daily retrieval: {status.dailyEnabled?'enabled':'off'}. Server scheduling is activated after the manual connection check. It never confirms operations.</Text>
      {status.schedulerReady&&status.manualVerified&&<Button title={status.dailyEnabled?'Turn off daily retrieval':'Enable daily retrieval at 07:00 UTC'} secondary disabled={busy} onPress={()=>void run(()=>setFlexDaily(owner,!status.dailyEnabled))}/>}
      <Button title="Disconnect and delete stored token" secondary disabled={busy} onPress={()=>void run(()=>disconnectFlex(owner))}/>
    </View>}
    {status?.configured&&<View style={s.card}>
      <Text style={s.heading}>Initial history</Text>
      <Text style={s.muted}>One report per calendar month from your start date through yesterday (UTC). The range stays fixed when resumed. Downloaded reports still need individual review and confirmation. Unavailable periods remain visible; no missing dates are silently skipped.</Text>
      {!history.length&&<><Text style={s.text}>History start (YYYY-MM-DD)</Text><TextInput style={s.input} accessibilityLabel="History start date" placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} value={historyFrom} onChangeText={setHistoryFrom} autoCorrect={false} maxLength={10} editable={!busy}/>
      <Button title="Load history by month" disabled={busy||!/^\d{4}-\d{2}-\d{2}$/.test(historyFrom)} onPress={()=>void run(()=>flexAction(owner,{action:'history',from:historyFrom}))}/></>}
      {!!history.length&&<>
        <Text style={s.text}>Received {history.filter(h=>h.state==='received').length} / {history.length} · Applied {history.filter(h=>h.reviewStatus==='applied').length} · Blocked {history.filter(h=>h.reviewStatus==='blocked').length}</Text>
        {historyIncomplete&&<Button title={historyFailed?'Retry failed month':'Continue history retrieval'} disabled={busy} onPress={()=>void run(()=>flexAction(owner,historyFailed?{action:'history',from:history[0].from}:{action:'history-step'}))}/>}
        {!historyIncomplete&&<Text style={s.muted}>All requested files received. This is not confirmation that all operations are applied or the account history is complete.</Text>}
        {history.map(h=><View key={h.from} style={{gap:4}}><Text style={s.text}>{h.from} — {h.to} · {h.state}{h.reviewStatus?` / ${h.reviewStatus}`:''}</Text>
          {h.code&&<Text style={s.muted}>{flexMessage(h.code)}</Text>}
          {h.reportId&&<Button title="Review this period" secondary disabled={busy} onPress={()=>router.push({pathname:'/import-journal',params:{reportId:h.reportId!}})}/>}
        </View>)}
      </>}
    </View>}
    <View style={s.card}>
      <Text style={s.heading}>{status?.configured?'Replace connection':'Connect Flex reporting'}</Text>
      <Text style={s.muted}>Use the Activity Flex XML query already verified with manual import. Select its linked portfolio. Enter the token here, never in chat. It is sent over HTTPS to encrypted server storage and is never returned. The field clears on submit or when the app goes into the background.</Text>
      {status?.portfolios.map(p=><Button key={p.id} title={`${portfolio===p.id?'✓ ':''}${portfolios?.find(item=>item.id===p.id)?.name??p.account} · ${p.account}`} secondary disabled={busy} onPress={()=>setPortfolio(p.id)}/>)}
      {status&&!status.portfolios.length&&<Notice text="First import and confirm an XML report to link a portfolio to your IBKR account."/>}
      <Text style={s.text}>Query ID</Text><TextInput style={s.input} accessibilityLabel="Flex Query ID" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} keyboardType="number-pad" maxLength={30} editable={!busy}/>
      <Text style={s.text}>Flex token</Text><TextInput style={s.input} accessibilityLabel="Flex token" value={token} onChangeText={setToken} secureTextEntry autoComplete="off" textContentType="none" autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!busy}/>
      <Button title="Save encrypted connection" disabled={busy||!portfolio||!/^\d{6,128}$/.test(token)||!/^\d{1,30}$/.test(query.trim())} onPress={save}/>
    </View>
    <Text style={s.muted}>If you leave this screen, the manual run remains saved. Return and resume. Report availability can lag behind trading. This does not restore all account history.</Text>
  </ScrollView>;
}
