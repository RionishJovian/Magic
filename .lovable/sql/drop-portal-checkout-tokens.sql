-- Drop retired guest checkout tokens (old /portal/checkout cloud scaffold).
-- Safe if the table is missing. Does not affect Tier Pass or desk Payments.
-- Lovable Cloud SQL Editor: paste ONLY the line below (no markdown).

DROP TABLE IF EXISTS public.portal_checkout_tokens CASCADE;
