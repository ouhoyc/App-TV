alter table public.app_tv_media add column category text not null default 'ads' check(category in ('ads','tutorials'));
alter table public.app_tv_media add column thumbnail jsonb check(thumbnail is null or octet_length(thumbnail::text)<120000);
create index media_owner_category_created on public.app_tv_media(owner_id,category,created_at desc,id);
alter policy media_insert on public.app_tv_media with check (
 (owner_id=(select auth.uid()) or (select app_tv_private.admin()))
 and app_tv_private.valid_payload(payload,owner_id)
 and (thumbnail is null or app_tv_private.valid_payload(thumbnail,owner_id))
);
create policy media_update on public.app_tv_media for update to authenticated
 using ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin())))
 with check ((select app_tv_private.active()) and (owner_id=(select auth.uid()) or (select app_tv_private.admin())) and (thumbnail is null or app_tv_private.valid_payload(thumbnail,owner_id)));
grant update(category,thumbnail) on public.app_tv_media to authenticated;
