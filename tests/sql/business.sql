begin;
insert into auth.users(id,email) values
 ('60000000-0000-4000-8000-000000000001','business-a@scdr-test.invalid'),
 ('60000000-0000-4000-8000-000000000002','business-b@scdr-test.invalid');
insert into public.app_tv_profiles(id,email,display_name,role)
 select id,email,'Fictitious reseller','reseller' from auth.users where email in ('business-a@scdr-test.invalid','business-b@scdr-test.invalid');
insert into public.app_tv_public_keys(user_id,public_jwk)
 select id,jsonb_build_object('kty','RSA','e','AQAB','n',repeat('A',512)) from public.app_tv_profiles where email in ('business-a@scdr-test.invalid','business-b@scdr-test.invalid');
select set_config('test.media_payload',jsonb_build_object('version',1,'iv',repeat('A',16),'ciphertext',repeat('A',32),'recipients',
 (select jsonb_object_agg(id::text,'wrapped') from public.app_tv_profiles where (role='admin' and active) or id='60000000-0000-4000-8000-000000000001'))::text,true);
select set_config('test.admin',(select id::text from public.app_tv_profiles where role='admin' and active order by created_at limit 1),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
insert into public.app_tv_media(id,owner_id,payload) values ('70000000-0000-4000-8000-000000000001',auth.uid(),current_setting('test.media_payload')::jsonb);
insert into public.app_tv_push_subscriptions(id,user_id,endpoint,subscription) values ('70000000-0000-4000-8000-000000000002',auth.uid(),'https://web.push.apple.com/not-real','{"endpoint":"https://web.push.apple.com/not-real","keys":{"p256dh":"test","auth":"test"}}');
select public.app_tv_sync_reminders(auth.uid(),jsonb_build_array(jsonb_build_object('id',repeat('a',64),'client_id','80000000-0000-4000-8000-000000000001','subscription_id','80000000-0000-4000-8000-000000000002','kind','trial24','due_at',now()-interval '1 minute','expires_at',now())));
do $$ begin
 if (select count(*) from public.app_tv_reminders where id=repeat('a',64))<>1 then raise exception 'FAIL owner reminder'; end if;
 begin perform public.app_tv_sync_reminders('60000000-0000-4000-8000-000000000002','[]'); raise exception 'FAIL cross-owner sync'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.app_tv_media where id='70000000-0000-4000-8000-000000000001') then raise exception 'FAIL cross-reseller photo'; end if;
 if exists(select 1 from public.app_tv_reminders where id=repeat('a',64)) then raise exception 'FAIL cross-reseller schedule'; end if;
 if exists(select 1 from public.app_tv_push_subscriptions where id='70000000-0000-4000-8000-000000000002') then raise exception 'FAIL cross-reseller push keys'; end if;
 delete from public.app_tv_media where id='70000000-0000-4000-8000-000000000001'; if found then raise exception 'FAIL cross-reseller deletion'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.admin'),true);
do $$ begin
 if not exists(select 1 from public.app_tv_media where id='70000000-0000-4000-8000-000000000001') then raise exception 'FAIL admin photo'; end if;
 if not exists(select 1 from public.app_tv_reminders where id=repeat('a',64)) then raise exception 'FAIL admin schedule'; end if;
 if exists(select 1 from public.app_tv_push_subscriptions where id='70000000-0000-4000-8000-000000000002') then raise exception 'FAIL admin device key exposure'; end if;
end $$;
reset role;
-- pg_net defers sending until commit; this entire test is rolled back.
select app_tv_private.queue_push_dispatch();
do $$ begin if (select count(*) from app_tv_private.push_jobs where reminder_id=repeat('a',64))<>1 then raise exception 'FAIL due job not queued'; end if; end $$;
insert into app_tv_private.push_dispatches(token_hash,expires_at) values(encode(extensions.digest(repeat('b',64),'sha256'),'hex'),now()+interval '5 minutes');
set local role anon;
do $$ declare result jsonb; job jsonb;
begin
 begin perform 1 from app_tv_private.push_jobs; raise exception 'FAIL anon queue table'; exception when insufficient_privilege then null; end;
 begin perform public.app_tv_claim_push_dispatch(repeat('c',64)); raise exception 'FAIL invented ticket'; exception when insufficient_privilege then null; end;
 result=public.app_tv_claim_push_dispatch(repeat('b',64));
 if jsonb_array_length(result->'jobs')<>1 then raise exception 'FAIL claim due job'; end if;
 job=result->'jobs'->0;
 if job->>'clientId'<>'80000000-0000-4000-8000-000000000001' then raise exception 'FAIL incorrect target'; end if;
 begin perform public.app_tv_claim_push_dispatch(repeat('b',64)); raise exception 'FAIL ticket replay'; exception when insufficient_privilege then null; end;
 perform public.app_tv_finish_push_dispatch(repeat('b',64),jsonb_build_array(jsonb_build_object('id',job->>'id','status',201)));
 begin perform public.app_tv_finish_push_dispatch(repeat('b',64),'[]'); raise exception 'FAIL finish replay'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin if (select state from app_tv_private.push_jobs where reminder_id=repeat('a',64))<>'sent' then raise exception 'FAIL result not persisted'; end if; end $$;
select app_tv_private.queue_push_dispatch();
do $$ begin if (select count(*) from app_tv_private.push_jobs where reminder_id=repeat('a',64))<>1 then raise exception 'FAIL notification duplicated'; end if; end $$;
select 'PASS: photo RLS, reminder ownership, private device keys, due queue, guarded one-use dispatch, receipt persistence and deduplication; no notification committed' as result;
rollback;
