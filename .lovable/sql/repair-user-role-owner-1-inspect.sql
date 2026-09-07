select
  ur.user_id,
  p.username,
  ur.role::text as role,
  ur.owner_id,
  op.username as owner_username
from public.user_roles ur
join public.profiles p on p.id = ur.user_id
left join public.profiles op on op.id = ur.owner_id
where lower(p.username) in ('kyaw')
   or ur.role::text in ('primary', 'owner')
order by ur.role::text, p.username;
