# Codex Handoff Prompt — MikroTik Magic QA/Monitoring Fixes

Copy the block below verbatim as the task prompt for Codex.

---

You are working in the MikroTik Magic repo (TanStack Start v1 + React 19 + Vite, Supabase/Lovable Cloud backend, Bun package manager). Implement and verify the following fixes. Do not redesign anything else; do not deploy/publish.

## Fix 1 — Restore the Login Bypass Shield toggle in Quick Config (HIGH)

The "Login Bypass Shield" switch was removed from `src/components/QuickConfigPanel.tsx`. The backend API still exists in `src/lib/shield.functions.ts` (`getShieldStatus`, `setShield`) but has no remaining UI caller.

Required:
- Inspect `src/lib/shield.functions.ts` for the exact signatures (status getter takes router identity — check whether it needs `routerId` or `routerName`; pass what's needed from `src/routes/_authenticated/app.routers.tsx`).
- Add a "Login Bypass Shield" row to QuickConfigPanel, rendered immediately after the Client Isolation row, in the protection group. It must show live status (queried via `getShieldStatus`) and a Switch that calls `setShield`, with optimistic state handling consistent with the other feature rows in the panel, and toast feedback on success/failure.
- Restore/add the corresponding i18n strings for `en`, `zh`, and `my` locales (the zh/my keys were deleted with the UI; re-add them).
- Do not alter the four existing Quick Config features (`ntpSync`, `clientIsolation`, `wanInputGuard`, `loginFloodGuard`) or Fair Share QoS rendering.

## Fix 2 — Revenue page voucher ledger validation error (HIGH)

`src/routes/_authenticated/app.revenue.tsx` (~line 516) calls `fetchLedger` with `limit: 5000`, but `ledgerSchema` in `src/lib/monetization.functions.ts` capped `limit` at 500, so every ledger load threw a Zod `too_big` error (13 occurrences in error logs).

Status: already changed to `.max(5000)` in `ledgerSchema`. Verify the schema edit is present and consistent, and confirm no other caller exceeds the bound. If you prefer, instead lower the client limit to ≤500 with pagination — but keep exactly one of the two approaches, not both.

## Fix 3 — Captive Portal security scan hammers every router (MEDIUM)

`src/routes/_authenticated/app.routers.tsx` rendered `<CaptivePortalSecurityPanel routerId={r.id} />` unconditionally for each router card, firing ~30 live RouterOS queries per router on page load and showing red error boxes for offline routers.

Status: already gated behind `{isOpen && ...}` so the scan only runs when the router's Details section is expanded. Verify the gate is in place and the panel's `useQuery` does not fire on list render. Consider also surfacing a soft "offline" state instead of a danger block when the router is unreachable, but do not change the scan logic itself.

## Review item — unrelated typecheck workaround

During the fixes a broad type assertion was added in `src/lib/voucher-activation.server.ts` around the `claim_voucher_first_use` RPC because the migration (`supabase/migrations/20260828100000_atomic_voucher_first_use.sql`) exists but the generated Supabase types lack the function. Review it: the correct fix is to regenerate Supabase types (or add the RPC to the generated types) and remove the assertion. Runtime behavior must stay fail-closed.

## Constraints (unchanged, binding)

- Preserve tenant/RLS isolation: no cross-tenant reads/writes; the developer "act on tenant router" path stays grant-gated and audited.
- Router admin credentials remain local-only; no global TLS bypass; router tests are mocked-only.
- No deployment or publish.
- Verification: run `bunx tsc --noEmit` (clean baseline), the relevant Vitest files (`bun run test` — note 4 DB-backed test files need live PG* creds and are expected to fail without them; the other ~477 should pass). Do not trust `bun run lint` as a gate — it has pre-existing drift.
- When done, mark the three findings resolved (fixed) via the project-monitoring tooling.
