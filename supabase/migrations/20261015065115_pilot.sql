-- Apply once in Supabase SQL Editor. No credentials or user data in this migration.
begin;

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (user_id, id), unique (user_id, name)
);

-- Extend to trades only after the IBKR mapping and accounting rules are verified.
create table public.cash_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null,
  request_id uuid not null,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric not null check (amount > 0 and amount < 1e18 and scale(amount) <= 18),
  occurred_on date not null check (occurred_on >= date '1900-01-01'),
  source text not null default 'manual' check (source = 'manual'),
  created_at timestamptz not null default now(),
  unique (user_id, request_id),
  foreign key (user_id, portfolio_id) references public.portfolios(user_id, id)
);
create index cash_entries_owner_date on public.cash_entries(user_id, occurred_on desc, created_at desc);
create index cash_entries_portfolio on public.cash_entries(user_id, portfolio_id, currency);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null,
  object_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  format text not null check (format in ('ibkr-flex-xml', 'ibkr-activity-csv')),
  status text not null default 'uploaded' check (status in ('uploaded', 'review', 'applied', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, sha256),
  check (split_part(object_path, '/', 1) = user_id::text),
  foreign key (user_id, portfolio_id) references public.portfolios(user_id, id)
);

create table public.cash_entry_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null,
  action text not null,
  snapshot jsonb not null,
  recorded_at timestamptz not null default now()
);

alter table public.portfolios enable row level security;
alter table public.cash_entries enable row level security;
alter table public.import_batches enable row level security;
alter table public.cash_entry_audit enable row level security;
revoke all on public.portfolios, public.cash_entries, public.import_batches, public.cash_entry_audit from anon, authenticated;
grant select on public.portfolios, public.import_batches to authenticated;
-- Numeric amounts are only exposed as strings through list_cash_entries().
grant select (id, user_id, portfolio_id, kind, currency, occurred_on, created_at) on public.cash_entries to authenticated;
create policy own_portfolios on public.portfolios for select to authenticated using (user_id = (select auth.uid()));
create policy own_cash on public.cash_entries for select to authenticated using (user_id = (select auth.uid()));
create policy own_batches on public.import_batches for select to authenticated using (user_id = (select auth.uid()));
-- No client write/delete grants. Changes go through validated RPCs; imports are not active yet.

create function public.create_portfolio(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid; owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 80 then raise exception 'Invalid portfolio name'; end if;
  insert into public.portfolios(user_id, name) values (owner_id, btrim(p_name))
    on conflict (user_id, name) do update set name = excluded.name returning id into result;
  return result;
end;
$$;

create function public.add_cash_entry(p_request_id uuid, p_portfolio_id uuid, p_kind text, p_currency text, p_amount text, p_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); existing public.cash_entries; parsed numeric; result uuid;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_request_id is null or p_amount is null or p_amount !~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$'
    or p_kind is null or p_kind not in ('deposit', 'withdrawal')
    or p_currency is null or p_currency !~ '^[A-Z]{3}$'
    or p_date is null or p_date < date '1900-01-01' or p_date > current_date
    then raise exception 'Invalid cash entry'; end if;
  parsed := p_amount::numeric;
  if parsed <= 0 then raise exception 'Amount must be positive'; end if;
  -- Serialize a user's cash writes, including duplicate retries and different portfolios.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if not exists (select 1 from public.portfolios where id = p_portfolio_id and user_id = owner_id)
    then raise exception 'Portfolio unavailable'; end if;
  select * into existing from public.cash_entries where user_id = owner_id and request_id = p_request_id;
  if found then
    if existing.portfolio_id <> p_portfolio_id or existing.kind <> p_kind or existing.currency <> p_currency
      or existing.amount <> parsed or existing.occurred_on <> p_date
      then raise exception 'Request ID already used with different values'; end if;
    return existing.id;
  end if;
  -- Check every dated balance: a backdated withdrawal must not break a later balance.
  if exists (
    select 1 from (
      select sum(delta) over (order by day) as balance from (
        select occurred_on as day, case when kind = 'deposit' then amount else -amount end as delta
        from public.cash_entries where user_id = owner_id and portfolio_id = p_portfolio_id and currency = p_currency
        union all select p_date, case when p_kind = 'deposit' then parsed else -parsed end
      ) movements
    ) balances where balance < 0
  ) then raise exception 'Insufficient recorded cash'; end if;
  insert into public.cash_entries(user_id, portfolio_id, request_id, kind, currency, amount, occurred_on)
    values(owner_id, p_portfolio_id, p_request_id, p_kind, p_currency, parsed, p_date) returning id into result;
  insert into public.cash_entry_audit(user_id, entry_id, action, snapshot)
    values(owner_id, result, 'created', jsonb_build_object('portfolio_id', p_portfolio_id, 'kind', p_kind,
      'currency', p_currency, 'amount', p_amount, 'occurred_on', p_date, 'request_id', p_request_id));
  return result;
end;
$$;

create function public.list_cash_entries()
returns table(id uuid, portfolio_id uuid, kind text, currency text, amount text, occurred_on date)
language sql stable security definer set search_path = '' as $$
  select id, portfolio_id, kind, currency, amount::text, occurred_on
  from public.cash_entries where user_id = auth.uid()
  order by occurred_on desc, created_at desc, id desc limit 100;
$$;

revoke all on function public.create_portfolio(text) from public, anon;
revoke all on function public.add_cash_entry(uuid,uuid,text,text,text,date) from public, anon;
revoke all on function public.list_cash_entries() from public, anon;
grant execute on function public.create_portfolio(text), public.add_cash_entry(uuid,uuid,text,text,text,date), public.list_cash_entries() to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('ibkr-reports', 'ibkr-reports', false, 10485760, array['application/xml','text/xml','text/csv','application/octet-stream']);
create policy own_report_read on storage.objects for select to authenticated
  using (bucket_id = 'ibkr-reports' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Upload/update/delete policies intentionally absent until validated import is implemented.

commit;
