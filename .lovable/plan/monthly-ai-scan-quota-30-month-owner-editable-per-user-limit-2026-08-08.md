# Monthly AI scan quota (30/month) + owner-editable per-user limit

## Cost context

Measured from the gateway log: one AI scan uses ~438 tokens and costs **0.0025 credits**.

| Quota                     | Cost per user per month (if fully used) |
| ------------------------- | --------------------------------------- |
| 5 scans (today, lifetime) | ~0.012 credits total, ever              |
| 30 scans/month (new)      | ~0.074 credits/month                    |

Ten active clients at a full 30 scans each is about 0.75 credits a month. Low risk.

## What changes

**1. Default becomes 30 scans, resetting every month**

Today the quota is a lifetime cap of 5 — once a client used 5 scans, they were done forever. It becomes **30 scans per calendar month**, counted in app time (UTC+06:30), and refills automatically on the 1st of each month. Owners and admins remain unlimited; Expired accounts still cannot scan.

**2. Per-user override in Users management (owner/admin only)**

Each row in Users management gets a **Scan limit** control showing the user's current monthly allowance and how many they have used this month. The owner can type a new number (0–500) and save it, or reset it back to the default 30. Setting `0` blocks scans for that account entirely.

**3. Fleet page and Credit usage copy**

The "scans left" pill on Fleet reads from the effective limit, so it shows e.g. `24/30 scans left this month`. The Credit usage page note updates to describe the monthly allowance.

## Technical details

**Database migration**

- New table `public.ai_scan_limits`: `user_id` (PK, references auth.users), `monthly_limit` int not null, `owner_id`, `created_at`, `updated_at` + `touch_updated_at` trigger.
- GRANTs: `SELECT` to `authenticated` (users read their own), `SELECT, INSERT, UPDATE, DELETE` to `authenticated` for owners via policy, `ALL` to `service_role`.
- RLS: a user may read their own row; owners/admins (`has_role`) may read and write rows within `effective_owner(auth.uid())`.
- No row means "use the default 30" — no backfill needed.

**Server**

- `src/lib/fleet.functions.ts`: rename the constant to `DEFAULT_MONTHLY_AI_SCAN_LIMIT = 30`. `aiScanQuota` now:
  - resolves the effective limit from `ai_scan_limits` for the caller, falling back to the default;
  - counts `fleet_scan_runs` filtered by `triggered_by = user` **and** `generated_at >= start of current month`;
  - returns `{ unlimited, expired, limit, used, remaining, periodStart, periodLabel }`.
- `src/lib/time.ts`: add `appStartOfMonth()` returning the UTC ms of the 1st at 00:00 Asia/Yangon, mirroring the existing `appStartOfDay` helper.
- `src/lib/users.functions.ts`:
  - `listAppUsers` also returns `scan_limit` (effective) and `scans_used_this_month` per user.
  - new `setAppUserScanLimit` server fn — owner-guarded, validates `0–500` or `null` (reset to default), upserts/deletes the `ai_scan_limits` row.

**UI**

- `src/routes/_authenticated/app.users.tsx`: add a compact "Scan limit" cell per user with a number input, Save, and Reset to default, wired to `setAppUserScanLimit` with a toast and query invalidation. Rendered only for owner/admin (the page is already owner-gated).
- `src/routes/_authenticated/app.fleet.tsx`: pill copy becomes `{remaining}/{limit} scans left this month`.
- `src/routes/_authenticated/app.usage.tsx` line 155: replace the "5 AI scans" line with the monthly-30 wording and mention per-user overrides in Users management.
