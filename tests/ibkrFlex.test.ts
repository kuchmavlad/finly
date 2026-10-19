import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { flexEnvelope, fetchFlex, FlexError, type FlexClaim } from '../supabase/functions/_shared/ibkr/flex.ts';
import { createFlexHandler, flexStep } from '../supabase/functions/_shared/ibkr/flexHandler.ts';
import { parsePreview } from '../supabase/functions/_shared/ibkr/preview.ts';
import { cashReport,cashRow } from './fixtures/ibkr.ts';

const claim:FlexClaim={lease:randomUUID(),token:'12345678901234567890',queryId:'123',reference:null,from:'2026-07-01',to:'2026-07-31',account:'TEST',attempts:1};
const envelope=(code:string)=>`<FlexStatementResponse><Status>Fail</Status><ErrorCode>${code}</ErrorCode><ErrorMessage>secret details</ErrorMessage></FlexStatementResponse>`;
test('Flex protocol: strict XML, fixed origin, no redirect or token-bearing errors',async()=>{
  assert.equal(flexEnvelope('<FlexStatementResponse><Status>Success</Status><ReferenceCode>1234</ReferenceCode><url>https://evil.test</url></FlexStatementResponse>'),'1234');
  for(const xml of ['<!DOCTYPE x><FlexStatementResponse/>','<FlexStatementResponse><Status>Success</Status><ReferenceCode>1</ReferenceCode><ReferenceCode>2</ReferenceCode></FlexStatementResponse>','<html/>']) assert.throws(()=>flexEnvelope(xml),/INVALID_RESPONSE/);
  await fetchFlex(claim,async(url,options)=>{
    const target=new URL(String(url)); assert.equal(target.origin,'https://ndcdyn.interactivebrokers.com');
    assert.equal(target.searchParams.get('fd'),'20260701');assert.equal(target.searchParams.get('td'),'20260731');assert.equal(options?.redirect,'error');
    return new Response('<FlexStatementResponse><Status>Success</Status><ReferenceCode>42</ReferenceCode></FlexStatementResponse>');
  });
  await assert.rejects(fetchFlex(claim,async()=>{throw new Error(`https://secret/${claim.token}`);}),e=>e instanceof FlexError && e.message==='NETWORK_TIMEOUT');
  for(const [code,expected,retryable] of [['1012','TOKEN_EXPIRED',false],['1015','TOKEN_INVALID',false],['1018','RATE_LIMITED',true],['1019','GENERATING',true],['1003','BROKER_REJECTED',false],['1017','BROKER_REJECTED',false]] as const) {
    await assert.rejects(fetchFlex({...claim,reference:'42'},async()=>new Response(envelope(code))),e=>e instanceof FlexError&&e.code===expected&&e.retryable===retryable);
  }
});
test('Flex handler authenticates first and never echoes secrets',async()=>{
  let calls=0;
  const handler=createFlexHandler({authenticate:async()=>null,rpc:async()=>{calls++;}});
  const response=await handler(new Request('https://test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:'not JSON'}));
  assert.equal(response.status,401);assert.equal(calls,0);
  const failing=createFlexHandler({authenticate:async()=>randomUUID(),rpc:async()=>{throw new Error(claim.token);}});
  const result=await failing(new Request('https://test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({action:'configure',token:claim.token,queryId:'1',portfolioId:randomUUID()})}));
  assert.deepEqual(await result.json(),{code:'TEMPORARY_FAILURE'});
});
test('Flex worker reuses reference and blocks wrong period before staging',async()=>{
  const calls:{name:string;args:Record<string,unknown>}[]=[];
  await flexStep('owner',{rpc:async(name,args)=>{calls.push({name,args});return name==='claim_ibkr_flex'?{...claim,reference:'42',from:'2026-07-02'}:null;},transport:async url=>{
    assert.equal(new URL(String(url)).searchParams.get('q'),'42'); return new Response(cashReport(cashRow('a'),'10'));
  }});
  assert.equal(calls[1].args.p_code,'REPORT_SCOPE_MISMATCH');assert.equal(calls[1].args.p_xml,undefined);
  assert.ok(!calls.some(c=>c.name==='confirm_ibkr_report'));
});

test('Flex SQL: private credentials, fencing, resume, owner isolation, atomic stage and cleanup',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create schema storage;create schema vault;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid,bucket_id text,name text);
      create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
      -- Synthetic Vault contract only. Encryption is verified separately on hosted Vault.
      create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text,name text);
      create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(s text) returns uuid language sql as $$insert into vault.secrets(secret) values(s) returning id$$;
      create function vault.update_secret(i uuid,s text) returns void language sql as $$update vault.secrets set secret=s where id=i$$;`);
    for(const file of ['20261015065115_pilot.sql','20261015165100_server_portfolios.sql','20261018084534_ibkr_journal.sql','20261018084801_ibkr_owner_cleanup.sql','20261018155813_ibkr_flex_sync.sql','20261019113550_ibkr_flex_history.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
    const alice=randomUUID(),bob=randomUUID(); await db.query('insert into auth.users values($1),($2)',[alice,bob]);
    const become=async(id:string)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
    const rpc=async<T=unknown>(name:string,args:unknown[]=[])=> (await db.query<{r:T}>(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) r`,args)).rows[0].r;
    await become(alice);const portfolio=await rpc<string>('create_portfolio',['Flex synthetic']);
    await db.exec('reset role');await db.query('insert into ibkr_private.accounts(user_id,account,portfolio_id) values($1,$2,$3)',[alice,'TEST',portfolio]);
    await db.exec('set role service_role');await rpc('configure_ibkr_flex',[alice,portfolio,claim.token,'123']);
    await rpc('start_ibkr_flex',[alice]);const first=await rpc<FlexClaim>('claim_ibkr_flex',[alice]);assert.ok(first.lease);
    assert.equal(await rpc('claim_ibkr_flex',[alice]),null,'parallel worker blocked');
    await assert.rejects(rpc('configure_ibkr_flex',[alice,portfolio,claim.token,'123']),/SYNC_BUSY/);
    await rpc('finish_ibkr_flex',[alice,first.lease,'42']);
    assert.equal(await rpc('claim_ibkr_flex',[alice]),null,'server enforces polling interval');
    await become(alice);const status=await rpc<Record<string,unknown>>('ibkr_flex_status');
    assert.equal(status.state,'waiting');assert.ok(!JSON.stringify(status).includes(claim.token));assert.ok(!('reference' in status));
    await assert.rejects(rpc('claim_ibkr_flex',[alice]),/permission denied/);
    await assert.rejects(db.query('select * from vault.decrypted_secrets'),/permission denied/);
    await assert.rejects(db.query('select * from ibkr_private.flex_connections'),/permission denied/);
    await assert.rejects(rpc('ibkr_flex_daily',[true]),/MANUAL_SYNC_REQUIRED/);
    await become(bob);assert.equal((await rpc<{configured:boolean}>('ibkr_flex_status')).configured,false);
    await rpc('disconnect_ibkr_flex');
    await db.exec('reset role');
    await db.query("update ibkr_private.flex_connections set next_request_at=now()-interval '1 second',from_date='2026-07-01',to_date='2026-07-31' where user_id=$1",[alice]);
    await db.exec('set role service_role');const second=await rpc<FlexClaim>('claim_ibkr_flex',[alice]);assert.equal(second.reference,'42');
    await assert.rejects(rpc('finish_ibkr_flex',[alice,first.lease,null,'NETWORK_TIMEOUT',true]),/LEASE_EXPIRED/);
    const xml=cashReport(cashRow('precise','10.000000000000000001'),'10.000000000000000001');const preview=await parsePreview(xml);
    await assert.rejects(rpc('finish_ibkr_flex',[alice,second.lease,null,null,false,xml,{...preview,account:'WRONG'}]),/REPORT_SCOPE_MISMATCH/);
    await rpc('finish_ibkr_flex',[alice,second.lease,null,null,false,xml,preview]);
    await become(alice);const ready=await rpc<{state:string;reportId:string;lastSuccessAt:string;manualVerified:boolean}>('ibkr_flex_status');
    assert.equal(ready.state,'review');assert.ok(ready.lastSuccessAt);assert.ok(ready.manualVerified);
    await assert.rejects(rpc('ibkr_flex_daily',[true]),/SCHEDULER_NOT_READY/);
    const rechecked=await rpc<{id:string}>('recheck_ibkr_report',[ready.reportId]);assert.equal(rechecked.id,ready.reportId);
    await become(bob);await assert.rejects(rpc('recheck_ibkr_report',[ready.reportId]),/REPORT_UNAVAILABLE/);
    await db.exec('reset role');assert.equal((await db.query<{n:number}>('select count(*)::int n from ibkr_private.events')).rows[0].n,0,'retrieval never applies');
    await db.query("update ibkr_private.flex_connections set state='waiting',daily_enabled=true,attempts=1,next_request_at=now()-interval '1 second',lease_until=now()-interval '1 second' where user_id=$1",[alice]);
    await db.exec('set role service_role');const resumed=await rpc<FlexClaim>('claim_ibkr_flex',[alice]);assert.equal(resumed.reference,'42');
    await rpc('finish_ibkr_flex',[alice,resumed.lease,null,'TOKEN_EXPIRED',false]);
    await become(alice);const expired=await rpc<{state:string;dailyEnabled:boolean;lastSuccessAt:string}>('ibkr_flex_status');
    assert.equal(expired.state,'error');assert.equal(expired.dailyEnabled,false);assert.equal(expired.lastSuccessAt,ready.lastSuccessAt);
    await db.exec('reset role');await db.query("update ibkr_private.flex_connections set next_request_at=now()-interval '1 second' where user_id=$1",[alice]);
    await db.exec('set role service_role');
    await assert.rejects(rpc('queue_ibkr_history',[alice,'2000-01-01']),/HISTORY_DATE_UNAVAILABLE/);
    await rpc('queue_ibkr_history',[alice,'2024-03-08']);await rpc('queue_ibkr_history',[alice,'2024-03-08']);
    await assert.rejects(rpc('queue_ibkr_history',[alice,'2024-03-09']),/HISTORY_ALREADY_PLANNED/);
    await assert.rejects(rpc('start_ibkr_flex',[alice]),/HISTORY_IN_PROGRESS/);
    await rpc('advance_ibkr_history',[alice]);const month=await rpc<FlexClaim>('claim_ibkr_flex',[alice]);
    assert.equal(month.from,'2024-03-08');assert.equal(month.to,'2024-03-31');
    const monthXml=cashReport('','0','20240308','20240331');
    await rpc('finish_ibkr_flex',[alice,month.lease,null,null,false,monthXml,await parsePreview(monthXml)]);
    await become(alice);
    type History={from:string;to:string;state:string;reviewStatus:string};
    const plan=(await rpc<{history:History[]}>('ibkr_flex_status')).history;
    assert.equal(plan[0].state,'received');assert.equal(plan[0].reviewStatus,'ready');assert.equal(plan[1].from,'2024-04-01');
    for(let i=1;i<plan.length;i++)assert.equal(Date.parse(plan[i].from)-Date.parse(plan[i-1].to),86400000,'no coverage gaps');
    await become(bob);assert.deepEqual((await rpc<{history:unknown[]}>('ibkr_flex_status')).history,[]);
    await assert.rejects(rpc('queue_ibkr_history',[alice,'2024-03-08']),/permission denied/);
    await db.exec('reset role; set role service_role');await assert.rejects(rpc('configure_ibkr_flex',[alice,portfolio,claim.token,'456']),/HISTORY_CONNECTION_LOCKED/);
    await db.exec('reset role');await db.query("update ibkr_private.flex_connections set next_request_at=now()-interval '1 second' where user_id=$1",[alice]);await db.exec('set role service_role');
    await rpc('advance_ibkr_history',[alice]);const april=await rpc<FlexClaim>('claim_ibkr_flex',[alice]);assert.equal(april.from,'2024-04-01');
    await rpc('finish_ibkr_flex',[alice,april.lease,null,'BROKER_REJECTED',false]);
    await rpc('advance_ibkr_history',[alice]);assert.equal(await rpc('claim_ibkr_flex',[alice]),null,'error does not silently skip month');
    await become(alice);const failed=(await rpc<{history:History[]}>('ibkr_flex_status')).history;assert.equal(failed[1].state,'error');assert.equal(failed[2].state,'pending');
    await rpc('disconnect_ibkr_flex');
    await db.exec('reset role');assert.equal((await db.query<{n:number}>('select count(*)::int n from vault.secrets')).rows[0].n,0);
    assert.equal((await db.query<{n:number}>('select count(*)::int n from ibkr_private.reports')).rows[0].n,2,'disconnect preserves reports');
    assert.equal((await db.query<{n:number}>('select count(*)::int n from ibkr_private.flex_history')).rows[0].n,0,'disconnect removes queue');
    await db.exec('set role anon');await assert.rejects(rpc('ibkr_flex_status'),/permission denied/);
  } finally {await db.close();}
});
