create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.app_tv_push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_tv_profiles(id),
 endpoint text not null, subscription jsonb not null check(octet_length(subscription::text)<6000),
 active boolean not null default true, last_test_at timestamptz, created_at timestamptz not null default now(),
 unique(user_id,endpoint)
);
alter table public.app_tv_push_subscriptions enable row level security;
create policy push_own on public.app_tv_push_subscriptions for all to authenticated
 using ((select app_tv_private.active()) and user_id=(select auth.uid()))
 with check ((select app_tv_private.active()) and user_id=(select auth.uid()));
revoke all on public.app_tv_push_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.app_tv_push_subscriptions to authenticated;

create table public.app_tv_reminders (
 id text primary key check(id ~ '^[0-9a-f]{64}$'), owner_id uuid not null references public.app_tv_profiles(id),
 client_id uuid not null, subscription_id uuid not null, kind text not null check(kind in ('trial24','annual')),
 due_at timestamptz not null, expires_at timestamptz not null, active boolean not null default true,
 check(due_at<=expires_at)
);
create index reminders_due on public.app_tv_reminders(due_at) where active;
create index reminders_owner on public.app_tv_reminders(owner_id);
alter table public.app_tv_reminders enable row level security;
create policy reminder_access on public.app_tv_reminders for all to authenticated
 using ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin())))
 with check ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin())));
revoke all on public.app_tv_reminders from public,anon,authenticated;
grant select,insert,update,delete on public.app_tv_reminders to authenticated;

create function public.app_tv_sync_reminders(owner uuid, items jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not app_tv_private.active() or not (owner=auth.uid() or app_tv_private.admin()) then raise exception 'Owner denied' using errcode='42501'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>20000 then raise exception 'Invalid reminder list'; end if;
 update public.app_tv_reminders set active=false where owner_id=owner and not id in (select value->>'id' from jsonb_array_elements(items));
 insert into public.app_tv_reminders(id,owner_id,client_id,subscription_id,kind,due_at,expires_at,active)
 select value->>'id',owner,(value->>'client_id')::uuid,(value->>'subscription_id')::uuid,value->>'kind',(value->>'due_at')::timestamptz,(value->>'expires_at')::timestamptz,true from jsonb_array_elements(items)
 on conflict(id) do update set due_at=excluded.due_at,expires_at=excluded.expires_at,active=true where app_tv_reminders.owner_id=owner;
end $$;
revoke all on function public.app_tv_sync_reminders(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.app_tv_sync_reminders(uuid,jsonb) to authenticated;
create function public.app_tv_save_with_reminders(changes jsonb, reminders jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb; item jsonb;
begin
 if jsonb_typeof(reminders)<>'array' or jsonb_array_length(reminders)>100 then raise exception 'Invalid schedules'; end if;
 result=public.app_tv_save_vaults(changes);
 for item in select value from jsonb_array_elements(reminders) loop
   perform public.app_tv_sync_reminders((item->>'owner_id')::uuid,item->'items');
 end loop;
 return result;
end $$;
revoke all on function public.app_tv_save_with_reminders(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.app_tv_save_with_reminders(jsonb,jsonb) to authenticated;

create table app_tv_private.push_dispatches (
 id uuid primary key default gen_random_uuid(), token_hash text not null unique,
 expires_at timestamptz not null, claimed boolean not null default false, finished boolean not null default false
);
create table app_tv_private.push_jobs (
 id uuid primary key default gen_random_uuid(), reminder_id text not null references public.app_tv_reminders(id) on delete cascade,
 push_id uuid not null references public.app_tv_push_subscriptions(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','sent','dead')),
 attempts int not null default 0, next_at timestamptz not null default now(), dispatch_id uuid, leased_until timestamptz,
 unique(reminder_id,push_id)
);
create index push_jobs_queue on app_tv_private.push_jobs(next_at) where state in ('pending','sending');
revoke all on app_tv_private.push_jobs,app_tv_private.push_dispatches from public,anon,authenticated;

create function app_tv_private.queue_push_dispatch() returns void
language plpgsql security definer set search_path='' as $$
declare token text;
begin
 update app_tv_private.push_jobs set state=case when attempts>=5 then 'dead' else 'pending' end,dispatch_id=null where state='sending' and leased_until<now();
 insert into app_tv_private.push_jobs(reminder_id,push_id)
 select r.id,p.id from public.app_tv_reminders r join public.app_tv_profiles own on own.id=r.owner_id and own.active
 join public.app_tv_push_subscriptions p on p.active
 join public.app_tv_profiles recipient on recipient.id=p.user_id and recipient.active
 where r.active and r.due_at<=now() and r.expires_at>now()-interval '7 days' and (recipient.id=r.owner_id or recipient.role='admin')
 on conflict(reminder_id,push_id) do nothing;
 if not exists(select 1 from app_tv_private.push_jobs j join public.app_tv_reminders r on r.id=j.reminder_id and r.active
 join public.app_tv_push_subscriptions p on p.id=j.push_id and p.active where j.state='pending' and j.next_at<=now()) then return; end if;
 token=encode(extensions.gen_random_bytes(32),'hex');
 insert into app_tv_private.push_dispatches(token_hash,expires_at) values(encode(extensions.digest(token,'sha256'),'hex'),now()+interval '5 minutes');
 perform net.http_post(url:='https://app-tv-alpha.vercel.app/api/push-worker',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('ticket',token),timeout_milliseconds:=55000);
 delete from app_tv_private.push_dispatches where expires_at<now()-interval '1 day';
end $$;
revoke all on function app_tv_private.queue_push_dispatch() from public,anon,authenticated;

-- A 256-bit, five-minute, one-use capability issued only by the private cron.
-- Public wrappers cannot list jobs or subscriptions without this capability.
create function app_tv_private.claim_push_dispatch(ticket text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d uuid; jobs jsonb;
begin
 if ticket is null or ticket !~ '^[0-9a-f]{64}$' then raise exception 'Invalid capability' using errcode='42501'; end if;
 update app_tv_private.push_dispatches set claimed=true where token_hash=encode(extensions.digest(ticket,'sha256'),'hex') and expires_at>now() and not claimed returning id into d;
 if d is null then raise exception 'Expired capability' using errcode='42501'; end if;
 with chosen as (
 select j.id from app_tv_private.push_jobs j join public.app_tv_reminders r on r.id=j.reminder_id and r.active
 join public.app_tv_push_subscriptions p on p.id=j.push_id and p.active
 join public.app_tv_profiles u on u.id=p.user_id and u.active
 join public.app_tv_profiles own on own.id=r.owner_id and own.active
 where j.state='pending' and j.next_at<=now() and (u.id=r.owner_id or u.role='admin')
 order by j.next_at limit 20 for update of j skip locked
 ) update app_tv_private.push_jobs set state='sending',dispatch_id=d,leased_until=now()+interval '5 minutes',attempts=attempts+1 where id in(select id from chosen);
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'subscription',p.subscription,'kind',r.kind,'clientId',r.client_id)), '[]'::jsonb) into jobs
 from app_tv_private.push_jobs j join public.app_tv_reminders r on r.id=j.reminder_id join public.app_tv_push_subscriptions p on p.id=j.push_id where j.dispatch_id=d;
 return jsonb_build_object('jobs',jobs);
end $$;
create function app_tv_private.finish_push_dispatch(ticket text, results jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare d uuid; item jsonb; code int;
begin
 if ticket is null or ticket !~ '^[0-9a-f]{64}$' or jsonb_typeof(results)<>'array' or jsonb_array_length(results)>20 then raise exception 'Invalid capability' using errcode='42501'; end if;
 update app_tv_private.push_dispatches set finished=true where token_hash=encode(extensions.digest(ticket,'sha256'),'hex') and expires_at>now() and claimed and not finished returning id into d;
 if d is null then raise exception 'Expired capability' using errcode='42501'; end if;
 for item in select value from jsonb_array_elements(results) loop
  code=(item->>'status')::int;
  if code in (404,410) then update public.app_tv_push_subscriptions set active=false where id in(select push_id from app_tv_private.push_jobs where dispatch_id=d and id=(item->>'id')::uuid); end if;
  update app_tv_private.push_jobs set state=case when code in(200,201,202) then 'sent' when code in(404,410) or attempts>=5 then 'dead' else 'pending' end,
   next_at=now()+make_interval(secs=>least(3600,60*(2^attempts)::int)),leased_until=null
   where dispatch_id=d and id=(item->>'id')::uuid and state='sending';
 end loop;
end $$;
revoke all on function app_tv_private.claim_push_dispatch(text),app_tv_private.finish_push_dispatch(text,jsonb) from public,anon,authenticated;
grant usage on schema app_tv_private to anon;
grant execute on function app_tv_private.claim_push_dispatch(text),app_tv_private.finish_push_dispatch(text,jsonb) to anon,authenticated;
create function public.app_tv_claim_push_dispatch(ticket text) returns jsonb language sql security invoker set search_path='' as $$ select app_tv_private.claim_push_dispatch(ticket) $$;
create function public.app_tv_finish_push_dispatch(ticket text, results jsonb) returns void language sql security invoker set search_path='' as $$ select app_tv_private.finish_push_dispatch(ticket,results) $$;
revoke all on function public.app_tv_claim_push_dispatch(text),public.app_tv_finish_push_dispatch(text,jsonb) from public,anon,authenticated;
grant execute on function public.app_tv_claim_push_dispatch(text),public.app_tv_finish_push_dispatch(text,jsonb) to anon,authenticated;
select cron.schedule('scdr-tv-notifications','* * * * *','select app_tv_private.queue_push_dispatch();');
