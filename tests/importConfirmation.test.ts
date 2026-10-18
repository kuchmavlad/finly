import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ImportConfirmation } from '../src/state/importConfirmation.ts';
import { ImportFailure, type ImportSummary, type ImportPending } from '../src/domain/ibkr/import.ts';

const summary = (): ImportSummary => ({id:randomUUID(),portfolioId:randomUUID(),account:'••••TEST',
  from:'2026-07-01',to:'2026-07-31',digest:'a'.repeat(64),status:'ready',newCount:1,unchangedCount:0,changedCount:0,
  issues:[],balances:[],createdAt:'2026-10-18',appliedAt:null});
function setup() {
  let stored: string|null=null; let server=summary(); let failSave=false; let failClear=false;
  let loseResponse=false; const sent: ImportPending[]=[];
  const storage = {getItem:async()=>stored,setItem:async(_key:string,value:string)=>{if(failSave) throw Error();stored=value;},
    removeItem:async()=>{if(failClear) throw Error();stored=null;}};
  const deps = {key:'owner.project.import',uuid:randomUUID,storage,status:async()=>server,confirm:async(p:ImportPending)=>{
    assert.ok(stored,'persist before network write');sent.push(p);server={...server,status:'applied'};
    if(loseResponse) throw Error('timeout');return server;
  }};
  return {deps,sent,get stored(){return stored;},set stored(v){stored=v;},get server(){return server;},set server(v){server=v;},
    set failSave(v:boolean){failSave=v;},set failClear(v:boolean){failClear=v;},set loseResponse(v:boolean){loseResponse=v;}};
}
test('confirmation survives a lost reply and restart, checking status before retry',async()=>{
  const f=setup();const first=new ImportConfirmation(f.deps);await first.restore();f.loseResponse=true;
  await first.apply(f.server);assert.ok(first.getSnapshot().pending);assert.equal(f.sent.length,1);
  const request=JSON.parse(f.stored!).requestId;first.dispose();
  const second=new ImportConfirmation(f.deps);await second.restore();assert.equal(second.getSnapshot().pending?.requestId,request);
  await second.apply();assert.equal(f.sent.length,1);assert.equal(second.getSnapshot().result?.status,'applied');assert.equal(f.stored,null);
});
test('double press cannot send twice; failed storage save prevents any write',async()=>{
  const f=setup();const store=new ImportConfirmation(f.deps);await store.restore();f.failSave=true;
  await store.apply(f.server);assert.equal(f.sent.length,0);
  f.failSave=false;await Promise.all([store.apply(f.server),store.apply(f.server)]);assert.equal(f.sent.length,1);
});
test('failed pending cleanup preserves applied result and recovers without another confirm',async()=>{
  const f=setup();const store=new ImportConfirmation(f.deps);await store.restore();f.failClear=true;
  await store.apply(f.server);assert.equal(store.getSnapshot().result?.status,'applied');assert.ok(store.getSnapshot().pending);
  f.failClear=false;await store.apply();assert.equal(f.sent.length,1);assert.equal(f.stored,null);
});
test('stale review clears rejected intent and never confirms new server values',async()=>{
  const f=setup();const initial=f.server;f.server={...initial,digest:'b'.repeat(64)};
  const store=new ImportConfirmation(f.deps);await store.restore();await store.apply(initial);
  assert.equal(f.sent.length,0);assert.equal(f.stored,null);assert.match(store.getSnapshot().error,/changed/);
});
test('corrupt or unreadable pending storage blocks writes',async()=>{
  const f=setup();f.stored='{}';const store=new ImportConfirmation(f.deps);await store.restore();await store.apply(f.server);
  assert.equal(store.getSnapshot().ready,false);assert.equal(f.sent.length,0);
  f.deps.storage.getItem=async()=>{throw Error();};await store.restore();assert.equal(store.getSnapshot().ready,false);
});
test('leaving or changing account during persistence cannot send a confirmation',async()=>{
  const f=setup();let release:()=>void=()=>{};
  const original=f.deps.storage.setItem;
  f.deps.storage.setItem=async(k,v)=>{await new Promise<void>(resolve=>{release=resolve;});await original(k,v);};
  const store=new ImportConfirmation(f.deps);await store.restore();const action=store.apply(f.server);
  store.dispose();release();await action;assert.equal(f.sent.length,0);assert.ok(f.stored);
});
test('definitive server rejection clears pending, network failure retains original request',async()=>{
  const f=setup();f.deps.confirm=async()=>{throw new ImportFailure('MANUAL_OVERLAP');};
  const store=new ImportConfirmation(f.deps);await store.restore();await store.apply(f.server);assert.equal(f.stored,null);
  let first='';f.deps.confirm=async(p)=>{if(!first)first=p.requestId;assert.equal(p.requestId,first);throw Error('offline');};
  await store.apply(f.server);await store.apply();assert.ok(f.stored);assert.equal(JSON.parse(f.stored!).requestId,first);
});
