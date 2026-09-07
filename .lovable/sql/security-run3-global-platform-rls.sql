-- Run after security-run1-storage.sql and security-run2-definer-grants.sql on Lovable Cloud.
-- Locks global defaults + marketing pricing to platform administrators only.

DROP POLICY IF EXISTS "operator_feature_role_defaults owner write" ON public.operator_feature_role_defaults;
DROP POLICY IF EXISTS "operator_feature_role_defaults platform write" ON public.operator_feature_role_defaults;
CREATE POLICY "operator_feature_role_defaults platform write" ON public.operator_feature_role_defaults
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "portal_mode_role_defaults owner write" ON public.portal_mode_role_defaults;
DROP POLICY IF EXISTS "portal_mode_role_defaults platform write" ON public.portal_mode_role_defaults;
CREATE POLICY "portal_mode_role_defaults platform write" ON public.portal_mode_role_defaults
FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can update the pricing promo" ON public.pricing_promo;
DROP POLICY IF EXISTS "Platform admins can update the pricing promo" ON public.pricing_promo;
CREATE POLICY "Platform admins can update the pricing promo" ON public.pricing_promo
FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));
