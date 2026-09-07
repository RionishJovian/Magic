-- Optional: ensure every Dev (platform_admins) also holds Business Owner (primary).
-- Run only if a Dev account still shows User/client on Profile after republish.
-- Safe to re-run.

INSERT INTO public.user_roles (user_id, role, owner_id)
SELECT pa.user_id, 'primary'::public.app_role, pa.user_id
FROM public.platform_admins pa
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = pa.user_id
    AND ur.role = 'primary'::public.app_role
);
