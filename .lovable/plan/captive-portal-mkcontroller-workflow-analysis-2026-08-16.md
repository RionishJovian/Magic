# Captive portal workflow analysis (MKController-style photos vs MikroTik Magic)

**Status:** Decision locked — all three modes with owner grants; **RouterOS 7.1+ only, no scaffolds**.  
**Date:** 2026-08-16 (updated)

## Product rules

1. Ship **voucher_only**, **hybrid_light**, and **commerce** with owner → role/user grants.
2. **Do not** build scaffolded / slideshow / sandbox-only guest features.
3. Every guest path must work on **RouterOS 7.1+ Hotspot** (HTML in `html-directory` + native trial).
4. Payment method **names, descriptions, and card accent colours are operator-customizable**.
   There is no hard-coded Pix/card provider UI and no cloud checkout scaffold.

## Modes

| Mode           | Guest UX                               | Permission  |
| -------------- | -------------------------------------- | ----------- |
| `voucher_only` | Code login                             | Always      |
| `hybrid_light` | Seller + POS distance                  | Owner grant |
| `commerce`     | Custom method cards + packages + trial | Owner grant |

## RouterOS 7.1+ behaviour

- Deploy (hybrid/commerce) sets Hotspot profile `login-by` to include `trial`,
  `trial-uptime=<minutes>`, `trial-user-profile=mm-trial`, and upserts user profile `mm-trial`.
- Seller / pay_info **Connect** submits to `$(link-login-only)` with `username=T-$(mac-esc)`
  when `$(if trial == 'yes')`.
- Packages list active `portal_plans`; continue opens a custom pay_info or seller page.
- POS distance is client-side geolocation vs Sites lat/lng baked into `pos.html`.

## Apply on Lovable Cloud

1. `supabase/migrations/20260816210000_portal_guest_modes_and_grants.sql`
2. `supabase/migrations/20260816213000_portal_custom_payment_methods.sql`
3. Republish
