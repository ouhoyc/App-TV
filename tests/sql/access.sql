begin;
-- Everything below, including the temporary Auth identities, is rolled back.
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','admin-a@app-tv-test.invalid'),
 ('10000000-0000-4000-8000-000000000002','admin-b@app-tv-test.invalid'),
 ('10000000-0000-4000-8000-000000000003','reseller-a@app-tv-test.invalid'),
 ('10000000-0000-4000-8000-000000000004','reseller-b@app-tv-test.invalid');
insert into public.app_tv_profiles(id,email,display_name,role)
 select id,email,email,case when email like 'admin-%' then 'admin' else 'reseller' end from auth.users where email like '%@app-tv-test.invalid';
insert into public.app_tv_public_keys(user_id,public_jwk)
 select id,jsonb_build_object('kty','RSA','e','AQAB','n',repeat('A',512)) from public.app_tv_profiles where email like '%@app-tv-test.invalid';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
DO $$
declare p jsonb; n int;
begin
 if (select count(*) from public.app_tv_profiles)<>1 then raise exception 'FAIL reseller profile isolation'; end if;
 if (select count(*) from public.app_tv_public_keys)<>3 then raise exception 'FAIL public key visibility'; end if;
 begin
  update public.app_tv_profiles set role='admin' where id=auth.uid();
  raise exception 'FAIL role escalation allowed';
 exception when insufficient_privilege then null; end;
 p=jsonb_build_object('version',1,'iv',repeat('A',16),'ciphertext',repeat('A',32),'recipients',jsonb_build_object(
 '10000000-0000-4000-8000-000000000001','wrapped','10000000-0000-4000-8000-000000000002','wrapped','10000000-0000-4000-8000-000000000003','wrapped'));
 perform public.app_tv_save_vaults(jsonb_build_array(jsonb_build_object('owner_id',auth.uid(),'expected_revision',0,'payload',p)));
 if (select count(*) from public.app_tv_vaults)<>1 then raise exception 'FAIL own vault create'; end if;
 begin
  perform public.app_tv_save_vaults(jsonb_build_array(jsonb_build_object('owner_id','10000000-0000-4000-8000-000000000004','expected_revision',0,'payload',p)));
  raise exception 'FAIL foreign vault create';
 exception when insufficient_privilege then null; end;
 begin
  update public.app_tv_vaults set owner_id='10000000-0000-4000-8000-000000000004',revision=2;
  raise exception 'FAIL owner reassignment';
 exception when raise_exception then if SQLERRM='FAIL owner reassignment' then raise; end if; end;
 perform public.app_tv_save_vaults(jsonb_build_array(jsonb_build_object('owner_id',auth.uid(),'expected_revision',1,'payload',p)));
 begin
  perform public.app_tv_save_vaults(jsonb_build_array(jsonb_build_object('owner_id',auth.uid(),'expected_revision',1,'payload',p)));
  raise exception 'FAIL stale write allowed';
 exception when serialization_failure then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
DO $$ begin
 if (select count(*) from public.app_tv_vaults)<>0 then raise exception 'FAIL foreign vault exposed'; end if;
 update public.app_tv_vaults set revision=3;
 if FOUND then raise exception 'FAIL foreign vault update'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
DO $$ begin
 if (select count(*) from public.app_tv_vaults)<>1 then raise exception 'FAIL second administrator access'; end if;
 if (select count(*) from public.app_tv_profiles)<>4 then raise exception 'FAIL admin directory'; end if;
end $$;
reset role;
update public.app_tv_profiles set active=false where id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
DO $$ begin
 if (select count(*) from public.app_tv_vaults)<>0 then raise exception 'FAIL suspension with existing JWT'; end if;
end $$;
set local role anon;
DO $$ begin
 begin perform 1 from public.app_tv_vaults;raise exception 'FAIL anonymous access';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: own read/write, both administrators, cross-reseller isolation, immutable roles and ownership, stale write rejection, immediate suspension and anonymous denial' as result;
rollback;
