-- Opt-in deployment step AFTER real manual sync verification. Not a migration;
-- not executed during initial rollout. No tokens should be pasted into this file.
-- Target: jntgwwcgyzhgjhatozld. Deploy ibkr-flex-worker before running this script.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- pg_net temporarily queues the scheduler header; clients must not read it.
revoke all on net.http_request_queue,net._http_response from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from ibkr_private.flex_connections where manual_verified_at is not null) then
   raise exception 'MANUAL_SYNC_REQUIRED';
 end if;
 if not exists(select 1 from vault.secrets where name='finly-flex-scheduler') then
   perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'finly-flex-scheduler');
 end if;
end $$;
create or replace function ibkr_private.dispatch_flex() returns void
language plpgsql security definer set search_path='' as $$
declare c record; credential text;
begin
 select decrypted_secret into credential from vault.decrypted_secrets where name='finly-flex-scheduler';
 if credential is null then return; end if;
 for c in select user_id from ibkr_private.flex_connections
 where daily_enabled and manual_verified_at is not null and next_request_at<=now()
 and (lease_until is null or lease_until<=now()) and (
 state in ('queued','waiting') or (
 (now() at time zone 'UTC')::time>=time '07:00' and
 (last_started_at is null or (last_started_at at time zone 'UTC')::date<(now() at time zone 'UTC')::date)))
 order by last_started_at nulls first limit 5 loop
 perform net.http_post(
 url:='https://jntgwwcgyzhgjhatozld.supabase.co/functions/v1/ibkr-flex-worker?owner='||c.user_id::text,
 headers:=jsonb_build_object('Content-Type','application/json','x-flex-scheduler',credential),body:='{}'::jsonb,timeout_milliseconds:=85000);
 end loop;
end $$;
revoke all on function ibkr_private.dispatch_flex() from public,anon,authenticated,service_role;
do $$ begin
 if not exists(select 1 from cron.job where jobname='finly-flex-dispatch') then
   perform cron.schedule('finly-flex-dispatch','* * * * *','select ibkr_private.dispatch_flex()');
 end if;
end $$;
-- No connections are enabled here. User opt-in via ibkr_flex_daily(true) remains required.
commit;
