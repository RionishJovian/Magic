-- Lovable Cloud SQL Editor — run 1/2 (RLS: deploy audit + shop-floor voucher tables).
-- Paste ONLY this SQL (no markdown). Then paste run 2.

DROP POLICY IF EXISTS "portal_deploy_audit tenant insert" ON public.portal_deploy_audit;
CREATE POLICY "portal_deploy_audit tenant insert" ON public.portal_deploy_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = public.effective_owner(auth.uid())
    AND user_id = auth.uid()
    AND NOT public.is_expired(auth.uid())
  );

DROP POLICY IF EXISTS "portal_deploy_audit tenant read" ON public.portal_deploy_audit;
CREATE POLICY "portal_deploy_audit tenant read" ON public.portal_deploy_audit
  FOR SELECT TO authenticated
  USING (owner_id = public.effective_owner(auth.uid()));

DROP POLICY IF EXISTS "portal_plans operator write" ON public.portal_plans;
DROP POLICY IF EXISTS "portal_plans tenant write" ON public.portal_plans;
CREATE POLICY "portal_plans tenant write" ON public.portal_plans
  FOR ALL TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    AND NOT public.is_expired(auth.uid())
    AND NOT public.has_role(auth.uid(), 'pending'::public.app_role)
  )
  WITH CHECK (
    owner_id = public.effective_owner(auth.uid())
    AND NOT public.is_expired(auth.uid())
    AND NOT public.has_role(auth.uid(), 'pending'::public.app_role)
  );

DROP POLICY IF EXISTS "voucher_codes operator write" ON public.voucher_codes;
DROP POLICY IF EXISTS "voucher_codes write own tenant" ON public.voucher_codes;
DROP POLICY IF EXISTS "voucher_codes tenant write" ON public.voucher_codes;
CREATE POLICY "voucher_codes tenant write" ON public.voucher_codes
  FOR ALL TO authenticated
  USING (
    owner_id = public.effective_owner(auth.uid())
    AND NOT public.is_expired(auth.uid())
    AND NOT public.has_role(auth.uid(), 'pending'::public.app_role)
  )
  WITH CHECK (
    owner_id = public.effective_owner(auth.uid())
    AND NOT public.is_expired(auth.uid())
    AND NOT public.has_role(auth.uid(), 'pending'::public.app_role)
  );
