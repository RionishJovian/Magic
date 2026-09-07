-- Remove leftover Sandphase 1 virtual / sandbox router rows from live tenants.
-- Safe to run in Lovable Cloud SQL Editor (no secrets required).
-- Physical routers (is_virtual = false, connection_mode <> 'sandbox') are untouched.

BEGIN;

DELETE FROM public.sandbox_state
WHERE router_connection_id IN (
  SELECT id FROM public.router_connections
  WHERE is_virtual = true OR connection_mode = 'sandbox'
);

DELETE FROM public.sandbox_routers
WHERE router_connection_id IN (
  SELECT id FROM public.router_connections
  WHERE is_virtual = true OR connection_mode = 'sandbox'
);

DELETE FROM public.router_connections
WHERE is_virtual = true OR connection_mode = 'sandbox';

COMMIT;
