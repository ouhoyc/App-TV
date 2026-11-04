-- App TV: invitations, protected roles, recipient-encrypted owner workspaces.
-- Applied only to woldrkevualjtdzsbcwn; the existing public schema was inspected empty.
begin;
create schema app_tv_private;
revoke all on schema app_tv_private from public, anon;
grant usage on schema app_tv_private to authenticated, service_role;

create table public.app_tv_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique check(email=lower(trim(email))),
 display_name text not null check(length(display_name) between 1 and 120),
 role text not null check(role in ('admin','reseller')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create index app_tv_profile_role on public.app_tv_profiles(role,active);
alter table public.app_tv_profiles enable row level security;

create function app_tv_private.active() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.app_tv_profiles where id=auth.uid() and active)
$$;
create function app_tv_private.admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.app_tv_profiles where id=auth.uid() and active and role='admin')
$$;
create function app_tv_private.admin_ids() returns uuid[] language sql stable security definer set search_path='' as $$
 select case when app_tv_private.active() then coalesce(array_agg(id),'{}'::uuid[]) else '{}'::uuid[] end
 from public.app_tv_profiles where active and role='admin'
$$;
revoke all on function app_tv_private.active(), app_tv_private.admin(),app_tv_private.admin_ids() from public,anon;
grant execute on function app_tv_private.active(), app_tv_private.admin(),app_tv_private.admin_ids() to authenticated;
create policy profile_read on public.app_tv_profiles for select to authenticated using (id=(select auth.uid()) or (select app_tv_private.admin()));
-- Profile creation, role assignment and activation are server-only operations.
revoke all on public.app_tv_profiles from anon,authenticated;
grant select on public.app_tv_profiles to authenticated;
grant all on public.app_tv_profiles to service_role;

create table public.app_tv_public_keys (
 user_id uuid primary key references public.app_tv_profiles(id) on delete cascade,
 public_jwk jsonb not null check(public_jwk->>'kty'='RSA' and public_jwk->>'e'='AQAB' and length(public_jwk->>'n') between 342 and 1400 and not public_jwk ? 'd'),
 created_at timestamptz not null default now()
);
alter table public.app_tv_public_keys enable row level security;
create policy key_read on public.app_tv_public_keys for select to authenticated using ((select app_tv_private.active()) and (user_id=(select auth.uid()) or (select app_tv_private.admin()) or user_id=any((select app_tv_private.admin_ids())::uuid[])));
create policy key_create on public.app_tv_public_keys for insert to authenticated with check ((select app_tv_private.active()) and user_id=(select auth.uid()));
revoke all on public.app_tv_public_keys from anon,authenticated;
grant select,insert on public.app_tv_public_keys to authenticated;
grant all on public.app_tv_public_keys to service_role;

create table public.app_tv_keyrings (
 user_id uuid primary key references public.app_tv_public_keys(user_id) on delete cascade,
 password_envelope jsonb not null check(jsonb_typeof(password_envelope)='object' and octet_length(password_envelope::text)<30000),
 recovery_envelope jsonb not null check(jsonb_typeof(recovery_envelope)='object' and octet_length(recovery_envelope::text)<30000),
 recovery_hash text not null check(recovery_hash ~ '^[0-9a-f]{64}$'),
 updated_at timestamptz not null default now()
);
alter table public.app_tv_keyrings enable row level security;
create policy keyring_read on public.app_tv_keyrings for select to authenticated using ((select app_tv_private.active()) and user_id=(select auth.uid()));
create policy keyring_create on public.app_tv_keyrings for insert to authenticated with check ((select app_tv_private.active()) and user_id=(select auth.uid()));
create policy keyring_change on public.app_tv_keyrings for update to authenticated using ((select app_tv_private.active()) and user_id=(select auth.uid())) with check ((select app_tv_private.active()) and user_id=(select auth.uid()));
revoke all on public.app_tv_keyrings from anon,authenticated;
grant select,insert on public.app_tv_keyrings to authenticated;
grant update(password_envelope,recovery_envelope,recovery_hash,updated_at) on public.app_tv_keyrings to authenticated;
grant all on public.app_tv_keyrings to service_role;

create table public.app_tv_invitations (
 id uuid primary key default gen_random_uuid(),
 email text not null check(email=lower(trim(email))),
 display_name text not null check(length(display_name) between 1 and 120),
 role text not null check(role in ('admin','reseller')),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null default now()+interval '7 days',
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index app_tv_invitation_email on public.app_tv_invitations(email);
alter table public.app_tv_invitations enable row level security;
create policy invite_admin_read on public.app_tv_invitations for select to authenticated using ((select app_tv_private.admin()));
revoke all on public.app_tv_invitations from anon,authenticated;
grant select(id,email,display_name,role,expires_at,consumed_at) on public.app_tv_invitations to authenticated;
grant all on public.app_tv_invitations to service_role;

create function app_tv_private.valid_payload(p jsonb, owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select app_tv_private.active()
 and jsonb_typeof(p)='object' and p->>'version'='1'
 and jsonb_typeof(p->'recipients')='object'
 and length(p->>'ciphertext') between 24 and 4000000
 and length(p->>'iv')=16
 and p->'recipients' ? owner::text
 and exists(select 1 from public.app_tv_profiles where role='admin' and active)
 and not exists(select 1 from public.app_tv_profiles a where a.role='admin' and a.active
   and (not p->'recipients' ? a.id::text or not exists(select 1 from public.app_tv_public_keys k where k.user_id=a.id)))
 -- Both reserved administrators must have activated their accounts before writes.
 and not exists(select 1 from public.app_tv_invitations where role='admin' and consumed_at is null)
 and not exists(select 1 from jsonb_object_keys(p->'recipients') r(id)
   where r.id<>owner::text and not exists(select 1 from public.app_tv_profiles a where a.id::text=r.id and a.role='admin' and a.active))
$$;
revoke all on function app_tv_private.valid_payload(jsonb,uuid) from public,anon;
grant execute on function app_tv_private.valid_payload(jsonb,uuid) to authenticated;
create table public.app_tv_vaults (
 owner_id uuid primary key references public.app_tv_profiles(id) on delete restrict,
 payload jsonb not null,
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 check(octet_length(payload::text)<4200000)
);
alter table public.app_tv_vaults enable row level security;
create policy vault_read on public.app_tv_vaults for select to authenticated using ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin())));
create policy vault_create on public.app_tv_vaults for insert to authenticated with check ((owner_id=(select auth.uid()) or (select app_tv_private.admin())) and app_tv_private.valid_payload(payload,owner_id));
create policy vault_update on public.app_tv_vaults for update to authenticated using ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin()))) with check ((owner_id=(select auth.uid()) or (select app_tv_private.admin())) and app_tv_private.valid_payload(payload,owner_id));
revoke all on public.app_tv_vaults from anon,authenticated;
grant select,insert,update on public.app_tv_vaults to authenticated;
grant all on public.app_tv_vaults to service_role;

create function app_tv_private.vault_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.owner_id<>old.owner_id or new.revision<>old.revision+1) then
  raise exception 'Invalid owner or revision';
 end if;
 if TG_OP='INSERT' and new.revision<>1 then raise exception 'Invalid initial revision'; end if;
 new.updated_at=now(); return new;
end $$;
revoke all on function app_tv_private.vault_revision() from public,anon,authenticated;
create trigger app_tv_vault_revision before insert or update on public.app_tv_vaults for each row execute function app_tv_private.vault_revision();

create function public.app_tv_setup_keys(jwk jsonb, password_box jsonb, recovery_box jsonb, proof_hash text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not app_tv_private.active() then raise exception 'Access denied'; end if;
 insert into public.app_tv_public_keys(user_id,public_jwk) values(auth.uid(),jwk);
 insert into public.app_tv_keyrings(user_id,password_envelope,recovery_envelope,recovery_hash) values(auth.uid(),password_box,recovery_box,proof_hash);
end $$;
revoke all on function public.app_tv_setup_keys(jsonb,jsonb,jsonb,text) from public,anon;
grant execute on function public.app_tv_setup_keys(jsonb,jsonb,jsonb,text) to authenticated;

create function public.app_tv_save_vaults(changes jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c jsonb; result jsonb='[]'; changed uuid; n bigint;
begin
 if not app_tv_private.active() then raise exception 'Access denied'; end if;
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>100 then raise exception 'Invalid batch'; end if;
 if (select count(*)<>count(distinct x->>'owner_id') from jsonb_array_elements(changes) x) then raise exception 'Duplicate owner'; end if;
 for c in select value from jsonb_array_elements(changes) order by value->>'owner_id' loop
  n=(c->>'expected_revision')::bigint;
  changed=null;
  if n=0 then
   insert into public.app_tv_vaults(owner_id,payload,revision) values((c->>'owner_id')::uuid,c->'payload',1) returning owner_id into changed;
  elsif n>0 then
   update public.app_tv_vaults set payload=c->'payload',revision=n+1 where owner_id=(c->>'owner_id')::uuid and revision=n returning owner_id into changed;
  end if;
  if changed is null then raise exception 'Concurrent change: reload before saving' using errcode='40001'; end if;
  result=result||jsonb_build_array(jsonb_build_object('owner_id',changed,'revision',n+1));
 end loop;
 return result;
end $$;
revoke all on function public.app_tv_save_vaults(jsonb) from public,anon;
grant execute on function public.app_tv_save_vaults(jsonb) to authenticated;

create table public.app_tv_rate_limits(key text primary key, hits int not null default 1, window_start timestamptz not null default now());
alter table public.app_tv_rate_limits enable row level security;
revoke all on public.app_tv_rate_limits from public,anon,authenticated;
grant all on public.app_tv_rate_limits to service_role;
create policy service_rate_only on public.app_tv_rate_limits for all to service_role using (true) with check (true);
create function public.app_tv_rate_limit(rate_key text) returns boolean language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 insert into public.app_tv_rate_limits(key) values(rate_key)
 on conflict(key) do update set hits=case when public.app_tv_rate_limits.window_start<now()-interval '15 minutes' then 1 else public.app_tv_rate_limits.hits+1 end,
 window_start=case when public.app_tv_rate_limits.window_start<now()-interval '15 minutes' then now() else public.app_tv_rate_limits.window_start end returning hits into n;
 return n<=case when rate_key like 'peer:%' then 60 else 15 end;
end $$;
revoke all on function public.app_tv_rate_limit(text) from public,anon,authenticated;
grant execute on function public.app_tv_rate_limit(text) to service_role;
commit;
