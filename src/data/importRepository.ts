import { FunctionsHttpError } from '@supabase/supabase-js';
import { requireSupabase } from './supabase';
import { flexAction } from './flexRepository';
import { ImportFailure, type ImportPending, type ImportRecord, type ImportSummary } from '../domain/ibkr/import';
import { safeImportError } from '../../supabase/functions/_shared/ibkr/handler';

// Scope each operation to the account that owns this screen, including async retries.
async function clientFor(owner: string) {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error || data.session?.user.id !== owner) throw new ImportFailure('UNAUTHORIZED');
  return { client, token: data.session.access_token };
}
export async function stageImport(owner: string, portfolioId: string, xml: string): Promise<ImportSummary> {
  const { client, token } = await clientFor(owner);
  const { data, error } = await client.functions.invoke('ibkr-import', {
    body: xml, timeout: 65000, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/xml', 'x-portfolio-id': portfolioId },
  });
  if (error) {
    let code = 'TEMPORARY_FAILURE';
    if (error instanceof FunctionsHttpError) {
      try { const body = await error.context.json(); if (typeof body.code === 'string') code = body.code; } catch { /* No report content in errors. */ }
    }
    throw new ImportFailure(code);
  }
  return data;
}
async function rpc<T>(owner: string, name: string, args?: Record<string,unknown>): Promise<T> {
  const { client, token } = await clientFor(owner);
  const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),30000);
  try {
    const { data, error } = await client.rpc(name,args).setHeader('Authorization',`Bearer ${token}`).abortSignal(controller.signal);
    if (error) throw new ImportFailure(safeImportError(error));
    return data as T;
  } finally { clearTimeout(timer); }
}
export const importHistory = (owner: string) => rpc<ImportSummary[]>(owner,'ibkr_report_history');
export const importStatus = (owner: string, reportId: string) => rpc<ImportSummary>(owner,'ibkr_report_status',{p_report_id:reportId});
export const recheckImport = async (owner: string, reportId: string) => {
  await flexAction(owner,{action:'recheck',reportId});
  return importStatus(owner,reportId);
};
export const importRecords = (owner: string, reportId: string, offset: number) => rpc<ImportRecord[]>(owner,'ibkr_report_records',{p_report_id:reportId,p_offset:offset});
export const confirmImport = (owner: string, p: ImportPending) => rpc<ImportSummary>(owner,'confirm_ibkr_report',{p_report_id:p.reportId,p_digest:p.digest,p_request_id:p.requestId});
