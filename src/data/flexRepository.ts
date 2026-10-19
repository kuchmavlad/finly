import { requireSupabase } from './supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

export type HistoryPeriod={from:string;to:string;state:'pending'|'fetching'|'received'|'error';code:string|null;reportId:string|null;reviewStatus:'ready'|'blocked'|'applied'|null;issues:{code:string;location:string}[]|null};
export type FlexStatus={configured:boolean;schedulerReady:boolean;history?:HistoryPeriod[];issues?:{code:string;location:string}[]|null;portfolios:{id:string;account:string}[];portfolioId?:string;queryId?:string;state?:'idle'|'queued'|'waiting'|'review'|'blocked'|'error';code?:string|null;nextAttemptAt?:string;lastSuccessAt?:string|null;lastReceivedAt?:string|null;reportId?:string|null;from?:string;to?:string;dailyEnabled?:boolean;manualVerified?:boolean};
export const flexMessage=(code:string)=>({
  HISTORY_DATE_UNAVAILABLE:'Enter a valid start date within the current year and four previous calendar years, before today.',
  HISTORY_ALREADY_PLANNED:'A history plan already exists. Continue that plan; its date range is preserved.',
  HISTORY_CONNECTION_LOCKED:'History is tied to this portfolio and query. You can replace the token using the same settings.',
  HISTORY_IN_PROGRESS:'Finish retrieving the history plan before starting a weekly or daily sync.',
  CASH_PERIOD_GAP:'Cash statement dates leave a gap or omit reported operations. This report cannot be confirmed.',
  INVALID_CASH_REPORT:'Cash statement fields could not be validated. Open the report review for details.',
  MISSING_BALANCES:'No valid currency balances were available for reconciliation.',
  TOKEN_EXPIRED:'Your Flex token expired. Generate a replacement in IBKR and save it here.',
  TOKEN_INVALID:'IBKR rejected the token. Check or replace it.', IP_RESTRICTED:'The token restricts server access by IP. Check its IBKR settings.',
  QUERY_INVALID:'Check the Activity Flex Query ID and XML configuration in IBKR.', RATE_LIMITED:'IBKR rate limit reached. The server will wait before retrying.',
  GENERATING:'IBKR is generating your report.', BROKER_TEMPORARY:'IBKR is temporarily unavailable. A retry is scheduled.',
  NETWORK_TIMEOUT:'The request timed out. Resume to check again safely.', SYNC_TIMEOUT:'This run reached its retry or time limit. Start a new sync.',
  REPORT_SCOPE_MISMATCH:'IBKR returned a different account or period. The report was not imported.',
  BROKER_REJECTED:'IBKR could not provide this report. Check the query and report availability in Portal.',
  INVALID_RESPONSE:'IBKR returned an unexpected response. No operations were applied.', INVALID_REPORT:'The received XML could not be validated. No operations were applied.',
  STORAGE_LIMIT:'Private report storage is full. Contact the project administrator.', LIMIT_EXCEEDED:'The report exceeds import limits.',
  INVALID_CONFIGURATION:'Check the numeric Flex token, Query ID and portfolio.', MAPPED_PORTFOLIO_REQUIRED:'First confirm a manual XML import for this portfolio.',
  SYNC_BUSY:'A request is running. Wait before changing the connection.', NOT_CONFIGURED:'Save your Flex connection first.',
  UNAUTHORIZED:'Sign in again to continue.',
}[code] ?? 'Could not complete the request. Refresh status or resume; no automatic confirmation is performed.');
async function clientFor(owner:string) {
  const client=requireSupabase(); const {data,error}=await client.auth.getSession();
  if(error || data.session?.user.id!==owner) throw new Error(flexMessage('UNAUTHORIZED'));
  return {client,token:data.session.access_token};
}
export async function flexStatus(owner:string):Promise<FlexStatus> {
  const {client,token}=await clientFor(owner);
  const {data,error}=await client.rpc('ibkr_flex_status').setHeader('Authorization',`Bearer ${token}`).abortSignal(AbortSignal.timeout(30000));
  if(error) throw new Error(flexMessage('TEMPORARY_FAILURE')); return data;
}
export async function flexAction(owner:string,body:Record<string,unknown>):Promise<void> {
  const {client,token}=await clientFor(owner);
  const {error}=await client.functions.invoke('ibkr-flex',{body,timeout:85000,headers:{Authorization:`Bearer ${token}`}});
  if(error) {
    let code='TEMPORARY_FAILURE';
    if(error instanceof FunctionsHttpError) try {code=(await error.context.json()).code;} catch { /* Never show transport messages. */ }
    throw new Error(flexMessage(code));
  }
}
export async function disconnectFlex(owner:string) {
  const {client,token}=await clientFor(owner);
  const {error}=await client.rpc('disconnect_ibkr_flex').setHeader('Authorization',`Bearer ${token}`).abortSignal(AbortSignal.timeout(30000));
  if(error) throw new Error(flexMessage('TEMPORARY_FAILURE'));
}
export async function setFlexDaily(owner:string,enabled:boolean) {
  const {client,token}=await clientFor(owner);
  const {error}=await client.rpc('ibkr_flex_daily',{p_enabled:enabled}).setHeader('Authorization',`Bearer ${token}`).abortSignal(AbortSignal.timeout(30000));
  if(error) throw new Error('Daily retrieval is not ready. Complete a manual sync and ask the administrator to activate the prepared schedule.');
}
