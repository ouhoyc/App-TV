-- Durable, recipient-encrypted receipts. No provider key or raw credentials.
create table public.app_tv_provider_operations (
 id uuid primary key,
 actor_id uuid not null references public.app_tv_profiles(id),
 owner_id uuid not null references public.app_tv_profiles(id),
 client_id uuid not null,
 action text not null check (action in ('create','renew','status')),
 request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
 resource_hash text not null check (resource_hash ~ '^[0-9a-f]{64}$'),
 state text not null default 'pending' check (state in ('pending','succeeded','uncertain','failed','applied','resolved')),
 context_box jsonb not null check (jsonb_typeof(context_box)='object' and octet_length(context_box::text)<500000),
 result_box jsonb check (result_box is null or (jsonb_typeof(result_box)='object' and octet_length(result_box::text)<100000)),
 error_code text check (error_code is null or error_code ~ '^[A-Z_]{1,80}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index provider_ops_owner on public.app_tv_provider_operations(owner_id,created_at desc);
create index provider_ops_actor on public.app_tv_provider_operations(actor_id);
create index provider_ops_client on public.app_tv_provider_operations(client_id,created_at desc);
create unique index provider_ops_one_unresolved on public.app_tv_provider_operations(resource_hash)
 where state in ('pending','uncertain','succeeded');
alter table public.app_tv_provider_operations enable row level security;
create policy provider_ops_read on public.app_tv_provider_operations for select to authenticated
 using ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin())));
create policy provider_ops_insert on public.app_tv_provider_operations for insert to authenticated
 with check ((select app_tv_private.active()) and actor_id=(select auth.uid()) and state='pending'
 and (owner_id=(select auth.uid()) or (select app_tv_private.admin())));
create policy provider_ops_update on public.app_tv_provider_operations for update to authenticated
 using ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin())))
 with check ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin())));
revoke all on public.app_tv_provider_operations from public,anon,authenticated;
grant select,insert on public.app_tv_provider_operations to authenticated;
grant update(state,result_box,error_code,updated_at) on public.app_tv_provider_operations to authenticated;

create function public.app_tv_claim_provider_operation(entry jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare existing public.app_tv_provider_operations; inserted public.app_tv_provider_operations;
begin
 if not app_tv_private.active() then raise exception 'Inactive account' using errcode='42501'; end if;
 if not (entry->>'resource_hash' ~ '^[0-9a-f]{64}$') then raise exception 'Invalid resource'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(entry->>'resource_hash',0));
 select * into existing from public.app_tv_provider_operations where id=(entry->>'id')::uuid;
 if found then
   if existing.request_hash<>entry->>'request_hash' or existing.owner_id<>(entry->>'owner_id')::uuid then
     raise exception 'Operation mismatch' using errcode='40001';
   end if;
   return jsonb_build_object('claimed',false,'operation',to_jsonb(existing));
 end if;
 if exists(select 1 from public.app_tv_provider_operations where resource_hash=entry->>'resource_hash'
   and (state in ('pending','uncertain','succeeded') or
     (request_hash=entry->>'request_hash' and state='applied' and created_at>now()-interval '2 minutes'))) then
   raise exception 'Operation requires review' using errcode='40001';
 end if;
 if not app_tv_private.valid_payload(entry->'context_box',(entry->>'owner_id')::uuid) then
   raise exception 'Invalid encrypted context' using errcode='42501';
 end if;
 insert into public.app_tv_provider_operations(id,actor_id,owner_id,client_id,action,request_hash,resource_hash,context_box)
 values((entry->>'id')::uuid,auth.uid(),(entry->>'owner_id')::uuid,(entry->>'client_id')::uuid,
   entry->>'action',entry->>'request_hash',entry->>'resource_hash',entry->'context_box') returning * into inserted;
 return jsonb_build_object('claimed',true,'operation',to_jsonb(inserted));
end $$;
revoke all on function public.app_tv_claim_provider_operation(jsonb) from public,anon,authenticated;
grant execute on function public.app_tv_claim_provider_operation(jsonb) to authenticated;
