import { ImportFailure, type ImportPending, type ImportSummary } from '../domain/ibkr/import.ts';
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string,value: string) => Promise<void>; removeItem: (key: string) => Promise<void> };
type Dependencies = { storage: Storage; key: string; uuid: () => string;
  status: (id: string) => Promise<ImportSummary>; confirm: (p: ImportPending) => Promise<ImportSummary> };
export function parseImportPending(raw: string): ImportPending {
  const p = JSON.parse(raw); const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!p || !uuid.test(p.reportId) || !uuid.test(p.requestId) || !/^[0-9a-f]{64}$/.test(p.digest)) throw new Error('Invalid pending confirmation');
  return { reportId:p.reportId, digest:p.digest, requestId:p.requestId };
}
export class ImportConfirmation {
  private state = { ready:false, busy:false, pending:null as ImportPending|null, result:null as ImportSummary|null, error:'' };
  private listeners = new Set<() => void>(); private generation = 0;
  private deps: Dependencies;
  constructor(deps: Dependencies) { this.deps = deps; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  private update(patch: Partial<typeof this.state>) { this.state = {...this.state,...patch}; this.listeners.forEach(l=>l()); }
  dispose() { this.generation++; this.update({busy:false,ready:false}); }
  async restore() {
    if (this.state.busy) return;
    const token = this.generation; this.update({busy:true,error:''});
    try {
      const raw = await this.deps.storage.getItem(this.deps.key);
      if (token !== this.generation) return;
      this.update({pending:raw ? parseImportPending(raw) : null,ready:true});
    } catch { if (token === this.generation) this.update({ready:false,error:'Could not restore the pending import. Retry recovery before confirming another report.'}); }
    finally { if (token === this.generation) this.update({busy:false}); }
  }
  async apply(summary?: ImportSummary) {
    if (this.state.busy || !this.state.ready) return;
    const token = this.generation; this.update({busy:true,error:'',result:null});
    try {
      let pending = this.state.pending;
      if (!pending) {
        if (!summary || summary.status !== 'ready') return;
        pending = {reportId:summary.id,digest:summary.digest,requestId:this.deps.uuid()};
        // Persist intent before the first network write. A failed save cannot send.
        await this.deps.storage.setItem(this.deps.key,JSON.stringify(pending));
        if (token !== this.generation) return;
        this.update({pending});
      }
      let result = await this.deps.status(pending.reportId);
      if (token !== this.generation) return;
      if (result.digest !== pending.digest) throw new ImportFailure('PREVIEW_STALE');
      if (result.status !== 'applied') result = await this.deps.confirm(pending);
      if (token !== this.generation) return;
      this.update({result});
      await this.deps.storage.removeItem(this.deps.key);
      if (token === this.generation) this.update({pending:null});
    } catch (error) {
      if (token !== this.generation) return;
      // These are definitive rejections. Network/storage uncertainty retains intent.
      if (error instanceof ImportFailure && ['PREVIEW_STALE','REPORT_BLOCKED','REVISION_CONFLICT','REQUEST_CONFLICT','INVALID_DECIMAL','MANUAL_OVERLAP','ACCOUNT_MAPPING_CONFLICT'].includes(error.code)) {
        try { await this.deps.storage.removeItem(this.deps.key); if (token === this.generation) this.update({pending:null}); }
        catch { if (token === this.generation) this.update({error:'Could not clear the rejected confirmation. Retry recovery.'}); return; }
      }
      if (token === this.generation) this.update({error:error instanceof ImportFailure ? error.message : 'Could not finish confirmation. Retry the pending import; the same request will not create duplicates.'});
    } finally { if (token === this.generation) this.update({busy:false}); }
  }
}
