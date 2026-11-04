begin;
insert into auth.users(id,email) values
 ('30000000-0000-4000-8000-000000000001','provider-a@scdr-test.invalid'),
 ('30000000-0000-4000-8000-000000000002','provider-b@scdr-test.invalid');
insert into public.app_tv_profiles(id,email,display_name,role)
 select id,email,'Fictitious test reseller','reseller' from auth.users where email in ('provider-a@scdr-test.invalid','provider-b@scdr-test.invalid');
insert into public.app_tv_public_keys(user_id,public_jwk)
 select id,jsonb_build_object('kty','RSA','e','AQAB','n',repeat('A',512)) from public.app_tv_profiles where email in ('provider-a@scdr-test.invalid','provider-b@scdr-test.invalid');
select set_config('test.provider_context',jsonb_build_object('version',1,'iv',repeat('A',16),'ciphertext',repeat('A',32),'recipients',
 (select jsonb_object_agg(id::text,'wrapped') from public.app_tv_profiles where (role='admin' and active) or id='30000000-0000-4000-8000-000000000001'))::text,true);
select set_config('test.provider_admin',(select id::text from public.app_tv_profiles where role='admin' and active order by created_at limit 1),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
do $$ declare entry jsonb; result jsonb;
begin
 entry=jsonb_build_object('id','40000000-0000-4000-8000-000000000001','owner_id',auth.uid(),'client_id','50000000-0000-4000-8000-000000000001','action','renew',
 'request_hash',repeat('a',64),'resource_hash',repeat('b',64),'context_box',current_setting('test.provider_context')::jsonb);
 result=public.app_tv_claim_provider_operation(entry);
 if result->>'claimed'<>'true' then raise exception 'FAIL initial claim'; end if;
 result=public.app_tv_claim_provider_operation(entry);
 if result->>'claimed'<>'false' then raise exception 'FAIL idempotency'; end if;
 begin
   perform public.app_tv_claim_provider_operation(entry||jsonb_build_object('id','40000000-0000-4000-8000-000000000002'));
   raise exception 'FAIL duplicate resource';
 exception when serialization_failure then null; end;
 begin
   perform public.app_tv_claim_provider_operation(entry||jsonb_build_object('id','40000000-0000-4000-8000-000000000003','resource_hash',repeat('c',64),'owner_id','30000000-0000-4000-8000-000000000002'));
   raise exception 'FAIL foreign owner';
 exception when insufficient_privilege then null; end;
 if (select count(*) from public.app_tv_provider_operations)<>1 then raise exception 'FAIL own receipt access'; end if;
 begin
   update public.app_tv_provider_operations set owner_id='30000000-0000-4000-8000-000000000002';
   raise exception 'FAIL mutable owner';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.app_tv_provider_operations)<>0 then raise exception 'FAIL cross-reseller read'; end if;
 update public.app_tv_provider_operations set state='resolved';
 if found then raise exception 'FAIL cross-reseller update'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.provider_admin'),true);
do $$ begin
 if (select count(*) from public.app_tv_provider_operations)<>1 then raise exception 'FAIL admin receipt access'; end if;
 update public.app_tv_provider_operations set state='applied' where id='40000000-0000-4000-8000-000000000001';
 if not found then raise exception 'FAIL admin reconciliation'; end if;
end $$;
reset role;
update public.app_tv_profiles set active=false where id='30000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
do $$ begin if (select count(*) from public.app_tv_provider_operations)<>0 then raise exception 'FAIL suspended account access'; end if; end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.app_tv_provider_operations; raise exception 'FAIL anon table'; exception when insufficient_privilege then null; end;
 begin perform public.app_tv_claim_provider_operation('{}'); raise exception 'FAIL anon RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: atomic claim, idempotency, unresolved resource lock, owner immutability, reseller isolation, admin access, suspended and anonymous denial' as result;
rollback;
