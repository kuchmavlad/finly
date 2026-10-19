-- Synthetic SQL only; no broker calls, all effects rolled back.
begin;
do $smoke$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); pid uuid; plan jsonb; claim jsonb; denied boolean;
begin
 insert into auth.users(id) values(a),(b);
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;pid:=public.create_portfolio('Synthetic history test');reset role;
 insert into ibkr_private.accounts(user_id,account,portfolio_id) values(a,'SYNTHETIC',pid);
 set local role service_role;
 perform public.configure_ibkr_flex(a,pid,'88888888888888888888888888888888','888888');
 perform public.queue_ibkr_history(a,'2024-03-08');perform public.queue_ibkr_history(a,'2024-03-08');
 perform public.advance_ibkr_history(a);claim:=public.claim_ibkr_flex(a);
 if claim->>'from'<>'2024-03-08' or claim->>'to'<>'2024-03-31' then raise exception 'Invalid first month'; end if;
 if public.claim_ibkr_flex(a) is not null then raise exception 'Double claim'; end if;
 perform public.finish_ibkr_flex(a,(claim->>'lease')::uuid,null,'BROKER_REJECTED',false);
 reset role;set local role authenticated;
 plan:=public.ibkr_flex_status()->'history';
 if plan->0->>'state'<>'error' or plan->1->>'state'<>'pending' then raise exception 'Error skipped'; end if;
 denied:=false;
 begin perform public.queue_ibkr_history(a,'2024-03-08');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Client queue allowed';end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 if public.ibkr_flex_status()->'history'<>'[]'::jsonb then raise exception 'History leak';end if;
 reset role;
 if exists(select 1 from (select from_date,lag(to_date) over(order by from_date) previous from ibkr_private.flex_history where user_id=a) p where previous is not null and from_date<>previous+1) then raise exception 'Coverage gap';end if;
 if (select max(to_date) from ibkr_private.flex_history where user_id=a)<>(now() at time zone 'UTC')::date-1 then raise exception 'Invalid final month';end if;
 if has_function_privilege('authenticated','public.ibkr_source_for_reparse(uuid,uuid)','EXECUTE') then raise exception 'Source exposed';end if;
 if has_function_privilege('authenticated','public.restage_ibkr_source(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Snapshot exposed';end if;
 delete from auth.users where id=a;
 if exists(select 1 from ibkr_private.flex_history where user_id=a) then raise exception 'Orphan history';end if;
end $smoke$;
rollback;
select 'History plan/isolation/lease smoke passed; synthetic rows rolled back' as result;
