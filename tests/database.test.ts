import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('pilot SQL: isolation, RPC validation, exact decimals, retries and private files', async () => {
  const db = new PGlite();
  try {
    // Minimal platform contracts only. Production Auth and Storage need separate live checks.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, storage, public to anon, authenticated;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant select, insert, update, delete on storage.objects to authenticated;
      create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261015065115_pilot.sql', import.meta.url), 'utf8'));
    const alice = randomUUID(), bob = randomUUID();
    await db.query('insert into auth.users values ($1),($2)', [alice, bob]);
    const become = async (id: string) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      await db.exec('set role authenticated');
    };
    const portfolio = async () => (await db.query<{ id: string }>("select public.create_portfolio('IBKR') as id")).rows[0].id;
    const cash = (pid: string, kind: string, amount: string, day: string, request = randomUUID(), currency = 'USD') =>
      db.query<{ id: string }>('select public.add_cash_entry($1,$2,$3,$4,$5,$6) as id', [request, pid, kind, currency, amount, day]);
    await become(alice);
    const a = await portfolio();
    assert.equal(await portfolio(), a, 'portfolio creation retry is idempotent');
    const request = randomUUID();
    const first = await cash(a, 'deposit', '100.123456789012345678', '2023-01-01', request);
    assert.deepEqual(await cash(a, 'deposit', '100.123456789012345678', '2023-01-01', request), first);
    await assert.rejects(cash(a, 'deposit', '101', '2023-01-01', request), /different values/);
    assert.equal((await db.query<{ amount: string }>('select * from public.list_cash_entries()')).rows[0].amount, '100.123456789012345678');
    await cash(a, 'withdrawal', '100', '2023-02-01');
    await assert.rejects(cash(a, 'withdrawal', '1', '2023-01-15'), /Insufficient/);
    await assert.rejects(cash(a, 'withdrawal', '1', '2023-03-01', randomUUID(), 'EUR'), /Insufficient/);
    for (const amount of ['NaN', 'Infinity', '1e2', '-1', '0', '0.0000000000000000001']) {
      await assert.rejects(cash(a, 'deposit', amount, '2023-01-01'));
    }
    await assert.rejects(cash(a, 'deposit', '1', '2999-01-01'), /Invalid/);
    await assert.rejects(db.query('delete from public.cash_entries'), /permission denied/);
    await assert.rejects(db.query('update public.portfolios set user_id = $1', [bob]), /permission denied/);
    await assert.rejects(db.query('select * from public.cash_entry_audit'), /permission denied/);
    await become(bob);
    assert.equal((await db.query('select * from public.portfolios')).rows.length, 0);
    assert.equal((await db.query('select * from public.list_cash_entries()')).rows.length, 0);
    await assert.rejects(cash(a, 'deposit', '1', '2023-01-01'), /Portfolio unavailable/);
    const b = await portfolio();
    await cash(b, 'deposit', '10', '2023-01-01');
    await db.exec('reset role');
    assert.equal((await db.query('select * from public.cash_entry_audit')).rows.length, 3);
    await assert.rejects(db.query(`insert into public.cash_entries(user_id,portfolio_id,request_id,kind,currency,amount,occurred_on)
      values ($1,$2,$3,'deposit','USD',1,'2023-01-01')`, [bob, a, randomUUID()]), /foreign key/);
    await db.query("insert into storage.objects(bucket_id,name) values ('ibkr-reports',$1),('ibkr-reports',$2)", [`${alice}/a.xml`, `${bob}/b.xml`]);
    await become(alice);
    assert.deepEqual((await db.query<{ name: string }>('select name from storage.objects')).rows.map(x => x.name), [`${alice}/a.xml`]);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('ibkr-reports',$1)", [`${alice}/unvalidated.xml`]), /row-level security/);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query('select * from public.portfolios'), /permission denied/);
    await assert.rejects(db.query('select * from public.list_cash_entries()'), /permission denied/);
    await assert.rejects(db.query("select public.create_portfolio('No access')"), /permission denied/);
  } finally { await db.close(); }
});
