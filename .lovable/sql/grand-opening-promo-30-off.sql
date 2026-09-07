-- Lovable Cloud SQL Editor — grand opening promo (30% off Monthly & Annual)
-- Window: 23 Aug 2026 → 24 Sep 2026 inclusive (Asia/Yangon). Safe to re-run.

UPDATE public.pricing_promo
SET
  starts_on = '2026-08-23',
  ends_on = '2026-09-24',
  label = 'Grand opening gift — 30% off Monthly & Annual',
  monthly_standard_mmk = 95000,
  monthly_promo_mmk = 66500,
  annual_standard_mmk = 1045000,
  annual_promo_mmk = 731500,
  active = true,
  updated_at = now()
WHERE id = true;
