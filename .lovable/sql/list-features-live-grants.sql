-- Lovable Cloud SQL Editor — replace broken list_features (one paste).
-- Fixes: relation "feature_user_grants" does not exist.
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

  -- Voucher profiles + portal HTML deploy: every active role.
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

REVOKE ALL ON FUNCTION private.list_features(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.list_features(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_feature(_user_id uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.list_features(_user_id) @> ARRAY[_feature];
$$;

REVOKE ALL ON FUNCTION private.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_feature(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_features(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.list_features(
    CASE
      WHEN public.is_platform_admin(auth.uid()) THEN COALESCE(_user_id, auth.uid())
      ELSE auth.uid()
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.has_feature(_user_id uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT private.has_feature(
    CASE
      WHEN public.is_platform_admin(auth.uid()) THEN COALESCE(_user_id, auth.uid())
      ELSE auth.uid()
    END,
    _feature
  );
$$;

REVOKE ALL ON FUNCTION public.list_features(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_feature(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_features(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;
