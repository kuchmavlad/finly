begin;
-- Vault is provided by Supabase. No decrypted secrets or reference codes in client RPCs.
create table ibkr_private.flex_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  portfolio_id uuid not null,
  secret_id uuid not null,
  token_hash text not null unique,
  query_id text not null,
  daily_enabled boolean not null default false,
  manual_verified_at timestamptz,
  last_success_at timestamptz,
  last_received_at timestamptz,
  last_started_at timestamptz,
  next_request_at timestamptz not null default now(),
  state text not null default 'idle' check(state in ('idle','queued','waiting','review','blocked','error')),
  error_code text,
  reference_code text,
  from_date date, to_date date,
  attempts integer not null default 0,
  lease uuid, lease_until timestamptz,
  report_id uuid,
  origin text not null default 'manual',
  foreign key(user_id,portfolio_id) references public.portfolios(user_id,id),
  foreign key(user_id,report_id) references ibkr_private.reports(user_id,id)
);
alter table ibkr_private.flex_connections enable row level security;
revoke all on ibkr_private.flex_connections from public,anon,authenticated,service_role;

create function ibkr_private.flex_summary(c ibkr_private.flex_connections) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('configured',true,'portfolioId',c.portfolio_id,'queryId',c.query_id,
 'state',c.state,'code',c.error_code,'nextAttemptAt',c.next_request_at,'lastSuccessAt',c.last_success_at,
 'lastReceivedAt',c.last_received_at,'reportId',c.report_id,'from',c.from_date,'to',c.to_date,
 'dailyEnabled',c.daily_enabled,'manualVerified',c.manual_verified_at is not null);
$$;
create function public.ibkr_flex_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare c ibkr_private.flex_connections; result jsonb;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 select * into c from ibkr_private.flex_connections where user_id=auth.uid();
 result:=case when found then ibkr_private.flex_summary(c) else jsonb_build_object('configured',false) end;
 return result || jsonb_build_object('schedulerReady',to_regprocedure('ibkr_private.dispatch_flex()') is not null,'portfolios',coalesce((select jsonb_agg(jsonb_build_object('id',a.portfolio_id,'account','••••'||right(a.account,4))) from ibkr_private.accounts a where a.user_id=auth.uid()),'[]'::jsonb));
end $$;

-- Service-only: caller authenticates with Auth.getUser before reading credentials.
create function public.configure_ibkr_flex(p_user_id uuid,p_portfolio_id uuid,p_token text,p_query_id text) returns void
language plpgsql security definer set search_path='' as $$
declare c ibkr_private.flex_connections; sid uuid; h text;
begin
 if p_user_id is null or p_token is null or p_token !~ '^[0-9]{6,128}$' or p_query_id is null or p_query_id !~ '^[0-9]{1,30}$' then raise exception 'INVALID_CONFIGURATION'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if not exists(select 1 from ibkr_private.accounts where user_id=p_user_id and portfolio_id=p_portfolio_id) then raise exception 'MAPPED_PORTFOLIO_REQUIRED'; end if;
 select * into c from ibkr_private.flex_connections where user_id=p_user_id for update;
 if c.lease_until>now() then raise exception 'SYNC_BUSY'; end if;
 h:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if exists(select 1 from ibkr_private.flex_connections where token_hash=h and user_id<>p_user_id) then raise exception 'INVALID_CONFIGURATION'; end if;
 if c.secret_id is null then sid:=vault.create_secret(p_token);
 else sid:=c.secret_id; perform vault.update_secret(sid,p_token); end if;
 insert into ibkr_private.flex_connections(user_id,portfolio_id,secret_id,token_hash,query_id)
 values(p_user_id,p_portfolio_id,sid,h,p_query_id)
 on conflict(user_id) do update set portfolio_id=excluded.portfolio_id,token_hash=excluded.token_hash,query_id=excluded.query_id,
 daily_enabled=false,manual_verified_at=null,last_success_at=null,last_received_at=null,state='idle',error_code=null,
 reference_code=null,report_id=null,attempts=0,lease=null,lease_until=null;
end $$;

create function public.start_ibkr_flex(p_user_id uuid,p_origin text default 'manual') returns void
language plpgsql security definer set search_path='' as $$
declare c ibkr_private.flex_connections; today date:=(now() at time zone 'UTC')::date;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into c from ibkr_private.flex_connections where user_id=p_user_id for update;
 if not found then raise exception 'NOT_CONFIGURED'; end if;
 if p_origin not in ('manual','daily') then raise exception 'INVALID_CONFIGURATION'; end if;
 if p_origin='daily' and (not c.daily_enabled or c.manual_verified_at is null) then return; end if;
 if p_origin='daily' and ((now() at time zone 'UTC')::time < time '07:00' or (c.last_started_at at time zone 'UTC')::date=today) then return; end if;
 -- Lost responses and simultaneous taps reuse the current run. Successful runs have a ten-minute cooldown.
 if c.state in ('queued','waiting') or c.lease_until>now() or c.next_request_at>now()
 or (c.last_started_at>now()-interval '10 minutes' and c.state in ('review','blocked')) then return; end if;
 update ibkr_private.flex_connections set state='queued',error_code=null,reference_code=null,
 from_date=today-7,to_date=today-1,attempts=0,lease=null,lease_until=null,last_started_at=now(),origin=p_origin
 where user_id=p_user_id;
end $$;

create function public.claim_ibkr_flex(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c ibkr_private.flex_connections; l uuid:=gen_random_uuid(); secret text; account_id text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into c from ibkr_private.flex_connections where user_id=p_user_id for update;
 if not found or c.state not in ('queued','waiting') or c.next_request_at>now() or c.lease_until>now() then return null; end if;
 if c.attempts>=12 or c.last_started_at<now()-interval '30 minutes' then
 update ibkr_private.flex_connections set state='error',error_code='SYNC_TIMEOUT',lease=null,lease_until=null where user_id=p_user_id; return null; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where id=c.secret_id;
 select account into account_id from ibkr_private.accounts where user_id=p_user_id and portfolio_id=c.portfolio_id;
 if secret is null or account_id is null then raise exception 'NOT_CONFIGURED'; end if;
 update ibkr_private.flex_connections set lease=l,lease_until=now()+interval '90 seconds',next_request_at=now()+interval '10 seconds',attempts=attempts+1 where user_id=p_user_id;
 return jsonb_build_object('lease',l,'token',secret,'queryId',c.query_id,'reference',c.reference_code,
 'from',c.from_date,'to',c.to_date,'account',account_id,'attempts',c.attempts+1);
end $$;

-- Lease fencing + staging in one transaction prevents late workers from changing a new configuration.
create function public.finish_ibkr_flex(p_user_id uuid,p_lease uuid,p_reference text default null,p_code text default null,p_retry boolean default false,p_xml text default null,p_snapshot jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare c ibkr_private.flex_connections; r jsonb; expected_account text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into c from ibkr_private.flex_connections where user_id=p_user_id for update;
 if not found or c.lease is distinct from p_lease or c.lease_until<=now() then raise exception 'LEASE_EXPIRED'; end if;
 if p_xml is not null then
 select account into expected_account from ibkr_private.accounts where user_id=p_user_id and portfolio_id=c.portfolio_id;
 if p_snapshot->>'account' is distinct from expected_account or p_snapshot->>'from' is distinct from c.from_date::text or p_snapshot->>'to' is distinct from c.to_date::text then raise exception 'REPORT_SCOPE_MISMATCH'; end if;
 r:=public.stage_ibkr_report(p_user_id,c.portfolio_id,p_xml,p_snapshot);
 update ibkr_private.flex_connections set state=case when r->>'status'='blocked' then 'blocked' else 'review' end,
 report_id=(r->>'id')::uuid,last_received_at=now(),error_code=null,
 last_success_at=case when r->>'status'<>'blocked' then now() else last_success_at end,
 manual_verified_at=case when origin='manual' and r->>'status'<>'blocked' then now() else manual_verified_at end,
 lease=null,lease_until=null where user_id=p_user_id;
 elsif p_reference is not null then
 if p_reference !~ '^[0-9]{1,40}$' then raise exception 'INVALID_RESPONSE'; end if;
 update ibkr_private.flex_connections set reference_code=p_reference,state='waiting',error_code='GENERATING',lease=null,lease_until=null,next_request_at=greatest(next_request_at,now()+interval '10 seconds') where user_id=p_user_id;
 else
 if p_code is null or p_code not in ('TOKEN_EXPIRED','TOKEN_INVALID','IP_RESTRICTED','QUERY_INVALID','RATE_LIMITED','GENERATING','BROKER_TEMPORARY','BROKER_REJECTED','INVALID_RESPONSE','NETWORK_TIMEOUT','INVALID_REPORT','REPORT_SCOPE_MISMATCH','STORAGE_LIMIT','LIMIT_EXCEEDED','TEMPORARY_FAILURE','ACCOUNT_MAPPING_CONFLICT','MANUAL_OVERLAP','PORTFOLIO_UNAVAILABLE') then p_code:='TEMPORARY_FAILURE'; end if;
 update ibkr_private.flex_connections set state=case when p_retry and attempts<12 then 'waiting' else 'error' end,
 error_code=p_code,lease=null,lease_until=null,
 next_request_at=now()+make_interval(secs=>case when p_code='RATE_LIMITED' then 120 else least(300,10*power(2,least(attempts-1,5)))::int end),
 daily_enabled=case when p_code in ('TOKEN_EXPIRED','TOKEN_INVALID','IP_RESTRICTED','QUERY_INVALID') then false else daily_enabled end where user_id=p_user_id;
 end if;
end $$;

create function public.ibkr_flex_daily(p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 if p_enabled and not exists(select 1 from ibkr_private.flex_connections where user_id=auth.uid() and manual_verified_at is not null) then raise exception 'MANUAL_SYNC_REQUIRED'; end if;
 if p_enabled and to_regprocedure('ibkr_private.dispatch_flex()') is null then raise exception 'SCHEDULER_NOT_READY'; end if;
 update ibkr_private.flex_connections set daily_enabled=p_enabled where user_id=auth.uid();
end $$;
create function public.disconnect_ibkr_flex() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 delete from ibkr_private.flex_connections where user_id=auth.uid();
end $$;
create function ibkr_private.delete_flex_secret() returns trigger
language plpgsql security definer set search_path='' as $$
begin delete from vault.secrets where id=old.secret_id; return old; end $$;
create trigger delete_flex_secret after delete on ibkr_private.flex_connections for each row execute function ibkr_private.delete_flex_secret();

-- A separate scheduler credential; it cannot impersonate a user or confirm imports.
create function public.authorize_ibkr_flex_worker(p_user_id uuid,p_secret text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from vault.decrypted_secrets v,ibkr_private.flex_connections c
 where v.name='finly-flex-scheduler' and v.decrypted_secret=p_secret and c.user_id=p_user_id and c.daily_enabled and c.manual_verified_at is not null);
$$;
revoke all on function public.authorize_ibkr_flex_worker(uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_ibkr_flex_worker(uuid,text) to service_role;

-- Recheck a trusted stored source after another report changed the journal revision.
create function public.recheck_ibkr_report(p_report_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r ibkr_private.reports;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into r from ibkr_private.reports where id=p_report_id and user_id=auth.uid();
 if not found then raise exception 'REPORT_UNAVAILABLE'; end if;
 return public.stage_ibkr_report(auth.uid(),r.portfolio_id,r.source_xml,r.snapshot);
end $$;
revoke all on function public.recheck_ibkr_report(uuid) from public,anon;
grant execute on function public.recheck_ibkr_report(uuid) to authenticated;

revoke all on function ibkr_private.flex_summary(ibkr_private.flex_connections),ibkr_private.delete_flex_secret() from public,anon,authenticated,service_role;
revoke all on function public.ibkr_flex_status(),public.ibkr_flex_daily(boolean),public.disconnect_ibkr_flex() from public,anon;
grant execute on function public.ibkr_flex_status(),public.ibkr_flex_daily(boolean),public.disconnect_ibkr_flex() to authenticated;
revoke all on function public.configure_ibkr_flex(uuid,uuid,text,text),public.start_ibkr_flex(uuid,text),public.claim_ibkr_flex(uuid),public.finish_ibkr_flex(uuid,uuid,text,text,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.configure_ibkr_flex(uuid,uuid,text,text),public.start_ibkr_flex(uuid,text),public.claim_ibkr_flex(uuid),public.finish_ibkr_flex(uuid,uuid,text,text,boolean,text,jsonb) to service_role;
commit;
