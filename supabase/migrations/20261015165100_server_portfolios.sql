-- Additive read API; existing write RPCs, RLS and grants remain unchanged.
begin;

create index cash_entries_owner_cursor on public.cash_entries(user_id, occurred_on desc, created_at desc, id desc);
create index cash_entries_portfolio_cursor on public.cash_entries(user_id, portfolio_id, occurred_on desc, created_at desc, id desc);

-- SECURITY DEFINER is needed to read numeric, which is deliberately not granted to clients.
create function public.cash_balances(p_portfolio_id uuid default null)
returns table(currency text, amount text)
language plpgsql stable security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_portfolio_id is not null and not exists (
    select 1 from public.portfolios p where p.id = p_portfolio_id and p.user_id = owner_id
  ) then raise exception 'Portfolio unavailable'; end if;
  return query
    select c.currency, sum(case when c.kind = 'deposit' then c.amount else -c.amount end)::text
    from public.cash_entries c
    where c.user_id = owner_id and (p_portfolio_id is null or c.portfolio_id = p_portfolio_id)
    group by c.currency order by c.currency;
end;
$$;

create function public.cash_entries_page(
  p_portfolio_id uuid default null, p_kind text default null,
  p_before_date date default null, p_before_created_at timestamptz default null, p_before_id uuid default null
)
returns table(id uuid, portfolio_id uuid, kind text, currency text, amount text, occurred_on date, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if p_portfolio_id is not null and not exists (
    select 1 from public.portfolios p where p.id = p_portfolio_id and p.user_id = owner_id
  ) then raise exception 'Portfolio unavailable'; end if;
  if p_kind is not null and p_kind not in ('deposit', 'withdrawal') then raise exception 'Invalid cash filter'; end if;
  if num_nonnulls(p_before_date, p_before_created_at, p_before_id) not in (0, 3) then raise exception 'Incomplete cursor'; end if;
  return query
    select c.id, c.portfolio_id, c.kind, c.currency, c.amount::text, c.occurred_on, c.created_at
    from public.cash_entries c
    where c.user_id = owner_id and (p_portfolio_id is null or c.portfolio_id = p_portfolio_id)
      and (p_kind is null or c.kind = p_kind)
      and (p_before_date is null or (c.occurred_on, c.created_at, c.id) < (p_before_date, p_before_created_at, p_before_id))
    order by c.occurred_on desc, c.created_at desc, c.id desc limit 50;
end;
$$;

revoke all on function public.cash_balances(uuid) from public, anon;
revoke all on function public.cash_entries_page(uuid,text,date,timestamptz,uuid) from public, anon;
grant execute on function public.cash_balances(uuid), public.cash_entries_page(uuid,text,date,timestamptz,uuid) to authenticated;
commit;
