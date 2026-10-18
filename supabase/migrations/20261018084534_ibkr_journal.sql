-- A source journal, not published portfolio balances or investment returns.
-- Raw XML and its parsed snapshot are committed together: no Storage/DB split.
begin;
create schema ibkr_private;
revoke all on schema ibkr_private from public, anon, authenticated;

create table ibkr_private.accounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  account text not null check (length(account) between 1 and 80),
  portfolio_id uuid not null,
  revision bigint not null default 0,
  primary key (user_id, account), unique (user_id, portfolio_id),
  foreign key (user_id, portfolio_id) references public.portfolios(user_id, id)
);
create table ibkr_private.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null,
  account text not null check (length(account) between 1 and 80),
  source_xml text not null check (octet_length(source_xml) between 1 and 10485760),
  sha256 text not null,
  adapter text not null check (adapter = 'flex-journal-v1'),
  snapshot jsonb not null,
  revision bigint not null,
  digest text not null,
  status text not null check (status in ('ready', 'blocked', 'applied')),
  new_count integer not null, unchanged_count integer not null, changed_count integer not null,
  created_at timestamptz not null default now(), applied_at timestamptz,
  unique (user_id, sha256), unique (user_id, id),
  foreign key (user_id, portfolio_id) references public.portfolios(user_id, id)
);
create index ibkr_reports_history on ibkr_private.reports(user_id, created_at desc, id desc);
create table ibkr_private.events (
  user_id uuid not null,
  account text not null,
  identity_hash text not null,
  payload jsonb not null,
  first_report uuid not null,
  primary key (user_id, account, identity_hash),
  foreign key (user_id, account) references ibkr_private.accounts(user_id, account),
  foreign key (user_id, first_report) references ibkr_private.reports(user_id, id)
);
create index ibkr_events_report on ibkr_private.events(user_id, first_report);
create table ibkr_private.postings (
  user_id uuid not null, account text not null, identity_hash text not null, ordinal integer not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric not null check (amount > -1e18 and amount < 1e18 and scale(amount) <= 18),
  primary key (user_id, account, identity_hash, ordinal),
  foreign key (user_id, account, identity_hash) references ibkr_private.events(user_id, account, identity_hash)
);
create table ibkr_private.provenance (
  user_id uuid not null, report_id uuid not null, account text not null, identity_hash text not null,
  primary key (user_id, report_id, identity_hash),
  foreign key (user_id, report_id) references ibkr_private.reports(user_id, id),
  foreign key (user_id, account, identity_hash) references ibkr_private.events(user_id, account, identity_hash)
);
create index ibkr_provenance_event on ibkr_private.provenance(user_id, account, identity_hash);
create table ibkr_private.confirmations (
  user_id uuid not null, request_id uuid not null, report_id uuid not null, digest text not null,
  primary key (user_id, request_id),
  foreign key (user_id, report_id) references ibkr_private.reports(user_id, id)
);
create index ibkr_confirmations_report on ibkr_private.confirmations(user_id, report_id);
-- Defense in depth: tables are unexposed, with no direct client or service writes.
alter table ibkr_private.accounts enable row level security;
alter table ibkr_private.reports enable row level security;
alter table ibkr_private.events enable row level security;
alter table ibkr_private.postings enable row level security;
alter table ibkr_private.provenance enable row level security;
alter table ibkr_private.confirmations enable row level security;
revoke all on all tables in schema ibkr_private from public, anon, authenticated, service_role;

create function ibkr_private.summary(r ibkr_private.reports) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'portfolioId', r.portfolio_id,
    'account', '••••' || right(r.account, 4), 'from', r.snapshot->>'from', 'to', r.snapshot->>'to',
    'digest', r.digest, 'status', r.status, 'newCount', r.new_count,
    'unchangedCount', r.unchanged_count, 'changedCount', r.changed_count,
    'issues', r.snapshot->'issues', 'balances', r.snapshot->'balances',
    'createdAt', r.created_at, 'appliedAt', r.applied_at);
$$;

-- Only the verified Edge Function may submit a parsed snapshot. Clients cannot
-- attest to their own validation or provide owner_id through an authenticated RPC.
create function public.stage_ibkr_report(p_user_id uuid, p_portfolio_id uuid, p_xml text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r ibkr_private.reports; a text := p_snapshot->>'account'; h text;
  rev bigint; n integer; u integer; c integer; ready boolean; d text;
begin
  if p_user_id is null or p_xml is null or octet_length(p_xml) not between 1 and 10485760
    or a is null or length(a) not between 1 and 80
    or jsonb_typeof(p_snapshot->'events') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'issues') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'balances') is distinct from 'array'
    then raise exception 'INVALID_REPORT'; end if;
  if jsonb_array_length(p_snapshot->'events') > 5000 then raise exception 'LIMIT_EXCEEDED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  if not exists (select 1 from public.portfolios where user_id=p_user_id and id=p_portfolio_id)
    then raise exception 'PORTFOLIO_UNAVAILABLE'; end if;
  if exists (select 1 from public.cash_entries where user_id=p_user_id and portfolio_id=p_portfolio_id)
    then raise exception 'MANUAL_OVERLAP'; end if;
  if exists (select 1 from ibkr_private.accounts where user_id=p_user_id and
    ((account=a and portfolio_id<>p_portfolio_id) or (portfolio_id=p_portfolio_id and account<>a)))
    then raise exception 'ACCOUNT_MAPPING_CONFLICT'; end if;
  h := encode(sha256(convert_to(p_xml, 'UTF8')), 'hex');
  select * into r from ibkr_private.reports where user_id=p_user_id and sha256=h;
  if found then
    if r.portfolio_id<>p_portfolio_id then raise exception 'ACCOUNT_MAPPING_CONFLICT'; end if;
    if r.status='applied' then return ibkr_private.summary(r); end if;
  else
    if (select count(*) from ibkr_private.reports where user_id=p_user_id) >= 100
      or (select coalesce(sum(octet_length(source_xml)),0) from ibkr_private.reports where user_id=p_user_id)
        + octet_length(p_xml) > 104857600 then raise exception 'STORAGE_LIMIT'; end if;
  end if;
  select coalesce(max(revision),0) into rev from ibkr_private.accounts where user_id=p_user_id and account=a;
  select count(*) filter (where old.identity_hash is null),
    count(*) filter (where old.payload->>'signature'=e->>'signature' and old.payload->>'key'=e->>'key'),
    count(*) filter (where old.identity_hash is not null and
      (old.payload->>'signature' is distinct from e->>'signature' or old.payload->>'key' is distinct from e->>'key'))
  into n,u,c from jsonb_array_elements(p_snapshot->'events') e
  left join ibkr_private.events old on old.user_id=p_user_id and old.account=a
    and old.identity_hash=encode(sha256(convert_to(e->>'key','UTF8')),'hex');
  ready := jsonb_array_length(p_snapshot->'issues')=0 and c=0;
  if exists (select 1 from jsonb_array_elements(p_snapshot->'events') e
    where e->>'supported' is distinct from 'true' or coalesce(e->>'key','')='')
    or exists (select 1 from jsonb_array_elements(p_snapshot->'events') e group by e->>'key' having count(*)>1)
    then ready := false; end if;
  d := encode(sha256(convert_to(jsonb_build_array(h,p_portfolio_id,a,'flex-journal-v1',rev,p_snapshot)::text,'UTF8')),'hex');
  insert into ibkr_private.reports(user_id,portfolio_id,account,source_xml,sha256,adapter,snapshot,revision,digest,status,new_count,unchanged_count,changed_count)
    values(p_user_id,p_portfolio_id,a,p_xml,h,'flex-journal-v1',p_snapshot,rev,d,case when ready then 'ready' else 'blocked' end,n,u,c)
    on conflict(user_id,sha256) do update set snapshot=excluded.snapshot,revision=excluded.revision,digest=excluded.digest,
      status=excluded.status,new_count=excluded.new_count,unchanged_count=excluded.unchanged_count,changed_count=excluded.changed_count
    returning * into r;
  return ibkr_private.summary(r);
end;
$$;

create function public.ibkr_report_status(p_report_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r ibkr_private.reports;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into r from ibkr_private.reports where user_id=auth.uid() and id=p_report_id;
  if not found then raise exception 'REPORT_UNAVAILABLE'; end if;
  return ibkr_private.summary(r);
end;
$$;
create function public.ibkr_report_history() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  return (select coalesce(jsonb_agg(ibkr_private.summary(r) order by r.created_at desc,r.id desc),'[]'::jsonb)
    from (select * from ibkr_private.reports where user_id=auth.uid() order by created_at desc,id desc limit 20) r);
end;
$$;

create function public.confirm_ibkr_report(p_report_id uuid, p_digest text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); r ibkr_private.reports; req ibkr_private.confirmations;
  e jsonb; p jsonb; h text; rev bigint; idx integer;
begin
  if owner_id is null then raise exception 'UNAUTHORIZED'; end if;
  if p_request_id is null or p_digest is null then raise exception 'INVALID_CONFIRMATION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  select * into r from ibkr_private.reports where user_id=owner_id and id=p_report_id for update;
  if not found then raise exception 'REPORT_UNAVAILABLE'; end if;
  select * into req from ibkr_private.confirmations where user_id=owner_id and request_id=p_request_id;
  if found and (req.report_id<>p_report_id or req.digest<>p_digest) then raise exception 'REQUEST_CONFLICT'; end if;
  if r.digest<>p_digest then raise exception 'PREVIEW_STALE'; end if;
  if r.status='applied' then
    insert into ibkr_private.confirmations values(owner_id,p_request_id,r.id,p_digest)
      on conflict(user_id,request_id) do nothing;
    return ibkr_private.summary(r);
  end if;
  if r.status<>'ready' then raise exception 'REPORT_BLOCKED'; end if;
  if exists (select 1 from public.cash_entries where user_id=owner_id and portfolio_id=r.portfolio_id)
    then raise exception 'MANUAL_OVERLAP'; end if;
  if exists (select 1 from ibkr_private.accounts where user_id=owner_id and
    ((account=r.account and portfolio_id<>r.portfolio_id) or (portfolio_id=r.portfolio_id and account<>r.account)))
    then raise exception 'ACCOUNT_MAPPING_CONFLICT'; end if;
  select coalesce(max(revision),0) into rev from ibkr_private.accounts where user_id=owner_id and account=r.account;
  if rev<>r.revision then raise exception 'PREVIEW_STALE'; end if;
  insert into ibkr_private.accounts(user_id,account,portfolio_id) values(owner_id,r.account,r.portfolio_id)
    on conflict(user_id,account) do nothing;
  for e in select value from jsonb_array_elements(r.snapshot->'events') loop
    h := encode(sha256(convert_to(e->>'key','UTF8')),'hex');
    if exists (select 1 from ibkr_private.events where user_id=owner_id and account=r.account and identity_hash=h
      and (payload->>'signature' is distinct from e->>'signature' or payload->>'key' is distinct from e->>'key'))
      then raise exception 'REVISION_CONFLICT'; end if;
    if not exists (select 1 from ibkr_private.events where user_id=owner_id and account=r.account and identity_hash=h) then
      insert into ibkr_private.events values(owner_id,r.account,h,e,r.id);
      idx := 0;
      for p in select value from jsonb_array_elements(e->'postings') loop
        if jsonb_typeof(p->'amount') is distinct from 'string' or (p->>'amount') !~ '^-?(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$'
          then raise exception 'INVALID_DECIMAL'; end if;
        insert into ibkr_private.postings values(owner_id,r.account,h,idx,p->>'currency',(p->>'amount')::numeric);
        idx := idx+1;
      end loop;
    end if;
    insert into ibkr_private.provenance values(owner_id,r.id,r.account,h);
  end loop;
  update ibkr_private.accounts set revision=revision+1 where user_id=owner_id and account=r.account;
  insert into ibkr_private.confirmations values(owner_id,p_request_id,r.id,p_digest);
  update ibkr_private.reports set status='applied',applied_at=now() where id=r.id returning * into r;
  return ibkr_private.summary(r);
end;
$$;

-- A mapped broker portfolio cannot acquire manual cash after review/apply.
create function public.ibkr_report_records(p_report_id uuid, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r ibkr_private.reports;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_offset is null or p_offset<0 or p_offset>5000 then raise exception 'INVALID_PAGE'; end if;
  select * into r from ibkr_private.reports where user_id=auth.uid() and id=p_report_id;
  if not found then raise exception 'REPORT_UNAVAILABLE'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('date',e->>'date','kind',e->>'kind',
    'label',e->>'label','location',e->>'location','postings',e->'postings') order by ord),'[]'::jsonb)
    from (select e,ord from jsonb_array_elements(r.snapshot->'events') with ordinality as x(e,ord)
      order by ord limit 25 offset p_offset) page);
end;
$$;

-- A mapped broker portfolio cannot acquire manual cash after review/apply.
-- Uses the same owner lock as existing add_cash_entry and the import transaction.
create function ibkr_private.guard_manual_cash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  if exists (select 1 from ibkr_private.accounts where user_id=new.user_id and portfolio_id=new.portfolio_id)
    then raise exception 'IBKR_PORTFOLIO_READ_ONLY'; end if;
  return new;
end;
$$;
create trigger guard_ibkr_manual before insert on public.cash_entries
for each row execute function ibkr_private.guard_manual_cash();

revoke all on all functions in schema ibkr_private from public, anon, authenticated, service_role;
revoke all on function public.stage_ibkr_report(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.stage_ibkr_report(uuid,uuid,text,jsonb) to service_role;
revoke all on function public.ibkr_report_status(uuid), public.ibkr_report_history(), public.confirm_ibkr_report(uuid,text,uuid) from public, anon, service_role;
grant execute on function public.ibkr_report_status(uuid), public.ibkr_report_history(), public.confirm_ibkr_report(uuid,text,uuid) to authenticated;
revoke all on function public.ibkr_report_records(uuid,integer) from public, anon, service_role;
grant execute on function public.ibkr_report_records(uuid,integer) to authenticated;
commit;
