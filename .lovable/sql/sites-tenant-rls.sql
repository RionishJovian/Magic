-- Lovable Cloud SQL Editor — sites tenant RLS (one paste).
-- Fixes: any global "owner" role could see/edit every tenant's sites
-- (other cafés' site names in the switcher / Add router dropdown), which then
-- blocked saveRouter with "Site not found on your account."
-- Also lets staff (site_manager) see their employer's sites via effective_owner.
-- Paste ONLY this SQL (no markdown). Then republish the app.
-- Still required even after app-side listSites owner_id filtering.

DROP POLICY IF EXISTS "sites_select_own_or_owner" ON public.sites;
DROP POLICY IF EXISTS "sites_insert_own" ON public.sites;
DROP POLICY IF EXISTS "sites_update_own_or_owner" ON public.sites;
DROP POLICY IF EXISTS "sites_delete_own_or_owner" ON public.sites;
DROP POLICY IF EXISTS "sites tenant select" ON public.sites;
DROP POLICY IF EXISTS "sites tenant insert" ON public.sites;
DROP POLICY IF EXISTS "sites tenant update" ON public.sites;
DROP POLICY IF EXISTS "sites tenant delete" ON public.sites;

CREATE POLICY "sites tenant select" ON public.sites
  FOR SELECT TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    OR public.is_platform_admin(auth.uid())
  );

CREATE POLICY "sites tenant insert" ON public.sites
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = public.effective_owner(auth.uid())
    AND NOT public.has_role(auth.uid(), 'read_only'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'expired'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'pending'::public.app_role)
  );

CREATE POLICY "sites tenant update" ON public.sites
  FOR UPDATE TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    owner_id = public.effective_owner(auth.uid())
    AND NOT public.has_role(auth.uid(), 'read_only'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'expired'::public.app_role)
  );

CREATE POLICY "sites tenant delete" ON public.sites
  FOR DELETE TO authenticated
  USING (
    (
      owner_id = public.effective_owner(auth.uid())
      OR public.is_platform_admin(auth.uid())
    )
    AND NOT public.has_role(auth.uid(), 'read_only'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'expired'::public.app_role)
  );
