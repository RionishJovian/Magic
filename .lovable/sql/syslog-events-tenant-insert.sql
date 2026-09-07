-- Lovable Cloud SQL Editor — syslog paired-device insert (one paste).
-- Fixes Magic Hub / Local Connector "Sync now" failing with
--   new row violates row-level security policy for table "syslog_events"
-- Paste ONLY this SQL (no markdown). Then republish the app.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.syslog_events TO authenticated;

DROP POLICY IF EXISTS "tenant insert syslog" ON public.syslog_events;
CREATE POLICY "tenant insert syslog" ON public.syslog_events
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = public.effective_owner(auth.uid())
    AND NOT public.has_role(auth.uid(), 'read_only')
    AND NOT public.has_role(auth.uid(), 'expired')
  );
