-- Lovable Cloud SQL Editor — router tenant BOLA fix (one paste).
-- Before: any café owner/admin could manage every tenant's router_connections
-- (and anything else gated by can_manage_router_tenant).
-- After: only platform_admins get cross-tenant access; same-café staff still
-- use effective_owner + not expired. Does not change tunnel_hubs policies.
-- Paste ONLY this SQL (no markdown). Then republish the app.

CREATE OR REPLACE FUNCTION private.can_manage_router_tenant(_user_id uuid, _tenant_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    private.is_platform_admin(_user_id)
    OR (
      _tenant_owner_id IS NOT NULL
      AND public.effective_owner(_user_id) = _tenant_owner_id
      AND NOT public.is_expired(_user_id)
    );
$function$;

REVOKE ALL ON FUNCTION private.can_manage_router_tenant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_router_tenant(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_router_tenant(_user_id uuid, _tenant_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT private.can_manage_router_tenant(_user_id, _tenant_owner_id);
$function$;

REVOKE ALL ON FUNCTION public.can_manage_router_tenant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_router_tenant(uuid, uuid) TO authenticated, service_role;
