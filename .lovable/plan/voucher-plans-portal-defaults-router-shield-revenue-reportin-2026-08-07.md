# Voucher plans, portal defaults, router shield & revenue reporting

## 1. Portal never fails on a new account

- Add a database-side default: when a new account is created, a `portal_settings` row is written automatically for that account (same defaults the app uses today), plus the four starter voucher plans (below).
- Backfill any existing account that has no portal row so nobody sees the current error.
- The app already creates a row on first load as a fallback; that stays as a safety net.

## 2. App time = UTC+06:30 (Myanmar)

- One shared time helper used everywhere dates are shown or bucketed (revenue rollups, sales log, syslog, audit, voucher expiry countdowns), fixed to `Asia/Yangon` (UTC+06:30) regardless of the visitor's device clock.
- Timestamps stay stored in UTC in the database; only display and day/week/month boundaries use +06:30, so a new device signing in sees identical numbers.
- When plans are pushed to a router, the generated script also sets the router clock/timezone to `Asia/Yangon` so voucher expiry on the router matches the app.

## 3. Routers tab — Login Bypass Shield

- New toggle card on each router row: **Login Bypass Shield — On/Off**, with a plain-language subtitle ("Stops guests from skipping the voucher login"). No technical detail exposed in the UI.
- Turning it on pushes a firewall rule set to the router that blocks the common tunnel/VPN escape routes used to bypass the hotspot login; turning it off removes exactly those rules.
- State is read back from the router so the toggle always reflects reality, with success/failure toasts.

## 4. Portal tab — voucher plan templates

Four built-in, fully editable templates seeded per account:

| Plan | Duration  | Devices   | Bandwidth | Code                        |
| ---- | --------- | --------- | --------- | --------------------------- |
| 1D   | 24h       | 1         | editable  | auto-generated              |
| 7D   | 7 days    | 1         | editable  | auto-generated              |
| 1M   | 30 days   | 1         | editable  | auto-generated              |
| VIP  | unlimited | unlimited | unlimited | typed manually by the owner |

Rules applied to every plan:

- One code = one device. The first device to use a code locks to it; the same device can disconnect and log back in, other devices are refused.
- The clock starts at first login and never resets on re-login — reconnecting does not extend the plan.
- Duration and limits are enforced on the router itself, so they hold even if the app is offline.
- Each template's name, duration, device/bandwidth limits and **price in MMK (required)** are editable; price feeds the Revenue tab.
- VIP has no time or bandwidth limit and requires a manually entered code.

Pushing plans to a router:

- **Add to router** — writes the plans, leaves anything already there untouched (current behaviour).
- **Replace plans on router** — new button beside it; removes the previously pushed plans, then writes the current ones. Confirmation dialog first.

Expired voucher cleanup:

- A scheduled daily job deletes used/expired voucher codes from the app, and the same cleanup runs against connected routers so their user lists don't grow forever. A sales record is kept for revenue before deletion.

## 5. Revenue tab

- New dashboard row: **1D sold · 7D sold · 1M sold · VIP sold · Total tickets · Total revenue (MMK)**, sourced from vouchers that were actually used, priced from the plan template.
- Existing daily/weekly/monthly rollups switch to MMK and to +06:30 day boundaries.
- Retention: revenue records older than 3 months are deleted automatically by the same daily job.
- **Download PDF** button at the bottom exports the current dashboard plus the sales table for manual archiving.

## Technical notes

- Migrations: extend `portal_plans` with `duration_minutes`, `device_limit`, `rate_limit`, `price_mmk`, `plan_key`, `is_vip`, `manual_code`; add `voucher_codes` tracking (code, plan, router, bound MAC, first_seen_at, expires_at, status) and index by owner; trigger on `handle_new_user` to seed `portal_settings` + the four default plans; `pg_cron` daily job for voucher expiry cleanup and 90-day revenue pruning.
- Router side: hotspot user profiles per plan with `shared-users=1`, `session-timeout`/`limit-uptime` from the template, `rate-limit` from the template, `add-mac-cookie=yes` for same-device re-login; VIP profile with no limits. Plans are tagged by comment so "Replace" can remove only app-managed entries.
- Login Bypass Shield: a comment-tagged `/ip firewall filter` + address-list rule block added/removed via the existing REST client; state detected by looking for the tag.
- Server functions live in `src/lib/portal.functions.ts`, `src/lib/monetization.functions.ts`, and a new `src/lib/shield.functions.ts`, all scoped through `effective_owner`.
- PDF export generated client-side from the rendered dashboard data (no new backend dependency).
