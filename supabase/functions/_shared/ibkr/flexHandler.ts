import { fetchFlex, FlexError, type FlexClaim } from './flex.ts';
import { parsePreview, ReportError } from './preview.ts';
import { safeImportError } from './handler.ts';

type Rpc = (name:string,args:Record<string,unknown>)=>Promise<unknown>;
type Deps = { authenticate:(token:string)=>Promise<string|null>; rpc:Rpc; transport?:typeof fetch };
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const safeCodes=['INVALID_CONFIGURATION','MAPPED_PORTFOLIO_REQUIRED','SYNC_BUSY','NOT_CONFIGURED','LEASE_EXPIRED','HISTORY_DATE_UNAVAILABLE','HISTORY_ALREADY_PLANNED','HISTORY_CONNECTION_LOCKED','HISTORY_IN_PROGRESS'];
export function createFlexHandler(deps:Deps) {
  return async(request:Request):Promise<Response>=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({code:'METHOD_NOT_ALLOWED'},405);
    try {
      const bearer=/^Bearer (\S+)$/i.exec(request.headers.get('authorization')??'');
      if(!bearer) return reply({code:'UNAUTHORIZED'},401);
      const user=await deps.authenticate(bearer[1]);
      if(!user) return reply({code:'UNAUTHORIZED'},401);
      // Strict, streamed bound; auth always precedes reading the secret-bearing body.
      if(request.headers.get('content-type')?.split(';')[0]!=='application/json' || !request.body) return reply({code:'INVALID_CONFIGURATION'},400);
      const reader=request.body.getReader(); let body=''; let bytes=0;
      const decoder=new TextDecoder('utf-8',{fatal:true}); const deadline=Date.now()+5000;
      try { while(true) {
        let timer:ReturnType<typeof setTimeout>|undefined;
        const part=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('INVALID_CONFIGURATION')),Math.max(1,deadline-Date.now()));})]).finally(()=>clearTimeout(timer));
        if(part.done) break;
        bytes+=part.value.length; if(bytes>2048) throw new Error('INVALID_CONFIGURATION');
        body+=decoder.decode(part.value,{stream:true});
      } body+=decoder.decode(); } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
      let input:Record<string,unknown>;
      try { input=JSON.parse(body); if(!input || typeof input!=='object') throw new Error(); } catch { return reply({code:'INVALID_CONFIGURATION'},400); }
      if(input.action==='configure') {
        if(typeof input.token!=='string' || !/^\d{6,128}$/.test(input.token) || typeof input.queryId!=='string' || !/^\d{1,30}$/.test(input.queryId) || typeof input.portfolioId!=='string' || !/^[0-9a-f-]{36}$/i.test(input.portfolioId)) return reply({code:'INVALID_CONFIGURATION'},400);
        await deps.rpc('configure_ibkr_flex',{p_user_id:user,p_portfolio_id:input.portfolioId,p_token:input.token,p_query_id:input.queryId});
      } else if(input.action==='recheck') {
        if(typeof input.reportId!=='string' || !/^[0-9a-f-]{36}$/i.test(input.reportId)) return reply({code:'INVALID_CONFIGURATION'},400);
        const source=await deps.rpc('ibkr_source_for_reparse',{p_user_id:user,p_report_id:input.reportId}) as {xml:string;portfolioId:string};
        const preview=await parsePreview(source.xml);
        await deps.rpc('restage_ibkr_source',{p_user_id:user,p_report_id:input.reportId,p_snapshot:preview});
      } else if(input.action==='history' || input.action==='history-step') {
        if(input.action==='history') {
          if(typeof input.from!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.from)) return reply({code:'HISTORY_DATE_UNAVAILABLE'},400);
          await deps.rpc('queue_ibkr_history',{p_user_id:user,p_start:input.from});
        }
        await deps.rpc('advance_ibkr_history',{p_user_id:user});
        await flexStep(user,deps);
      } else if(input.action==='start' || input.action==='step') {
        if(input.action==='start') await deps.rpc('start_ibkr_flex',{p_user_id:user,p_origin:'manual'});
        await flexStep(user,deps);
      } else return reply({code:'INVALID_CONFIGURATION'},400);
      return reply({ok:true});
    } catch(error) {
      const message=error instanceof Error ? error.message : '';
      return reply({code:safeCodes.includes(message)?message:'TEMPORARY_FAILURE'},503);
    }
  };
}
export async function flexStep(user:string,deps:Pick<Deps,'rpc'|'transport'>) {
  const claim=await deps.rpc('claim_ibkr_flex',{p_user_id:user}) as FlexClaim|null;
  if(!claim) return;
  const args={p_user_id:user,p_lease:claim.lease};
  try {
    const result=await fetchFlex(claim,deps.transport);
    if('reference' in result) await deps.rpc('finish_ibkr_flex',{...args,p_reference:result.reference});
    else {
      const preview=await parsePreview(result.xml);
      if(preview.account!==claim.account || preview.from!==claim.from || preview.to!==claim.to) throw new FlexError('REPORT_SCOPE_MISMATCH');
      await deps.rpc('finish_ibkr_flex',{...args,p_xml:result.xml,p_snapshot:preview});
    }
  } catch(error) {
    const code=error instanceof FlexError ? error.code : error instanceof ReportError ? 'INVALID_REPORT' : safeImportError(error);
    await deps.rpc('finish_ibkr_flex',{...args,p_code:code,p_retry:error instanceof FlexError ? error.retryable : code==='TEMPORARY_FAILURE'});
  }
}
