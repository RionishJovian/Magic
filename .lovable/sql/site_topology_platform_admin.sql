-- Site topology port labels (platform administrators only).
-- Run on Lovable Cloud SQL Editor after merging site topology PR.

CREATE TABLE IF NOT EXISTS public.site_topology_config (
  site_id uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
  router_id uuid REFERENCES public.router_connections(id) ON DELETE SET NULL,
  port_labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_topology_port_labels_array CHECK (jsonb_typeof(port_labels) = 'array')
);

CREATE INDEX IF NOT EXISTS site_topology_config_router_id_idx
  ON public.site_topology_config (router_id);

ALTER TABLE public.site_topology_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site topology platform read" ON public.site_topology_config;
DROP POLICY IF EXISTS "site topology platform write" ON public.site_topology_config;

CREATE POLICY "site topology platform read" ON public.site_topology_config
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "site topology platform write" ON public.site_topology_config
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
