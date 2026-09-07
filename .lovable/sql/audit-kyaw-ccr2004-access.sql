-- Audit: why User kyaw cannot see router CCR_2004
-- Paste/run in Lovable SQL Editor.
--
-- Under the self-own model:
--   effective_owner(kyaw) must equal router_connections.owner_id
--   Both should be kyaw's user id (café User owns their RouterBOARD).

-- A) Kyaw account + role + tenant
select
  'kyaw_account' as section,
  p.id as user_id,
  p.username,
  p.display_name,
  ur.role::text as role,
  ur.owner_id as role_owner_id,
  op.username as role_owner_username,
  public.effective_owner(p.id) as effective_owner_id,
  ep.username as effective_owner_username,
  ur.expires_at
from public.profiles p
left join public.user_roles ur on ur.user_id = p.id
left join public.profiles op on op.id = ur.owner_id
left join public.profiles ep on ep.id = public.effective_owner(p.id)
where lower(p.username) = 'kyaw';

-- B) Router CCR_2004
select
  'router_ccr_2004' as section,
  rc.id as router_id,
  rc.name,
  rc.owner_id as router_owner_id,
  rp.username as router_owner_username,
  rc.created_at
from public.router_connections rc
left join public.profiles rp on rp.id = rc.owner_id
where rc.name ilike '%CCR_2004%'
   or rc.name ilike '%CCR%2004%'
   or rc.name ilike '%CCR2004%'
   or rc.name ilike '%2004%';

-- C) Access verdict (self-own model)
select
  'access_check' as section,
  p.username as user_username,
  ep.username as user_sees_as_tenant,
  rc.name as router_name,
  rp.username as router_belongs_to,
  (public.effective_owner(p.id) = rc.owner_id) as can_see_router,
  case
    when public.effective_owner(p.id) is null
      then 'FAIL: kyaw has no effective_owner (missing user_roles.owner_id)'
    when ur.role = 'expired'::public.app_role
      then 'FAIL: kyaw role is expired — renew / set client before expecting write access'
    when public.effective_owner(p.id) = rc.owner_id
      then 'OK: café User owns this router — if still invisible, sign out/in or clear cache'
    when rc.owner_id <> p.id and public.effective_owner(p.id) = p.id
      then 'FAIL: router still on Primary/other account after self-own — run repair-kyaw-cafe-router-self-own.sql'
    else 'FAIL: owner mismatch — effective_owner ≠ router.owner_id'
  end as diagnosis
from public.profiles p
join public.user_roles ur on ur.user_id = p.id
cross join public.router_connections rc
left join public.profiles ep on ep.id = public.effective_owner(p.id)
left join public.profiles rp on rp.id = rc.owner_id
where lower(p.username) = 'kyaw'
  and (
    rc.name ilike '%CCR_2004%'
    or rc.name ilike '%CCR%2004%'
    or rc.name ilike '%CCR2004%'
    or rc.name ilike '%2004%'
  );
