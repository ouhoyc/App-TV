create table public.app_tv_media (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.app_tv_profiles(id),
 payload jsonb not null check(octet_length(payload::text)<3200000),created_at timestamptz not null default now()
);
create index media_owner_created on public.app_tv_media(owner_id,created_at desc);
alter table public.app_tv_media enable row level security;
create policy media_read on public.app_tv_media for select to authenticated using ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin())));
create policy media_insert on public.app_tv_media for insert to authenticated with check ((owner_id=(select auth.uid()) or (select app_tv_private.admin())) and app_tv_private.valid_payload(payload,owner_id));
create policy media_delete on public.app_tv_media for delete to authenticated using ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin())));
revoke all on public.app_tv_media from public,anon,authenticated;
grant select,insert,delete on public.app_tv_media to authenticated;
