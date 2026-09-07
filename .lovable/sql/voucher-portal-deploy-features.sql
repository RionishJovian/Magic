-- Lovable Cloud SQL Editor — run 2/2 (list_features floor grants).
-- Vouchers + portal_deploy for every active role except expired/pending.
-- Paste ONLY this SQL (no markdown). Then republish the app.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.list_features(_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  collected text[] := ARRAY[]::text[];
  extra text[];
BEGIN
  IF public.has_role(_user_id, 'primary'::public.app_role)
     OR public.has_role(_user_id, 'admin'::public.app_role) THEN
    RETURN ARRAY[
      'hybrid_light','guest_commerce','vouchers','portal_deploy','cash_sales',
      'bank_edit','reboot','alerts','syslog_ai','poe','telegram'
    ];
  END IF;
  IF public.has_role(_user_id, 'pending'::public.app_role)
     OR public.has_role(_user_id, 'expired'::public.app_role) THEN
    RETURN ARRAY[]::text[];
  END IF;

  collected := ARRAY['vouchers','portal_deploy']::text[];

  IF to_regclass('public.operator_feature_grants') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(array_agg(DISTINCT feature), ARRAY[]::text[])
      FROM public.operator_feature_grants
      WHERE user_id = $1
    $q$ INTO extra USING _user_id;
    collected := collected || COALESCE(extra, ARRAY[]::text[]);
  END IF;

  IF to_regclass('public.operator_feature_role_defaults') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(array_agg(DISTINCT d.feature), ARRAY[]::text[])
      FROM public.user_roles ur
      JOIN public.operator_feature_role_defaults d ON d.role = ur.role
      WHERE ur.user_id = $1
    $q$ INTO extra USING _user_id;
    collected := collected || COALESCE(extra, ARRAY[]::text[]);
  END IF;

  IF to_regclass('public.portal_mode_grants') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(array_agg(DISTINCT mode), ARRAY[]::text[])
      FROM public.portal_mode_grants
      WHERE user_id = $1
    $q$ INTO extra USING _user_id;
    collected := collected || COALESCE(extra, ARRAY[]::text[]);
  END IF;

  IF to_regclass('public.portal_mode_role_defaults') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(array_agg(DISTINCT d.mode), ARRAY[]::text[])
      FROM public.user_roles ur
      JOIN public.portal_mode_role_defaults d ON d.role = ur.role
      WHERE ur.user_id = $1
    $q$ INTO extra USING _user_id;
    collected := collected || COALESCE(extra, ARRAY[]::text[]);
  END IF;

  IF to_regclass('public.feature_user_grants') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(array_agg(DISTINCT feature), ARRAY[]::text[])
      FROM public.feature_user_grants
      WHERE user_id = $1 AND enabled
    $q$ INTO extra USING _user_id;
    collected := collected || COALESCE(extra, ARRAY[]::text[]);
  END IF;

  IF to_regclass('public.feature_role_defaults') IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(array_agg(DISTINCT d.feature), ARRAY[]::text[])
      FROM public.user_roles ur
      JOIN public.feature_role_defaults d
        ON d.role = ur.role AND d.enabled
      WHERE ur.user_id = $1
        AND d.owner_id = COALESCE(ur.owner_id, public.effective_owner($1))
    $q$ INTO extra USING _user_id;
    collected := collected || COALESCE(extra, ARRAY[]::text[]);
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[])
    INTO extra
    FROM unnest(collected) AS x
   WHERE x IS NOT NULL AND x <> '';
  RETURN COALESCE(extra, ARRAY[]::text[]);
END;
$$;
