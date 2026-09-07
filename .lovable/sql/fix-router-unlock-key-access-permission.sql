-- Fixes: permission denied for function router_unlock_key_accessible_for_owner
--
-- The authenticated one-router check derives its owner from auth.uid() and is
-- safe as a SECURITY DEFINER wrapper. The two-argument owner-scoped function
-- remains service_role-only for scheduled jobs.
CREATE OR REPLACE FUNCTION public.router_unlock_key_accessible(_router_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN public.is_platform_admin(auth.uid())
      OR public.has_role(auth.uid(), 'primary'::public.app_role)
      OR public.has_role(auth.uid(), 'agent'::public.app_role) THEN true
    ELSE private.router_unlock_key_accessible_for_owner(
      _router_id,
      public.effective_owner(auth.uid())
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.router_unlock_key_accessible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.router_unlock_key_accessible(uuid)
  TO authenticated, service_role;
