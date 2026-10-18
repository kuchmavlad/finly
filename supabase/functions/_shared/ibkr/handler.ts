import { MAX_REPORT_BYTES, parsePreview, ReportError, type Preview } from './preview.ts';

export const importErrors = [
  'UNAUTHORIZED', 'INVALID_REPORT', 'LIMIT_EXCEEDED', 'PORTFOLIO_UNAVAILABLE', 'MANUAL_OVERLAP',
  'ACCOUNT_MAPPING_CONFLICT', 'STORAGE_LIMIT', 'REPORT_UNAVAILABLE', 'INVALID_CONFIRMATION',
  'REQUEST_CONFLICT', 'PREVIEW_STALE', 'REPORT_BLOCKED', 'REVISION_CONFLICT', 'INVALID_DECIMAL',
  'IBKR_PORTFOLIO_READ_ONLY', 'INVALID_PAGE',
] as const;
export function safeImportError(error: unknown): string {
  const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  return importErrors.find(code => message === code) ?? 'TEMPORARY_FAILURE';
}
type Dependencies = {
  authenticate: (token: string) => Promise<string | null>;
  stage: (userId: string, portfolioId: string, xml: string, preview: Preview) => Promise<unknown>;
};
const cors = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-portfolio-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// Bounded streaming UTF-8 reader: Content-Length is not trusted.
export async function readXml(request: Request): Promise<string> {
  if (Number(request.headers.get('content-length')) > MAX_REPORT_BYTES) throw new Error('LIMIT_EXCEEDED');
  if (!request.body) throw new Error('INVALID_REPORT');
  const reader = request.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let bytes = 0; let xml = ''; const deadline = Date.now() + 30000;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([reader.read(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('LIMIT_EXCEEDED')), Math.max(1, deadline - Date.now()));
      })]).finally(() => clearTimeout(timer));
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_REPORT_BYTES) throw new Error('LIMIT_EXCEEDED');
      try { xml += decoder.decode(result.value, { stream: true }); } catch { throw new Error('INVALID_REPORT'); }
    }
    try { xml += decoder.decode(); } catch { throw new Error('INVALID_REPORT'); }
    return xml;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function createImportHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply({ code: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      const bearer = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '');
      if (!bearer) return reply({ code: 'UNAUTHORIZED' }, 401);
      const userId = await deps.authenticate(bearer[1]);
      if (!userId) return reply({ code: 'UNAUTHORIZED' }, 401);
      const portfolio = request.headers.get('x-portfolio-id') ?? '';
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(portfolio)) return reply({ code: 'PORTFOLIO_UNAVAILABLE' }, 400);
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/xml') return reply({ code: 'INVALID_REPORT' }, 415);
      const xml = await readXml(request);
      // Never accept the mobile parser's snapshot or a client-supplied owner.
      const preview = await parsePreview(xml, () => request.signal.aborted);
      if (preview.account.length > 80 || preview.events.length > 5000) return reply({ code: 'LIMIT_EXCEEDED' }, 413);
      return reply(await deps.stage(userId, portfolio, xml, preview));
    } catch (error) {
      const code = error instanceof ReportError ? 'INVALID_REPORT' : safeImportError(error);
      return reply({ code }, code === 'TEMPORARY_FAILURE' ? 503 : code === 'LIMIT_EXCEEDED' ? 413 : 400);
    }
  };
}
