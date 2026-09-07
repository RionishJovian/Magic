-- Lovable Cloud SQL Editor — run after security-run3-global-platform-rls.sql.
-- Scopes SELECT on global role-default tables. Safe to re-run.
-- Paste ONLY this SQL.

DROP POLICY IF EXISTS "operator_feature_role_defaults read" ON public.operator_feature_role_defaults;
CREATE POLICY "operator_feature_role_defaults read" ON public.operator_feature_role_defaults
FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), role)
);

DROP POLICY IF EXISTS "portal_mode_role_defaults read" ON public.portal_mode_role_defaults;
CREATE POLICY "portal_mode_role_defaults read" ON public.portal_mode_role_defaults
FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.has_role(auth.uid(), role)
);
