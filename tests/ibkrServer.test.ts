import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { parsePreview, MAX_REPORT_BYTES } from '../src/domain/ibkr/preview.ts';
import { createImportHandler } from '../supabase/functions/_shared/ibkr/handler.ts';
import { cashReport, cashRow } from './fixtures/ibkr.ts';

type Summary = { id: string; digest: string; status: string; newCount: number; unchangedCount: number; changedCount: number };
test('server journal: reparse, exact atomic apply, overlap, stale previews and owner isolation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid,bucket_id text,name text);
      create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;`);
    for (const file of ['20261015065115_pilot.sql','20261015165100_server_portfolios.sql','20261018084534_ibkr_journal.sql','20261018084801_ibkr_owner_cleanup.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
    }
    const alice = randomUUID(), bob = randomUUID();
    await db.query('insert into auth.users values($1),($2)', [alice,bob]);
    const become = async (id: string) => {
      await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
      await db.exec('set role authenticated');
    };
    const rpc = async <T>(name: string, args: unknown[] = []) => (await db.query<{ result: T }>(
      `select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`, args)).rows[0].result;
    await become(alice);
    const portfolio = await rpc<string>('create_portfolio',['Imported']);
    const other = await rpc<string>('create_portfolio',['Other']);
    const stage = async (xml: string, user = alice, pid = portfolio, mutate?: (p: Awaited<ReturnType<typeof parsePreview>>) => void) => {
      const preview = await parsePreview(xml); mutate?.(preview);
      await db.exec('reset role; set role service_role');
      try { return await rpc<Summary>('stage_ibkr_report',[user,pid,xml,preview]); }
      finally { await become(user); }
    };
    const confirm = (s: Summary, request = randomUUID()) => rpc<Summary>('confirm_ibkr_report',[s.id,s.digest,request]);
    const count = async () => {
      await db.exec('reset role');
      const rows = (await db.query<{ count: number }>('select count(*)::int as count from ibkr_private.events')).rows[0].count;
      await become(alice); return rows;
    };
    const monthly = cashReport(cashRow('a','10.000000000000000001')+cashRow('b','20'),'30.000000000000000001');
    const first = await stage(monthly);
    assert.equal(first.newCount,2); assert.equal(first.status,'ready'); assert.equal(await count(),0);
    assert.equal((await stage(monthly)).id, first.id, 'retry staging returns the same batch');
    await assert.rejects(rpc('stage_ibkr_report',[alice,portfolio,monthly,await parsePreview(monthly)]),/permission denied/);
    await assert.rejects(db.query('select * from ibkr_private.reports'),/permission denied/);
    const subsetXml = cashReport(cashRow('a','10.000000000000000001'),'10.000000000000000001','20260710','20260722');
    const stale = await stage(subsetXml);
    await assert.rejects(rpc('confirm_ibkr_report',[first.id,'wrong',randomUUID()]),/PREVIEW_STALE/);
    const request = randomUUID();
    assert.equal((await confirm(first,request)).status,'applied');
    assert.equal((await confirm(first,request)).status,'applied', 'lost response retry is idempotent');
    assert.equal(await count(),2);
    assert.equal((await stage(monthly)).status,'applied');
    await assert.rejects(confirm(stale),/PREVIEW_STALE/);
    const overlap = await stage(subsetXml);
    assert.equal(overlap.newCount,0); assert.equal(overlap.unchangedCount,1);
    await assert.rejects(confirm(overlap,request),/REQUEST_CONFLICT/);
    await confirm(overlap); assert.equal(await count(),2);
    assert.equal((await rpc<unknown[]>('ibkr_report_history')).length,2);
    const records = await rpc<{ postings: {amount: string}[] }[]>('ibkr_report_records',[first.id,0]);
    assert.equal(records[0].postings[0].amount,'10.000000000000000001');
    assert.deepEqual((await db.query('select * from public.cash_balances()')).rows,[], 'journal is not an unverified portfolio balance');
    await assert.rejects(rpc('add_cash_entry',[randomUUID(),portfolio,'deposit','USD','1','2026-07-01']),/IBKR_PORTFOLIO_READ_ONLY/);
    const changed = await stage(cashReport(cashRow('a','11'),'11'));
    assert.equal(changed.changedCount,1); assert.equal(changed.status,'blocked');
    await assert.rejects(confirm(changed),/REPORT_BLOCKED/); assert.equal(await count(),2);
    const mismatch = await stage(cashReport(cashRow('c'),'11'));
    assert.equal(mismatch.status,'blocked'); await assert.rejects(confirm(mismatch),/REPORT_BLOCKED/);
    await assert.rejects(stage(monthly,alice,other),/ACCOUNT_MAPPING_CONFLICT/);
    await rpc('add_cash_entry',[randomUUID(),other,'deposit','USD','1','2026-07-01']);
    await assert.rejects(stage(monthly.replaceAll('TEST','SECOND'),alice,other),/MANUAL_OVERLAP/);
    // A fault after inserting an event must roll back events, postings, mapping and status.
    const faulty = await stage(cashReport(cashRow('c')+cashRow('d'),'20'),alice,portfolio,p=>{
      p.events[1].postings[0].amount='1e2';
    });
    await assert.rejects(confirm(faulty),/INVALID_DECIMAL/); assert.equal(await count(),2);
    assert.equal((await rpc<Summary>('ibkr_report_status',[faulty.id])).status,'ready');
    await db.exec('reset role');
    assert.equal((await db.query<{ sum: string }>('select sum(amount)::text from ibkr_private.postings')).rows[0].sum,'30.000000000000000001');
    assert.equal((await db.query<{ n: number }>('select count(*)::int n from ibkr_private.provenance')).rows[0].n,3);
    await become(bob);
    assert.deepEqual(await rpc('ibkr_report_history'),[]);
    for (const name of ['ibkr_report_status','ibkr_report_records']) await assert.rejects(rpc(name,[first.id]),/REPORT_UNAVAILABLE/);
    await assert.rejects(confirm(first),/REPORT_UNAVAILABLE/);
    await assert.rejects(stage(monthly,bob,portfolio),/PORTFOLIO_UNAVAILABLE/);
    await db.exec('reset role; set role anon');
    await assert.rejects(rpc('ibkr_report_history'),/permission denied/);
    await assert.rejects(confirm(first),/permission denied/);
    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1',[alice]);
    for (const table of ['accounts','reports','events','postings','provenance','confirmations']) {
      assert.equal((await db.query<{n:number}>(`select count(*)::int n from ibkr_private.${table}`)).rows[0].n,0);
    }
  } finally { await db.close(); }
});

test('HTTP ingress verifies identity before reading and ignores client validation', async () => {
  let calls = 0;
  const handler = createImportHandler({ authenticate: async token => token === 'valid' ? 'verified-user' : null,
    stage: async (owner, _portfolio, _xml, preview) => { calls++; assert.equal(owner,'verified-user'); return { issues:preview.issues }; } });
  const request = (body: string, token = 'valid', contentType = 'application/xml') => new Request('https://example.invalid', {
    method:'POST', headers:{authorization:`Bearer ${token}`,'content-type':contentType,'x-portfolio-id':randomUUID()},body,
  });
  assert.equal((await handler(request(cashReport(),'invalid'))).status,401); assert.equal(calls,0);
  assert.equal((await handler(request('{"supported":true}'))).status,400); assert.equal(calls,0);
  assert.equal((await handler(request('<!DOCTYPE x>'+cashReport()))).status,400); assert.equal(calls,0);
  assert.equal((await handler(request('x'.repeat(MAX_REPORT_BYTES+1)))).status,413); assert.equal(calls,0);
  assert.equal((await handler(request(cashReport()))).status,200); assert.equal(calls,1);
  const response = await handler(request(cashReport().replace('Deposits/Withdrawals','Dividends')));
  assert.ok((await response.json()).issues.length>0);
  const failing = createImportHandler({authenticate:async()=> 'owner',stage:async()=>{throw new Error('secret report value');}});
  assert.deepEqual(await (await failing(request(cashReport()))).json(),{code:'TEMPORARY_FAILURE'});
});
