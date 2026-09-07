-- Grant Developer (platform_admins) to username `nish@dev`.
-- Developer is NOT an app_role — it is a platform_admins row.
-- Safe to re-run. Paste in Lovable Cloud → SQL Editor.

do $$
declare
  target_id uuid;
begin
  select p.id into target_id
  from public.profiles p
  where lower(p.username) = 'nish@dev'
  limit 1;

  if target_id is null then
    raise exception 'No profile username=nish@dev found.';
  end if;

  insert into public.platform_admins (user_id, note)
  values (target_id, 'Developer — nish@dev')
  on conflict (user_id) do update
  set note = excluded.note;
end $$;

-- Verify
select
  p.username,
  ur.role::text as tenant_role,
  exists (
    select 1 from public.platform_admins pa where pa.user_id = p.id
  ) as is_developer,
  pa.note as developer_note
from public.profiles p
left join public.user_roles ur on ur.user_id = p.id
left join public.platform_admins pa on pa.user_id = p.id
where lower(p.username) = 'nish@dev';
