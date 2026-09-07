-- Router tenant authorization for the WireGuard server foundation.
--
-- APPLIED 2026-08-14 to the live database (together with the payment_orders
-- delete-policy tightening). Kept here as the forward-only source of record;
-- do not re-run it — any further change needs a new migration.

--
-- Adds a single authorization helper used by router_connections policies,
-- keeps global owner/admin oversight, restricts every other account to
-- non-expired members of the same effective tenant, and makes tunnel_hubs
-- platform owner/admin-only (hub topology is never tenant-editable).

CREATE OR REPLACE FUNCTION public.can_manage_router_tenant(_user_id uuid, _tenant_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Global oversight: platform owner / admin accounts keep full visibility.
    public.has_role(_user_id, 'owner'::app_role)
    OR public.has_role(_user_id, 'admin'::app_role)
    OR (
      _tenant_owner_id IS NOT NULL
      AND public.effective_owner(_user_id) = _tenant_owner_id
      AND NOT public.is_expired(_user_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_router_tenant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_router_tenant(uuid, uuid) TO authenticated, service_role;

-- router_connections: replace the historical owner_id = auth.uid() policies
-- with effective-tenant isolation through the single helper above.
DROP POLICY IF EXISTS "routers owner manage" ON public.router_connections;
DROP POLICY IF EXISTS "routers scope manage" ON public.router_connections;
DROP POLICY IF EXISTS "routers scope read" ON public.router_connections;
DROP POLICY IF EXISTS "router_connections tenant read" ON public.router_connections;
DROP POLICY IF EXISTS "router_connections tenant write" ON public.router_connections;

CREATE POLICY "router_connections tenant read" ON public.router_connections
  FOR SELECT TO authenticated
  USING (public.can_manage_router_tenant(auth.uid(), owner_id));

CREATE POLICY "router_connections tenant write" ON public.router_connections
  FOR ALL TO authenticated
  USING (public.can_manage_router_tenant(auth.uid(), owner_id))
  WITH CHECK (public.can_manage_router_tenant(auth.uid(), owner_id));

-- tunnel_hubs: platform owner/admin only. Hub endpoints, hub public keys and
-- subnets are operator-managed infrastructure, never tenant input.
DROP POLICY IF EXISTS "tenant read tunnel hubs" ON public.tunnel_hubs;
DROP POLICY IF EXISTS "tenant write tunnel hubs" ON public.tunnel_hubs;

CREATE POLICY "tunnel hubs platform read" ON public.tunnel_hubs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "tunnel hubs platform write" ON public.tunnel_hubs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- Global tunnel-address uniqueness. The WireGuard hub subnet is shared by every
-- tenant, so a management /32 must be unique across the whole table, never per
-- tenant. Fail loudly if existing data already violates that invariant.
DO $$
DECLARE
  dupes integer;
BEGIN
  SELECT count(*) INTO dupes
  FROM (
    SELECT tunnel_address
    FROM public.router_connections
    WHERE tunnel_address IS NOT NULL
    GROUP BY tunnel_address
    HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce global tunnel address uniqueness: % duplicated tunnel_address value(s) exist in public.router_connections. Resolve them before applying this migration.',
      dupes;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS router_connections_tunnel_address_global_key
  ON public.router_connections (tunnel_address)
  WHERE tunnel_address IS NOT NULL;
