-- Entirely synthetic and rollback-only. No calls to IBKR and no real credentials.
begin;
do $smoke$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); pid uuid; sid uuid;
  job jsonb; result jsonb; denied boolean;
begin
 insert into auth.users(id) values(a),(b);
 perform set_config('request.jwt.claim.sub',a::text,true);
 set local role authenticated;
 pid:=public.create_portfolio('Flex synthetic smoke');
 reset role;
 insert into ibkr_private.accounts(user_id,account,portfolio_id) values(a,'SYNTHETIC',pid);
 set local role service_role;
 perform public.configure_ibkr_flex(a,pid,'99999999999999999999999999999999','999999');
 perform public.start_ibkr_flex(a);
 job:=public.claim_ibkr_flex(a);
 if job->>'token'<>'99999999999999999999999999999999' then raise exception 'Vault roundtrip failed'; end if;
 if public.claim_ibkr_flex(a) is not null then raise exception 'Concurrent claim allowed'; end if;
 perform public.finish_ibkr_flex(a,(job->>'lease')::uuid,'123456');
 reset role;
 select secret_id into sid from ibkr_private.flex_connections where user_id=a;
 if (select secret from vault.secrets where id=sid)='99999999999999999999999999999999' then raise exception 'Secret plaintext at rest'; end if;
 set local role authenticated;
 result:=public.ibkr_flex_status();
 if result->>'state'<>'waiting' or result::text like '%99999999999999999999999999999999%' or result?'secret_id' or result?'reference_code' then raise exception 'Unsafe status'; end if;
 denied:=false;
 begin perform public.claim_ibkr_flex(a); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Client credential access'; end if;
 denied:=false;
 begin perform 1 from vault.decrypted_secrets; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Client Vault access'; end if;
 perform set_config('request.jwt.claim.sub',b::text,true);
 if (public.ibkr_flex_status()->>'configured')::boolean then raise exception 'Foreign connection visible'; end if;
 perform public.disconnect_ibkr_flex();
 reset role;
 if not exists(select 1 from ibkr_private.flex_connections where user_id=a) then raise exception 'Foreign disconnect'; end if;
 -- Deleting the owner also removes its encrypted credential.
 delete from auth.users where id=a;
 if exists(select 1 from vault.secrets where id=sid) then raise exception 'Orphan credential'; end if;
 set local role anon;
 denied:=false;
 begin perform public.ibkr_flex_status(); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Anonymous status'; end if;
 reset role;
end $smoke$;
rollback;
select 'Flex Vault/permissions smoke passed; synthetic rows rolled back' as result;
