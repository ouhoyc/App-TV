begin;
insert into auth.users(id,email) values ('91000000-0000-4000-8000-000000000001','gallery-a@scdr-test.invalid'),('91000000-0000-4000-8000-000000000002','gallery-b@scdr-test.invalid');
insert into public.app_tv_profiles(id,email,display_name,role) select id,email,'Gallery fixture','reseller' from auth.users where email in ('gallery-a@scdr-test.invalid','gallery-b@scdr-test.invalid');
insert into public.app_tv_public_keys(user_id,public_jwk) select id,jsonb_build_object('kty','RSA','e','AQAB','n',repeat('A',512)) from public.app_tv_profiles where email in ('gallery-a@scdr-test.invalid','gallery-b@scdr-test.invalid');
select set_config('test.gallery_payload',jsonb_build_object('version',1,'iv',repeat('A',16),'ciphertext',repeat('A',32),'recipients',(select jsonb_object_agg(id::text,'wrapped') from public.app_tv_profiles where (role='admin' and active) or id='91000000-0000-4000-8000-000000000001'))::text,true);
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
insert into public.app_tv_media(id,owner_id,payload,thumbnail,category) values('92000000-0000-4000-8000-000000000001',auth.uid(),current_setting('test.gallery_payload')::jsonb,current_setting('test.gallery_payload')::jsonb,'ads');
update public.app_tv_media set category='tutorials' where id='92000000-0000-4000-8000-000000000001';
do $$ begin
 if not exists(select 1 from public.app_tv_media where id='92000000-0000-4000-8000-000000000001' and category='tutorials' and thumbnail is not null) then raise exception 'FAIL own category and thumbnail'; end if;
 begin update public.app_tv_media set payload='{}' where id='92000000-0000-4000-8000-000000000001';raise exception 'FAIL immutable original';exception when insufficient_privilege then null;end;
 begin update public.app_tv_media set thumbnail='{"plaintext":"photo"}' where id='92000000-0000-4000-8000-000000000001';raise exception 'FAIL unencrypted thumbnail';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.app_tv_media where id='92000000-0000-4000-8000-000000000001') then raise exception 'FAIL cross-reseller read';end if;
 update public.app_tv_media set category='ads' where id='92000000-0000-4000-8000-000000000001';if found then raise exception 'FAIL cross-reseller move';end if;
end $$;
set local role anon;
do $$ begin begin perform 1 from public.app_tv_media;raise exception 'FAIL anonymous gallery';exception when insufficient_privilege then null;end;end $$;
reset role;
select 'PASS: encrypted thumbnails, category updates, immutable originals, reseller isolation and anonymous denial' as result;
rollback;
