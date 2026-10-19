begin;
create table ibkr_private.flex_history (
 user_id uuid not null references ibkr_private.flex_connections(user_id) on delete cascade,
 from_date date not null, to_date date not null check(to_date>=from_date and to_date-from_date<32),
 state text not null default 'pending' check(state in ('pending','fetching','received','error')),
 report_id uuid, error_code text,
 primary key(user_id,from_date),
 foreign key(user_id,report_id) references ibkr_private.reports(user_id,id)
);
alter table ibkr_private.flex_history enable row level security;
revoke all on ibkr_private.flex_history from public,anon,authenticated,service_role;
create index flex_history_report on ibkr_private.flex_history(user_id,report_id);

create function public.queue_ibkr_history(p_user_id uuid,p_start date) returns void
language plpgsql security definer set search_path='' as $$
declare c ibkr_private.flex_connections; d date; last_day date:=(now() at time zone 'UTC')::date-1; e date; earliest date;
begin
 if p_start is null or p_start<make_date(extract(year from last_day+1)::int-4,1,1) or p_start>last_day then raise exception 'HISTORY_DATE_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into c from ibkr_private.flex_connections where user_id=p_user_id for update;
 if not found then raise exception 'NOT_CONFIGURED'; end if;
 if c.lease_until>now() or c.state in ('queued','waiting') then raise exception 'SYNC_BUSY'; end if;
 select min(from_date) into earliest from ibkr_private.flex_history where user_id=p_user_id;
 if earliest is not null and earliest<>p_start then raise exception 'HISTORY_ALREADY_PLANNED'; end if;
 if earliest is null then
   d:=p_start;
   while d<=last_day loop
     e:=least((date_trunc('month',d)+interval '1 month'-interval '1 day')::date,last_day);
     insert into ibkr_private.flex_history(user_id,from_date,to_date) values(p_user_id,d,e);
     d:=e+1;
   end loop;
 else
   -- Explicit user retry, never an automatic infinite restart of a failed month.
   update ibkr_private.flex_history set state='pending',error_code=null where user_id=p_user_id and state='error';
 end if;
 update ibkr_private.flex_connections set daily_enabled=false where user_id=p_user_id;
end $$;

create function public.advance_ibkr_history(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c ibkr_private.flex_connections; h ibkr_private.flex_history;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into c from ibkr_private.flex_connections where user_id=p_user_id for update;
 if not found then raise exception 'NOT_CONFIGURED'; end if;
 if c.state in ('queued','waiting') or c.lease_until>now() or c.next_request_at>now() then return; end if;
 if exists(select 1 from ibkr_private.flex_history where user_id=p_user_id and state='error') then return; end if;
 select * into h from ibkr_private.flex_history where user_id=p_user_id and state='pending' order by from_date limit 1;
 if not found then return; end if;
 update ibkr_private.flex_history set state='fetching',error_code=null where user_id=p_user_id and from_date=h.from_date;
 update ibkr_private.flex_connections set state='queued',origin='history',from_date=h.from_date,to_date=h.to_date,
 reference_code=null,report_id=null,error_code=null,attempts=0,lease=null,lease_until=null,last_started_at=now() where user_id=p_user_id;
end $$;

-- Preserve the existing lease, exact scope checks, atomic staging and retry policy.
alter function public.finish_ibkr_flex(uuid,uuid,text,text,boolean,text,jsonb) set schema ibkr_private;
create function public.finish_ibkr_flex(p_user_id uuid,p_lease uuid,p_reference text default null,p_code text default null,p_retry boolean default false,p_xml text default null,p_snapshot jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare c ibkr_private.flex_connections;
begin
 perform ibkr_private.finish_ibkr_flex(p_user_id,p_lease,p_reference,p_code,p_retry,p_xml,p_snapshot);
 select * into c from ibkr_private.flex_connections where user_id=p_user_id;
 if c.origin='history' and c.state in ('review','blocked','error') then
 update ibkr_private.flex_history set state=case when c.state='error' then 'error' else 'received' end,
 report_id=case when c.state='error' then null else c.report_id end,error_code=c.error_code
 where user_id=p_user_id and from_date=c.from_date and to_date=c.to_date and state='fetching';
 end if;
end $$;
alter function public.claim_ibkr_flex(uuid) set schema ibkr_private;
create function public.claim_ibkr_flex(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; c ibkr_private.flex_connections;
begin
 result:=ibkr_private.claim_ibkr_flex(p_user_id);
 select * into c from ibkr_private.flex_connections where user_id=p_user_id;
 if c.origin='history' and c.state='error' then
 update ibkr_private.flex_history set state='error',error_code=c.error_code where user_id=p_user_id and from_date=c.from_date and state='fetching'; end if;
 return result;
end $$;
alter function public.start_ibkr_flex(uuid,text) set schema ibkr_private;
create function public.start_ibkr_flex(p_user_id uuid,p_origin text default 'manual') returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 if exists(select 1 from ibkr_private.flex_history where user_id=p_user_id and state<>'received') then raise exception 'HISTORY_IN_PROGRESS'; end if;
 perform ibkr_private.start_ibkr_flex(p_user_id,p_origin);
end $$;

alter function public.ibkr_flex_status() set schema ibkr_private;
create function public.ibkr_flex_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return ibkr_private.ibkr_flex_status() || jsonb_build_object('history',coalesce((
 select jsonb_agg(jsonb_build_object('from',h.from_date,'to',h.to_date,'state',h.state,'code',h.error_code,
 'reportId',h.report_id,'reviewStatus',r.status,'issues',r.snapshot->'issues') order by h.from_date)
 from ibkr_private.flex_history h left join ibkr_private.reports r on r.user_id=h.user_id and r.id=h.report_id where h.user_id=auth.uid()),'[]'::jsonb),
 'issues',(select r.snapshot->'issues' from ibkr_private.flex_connections c join ibkr_private.reports r on r.user_id=c.user_id and r.id=c.report_id where c.user_id=auth.uid()));
end $$;

create function ibkr_private.guard_history_connection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.portfolio_id<>old.portfolio_id or new.query_id<>old.query_id) and exists(select 1 from ibkr_private.flex_history where user_id=old.user_id) then raise exception 'HISTORY_CONNECTION_LOCKED'; end if;
 if new.state='idle' and old.origin='history' then
 update ibkr_private.flex_history set state='pending',error_code=null where user_id=old.user_id and state in ('fetching','error');
 end if;
 if new.daily_enabled and exists(select 1 from ibkr_private.flex_history where user_id=old.user_id and state<>'received') then raise exception 'HISTORY_IN_PROGRESS'; end if;
 return new;
end $$;
create trigger guard_history_connection before update on ibkr_private.flex_connections for each row execute function ibkr_private.guard_history_connection();

-- Source is returned only to the authenticated Edge handler, never to the client.
create function public.ibkr_source_for_reparse(p_user_id uuid,p_report_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r ibkr_private.reports;
begin
 select * into r from ibkr_private.reports where user_id=p_user_id and id=p_report_id;
 if not found then raise exception 'REPORT_UNAVAILABLE'; end if;
 return jsonb_build_object('xml',r.source_xml,'portfolioId',r.portfolio_id);
end $$;
create function public.restage_ibkr_source(p_user_id uuid,p_report_id uuid,p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r ibkr_private.reports; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into r from ibkr_private.reports where user_id=p_user_id and id=p_report_id;
 if not found then raise exception 'REPORT_UNAVAILABLE'; end if;
 result:=public.stage_ibkr_report(p_user_id,r.portfolio_id,r.source_xml,p_snapshot);
 update ibkr_private.flex_connections set state=case when result->>'status'='blocked' then 'blocked' else 'review' end,
 last_success_at=case when result->>'status'<>'blocked' then now() else last_success_at end,
 manual_verified_at=case when result->>'status'<>'blocked' and origin='manual' then now() else manual_verified_at end
 where user_id=p_user_id and report_id=p_report_id and state in ('review','blocked');
end $$;
revoke all on function public.ibkr_flex_status() from public,anon;
grant execute on function public.ibkr_flex_status() to authenticated;
revoke all on function public.queue_ibkr_history(uuid,date),public.advance_ibkr_history(uuid),public.finish_ibkr_flex(uuid,uuid,text,text,boolean,text,jsonb),public.claim_ibkr_flex(uuid),public.start_ibkr_flex(uuid,text),public.ibkr_source_for_reparse(uuid,uuid) from public,anon,authenticated;
grant execute on function public.queue_ibkr_history(uuid,date),public.advance_ibkr_history(uuid),public.finish_ibkr_flex(uuid,uuid,text,text,boolean,text,jsonb),public.claim_ibkr_flex(uuid),public.start_ibkr_flex(uuid,text),public.ibkr_source_for_reparse(uuid,uuid) to service_role;
revoke all on function public.restage_ibkr_source(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.restage_ibkr_source(uuid,uuid,jsonb) to service_role;
revoke all on function ibkr_private.guard_history_connection(),ibkr_private.ibkr_flex_status(),ibkr_private.finish_ibkr_flex(uuid,uuid,text,text,boolean,text,jsonb),ibkr_private.claim_ibkr_flex(uuid),ibkr_private.start_ibkr_flex(uuid,text) from public,anon,authenticated,service_role;
commit;
