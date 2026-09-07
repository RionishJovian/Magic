# Whole-app audit — MikroTik Magic

Read-only review of the re-synced codebase, database and test/security signals. Nothing was changed.

## Current map

- **Stack**: TanStack Start + React 19, Tailwind v4, Lovable Cloud backend.
- **Public routes**: landing, `/auth`, `/pricing`, `/portal/checkout` (info-only), MCP + `.well-known` endpoints.
- **App routes**: 34 authenticated `/app/*` pages, grouped by `src/lib/nav/modes.ts` into Business / Operations / Advanced, gated by `src/lib/nav/route-gate.ts`.
- **Server layer**: ~70 modules in `src/lib` (`*.functions.ts` RPC + `*.server.ts` internals), plus 20 public API routes for connector, checkout, webhooks and cron.
- **Connection engines**: Direct REST, Local Connector agent, legacy Cloud/VPS proxy, and the new server-only WireGuard peer foundation.
- **Health**: 448/448 tests pass across 31 files; all public tables have RLS enabled; no TODO/FIXME debt in `src`.

## Findings, by priority

### 1. WireGuard foundation is complete but inert (high)

`src/lib/wireguard/*` implements authorization, route policy, signed VPS transport and the peer lifecycle, and is covered by 50 tests — but nothing calls it. Confirmed: the `can_manage_router_tenant` function does not exist in the live database (0 rows in `pg_proc`), and `router_connections` still runs the pre-migration `tenant read` / `tenant write` policies. The staged migration's DROP list does cover both live policy names, so it is safe to apply.

### 2. Two incompatible VPS stacks (high)

`src/lib/cloud-vps.server.ts` reads `VPS_ROUTER_API_URL` + `VPS_ROUTER_API_SECRET`; `src/lib/wireguard/vps.server.ts` reads `VPS_ROUTER_API_URL` + `VPS_ROUTER_API_SIGNING_SECRET` + `VPS_ROUTER_API_KEY_ID`. Neither set is configured today, so both cloud paths fail closed. Shipping WireGuard without consolidating these will make the shared `VPS_ROUTER_API_URL` ambiguous.

### 3. Payment orders delete policy asymmetry (warning, security scanner)

`payment_orders_delete` relies on `has_tenant_role(...)` alone while select/update also require `owner_id = effective_owner(auth.uid())`. Functionally equivalent today, but the inconsistency is a defense-in-depth gap worth closing.

### 4. Missing page metadata (low)

`app.tenants.tsx`, `app.test-lab.index.tsx` have no `head()`. Minor SEO/tab-title gap on private pages.

### 5. Oversized route files (low)

`app.quick-setup.tsx` (1535 lines), `app.vouchers.tsx` (1118), `app.routers.tsx` (1031), `app.access-points.tsx` (956), `app.live.tsx` (934) mix data-fetching, forms and presentation in one file. No bug, but they are the slowest surfaces to change safely.

### 6. Empty router inventory (informational)

`router_connections` currently holds 0 rows, so no live device data exercises any transport path. Any reliability claim about connector/cloud/WireGuard remains unproven against real hardware.

## Recommended sequence

1. Apply the staged authorization migration (adds `can_manage_router_tenant`, effective-tenant router policies, owner/admin-only `tunnel_hubs`, global unique index on `tunnel_address`). Duplicate check already run: zero non-null `tunnel_address` values, so the preflight will pass.
2. Consolidate the two VPS credential sets onto one signed transport and retire the legacy secret name.
3. Tighten `payment_orders_delete` to match its sibling policies.
4. Wire the WireGuard "Add Router" UI only after 1 and 2 land.
5. Optional cleanup: add `head()` to the two routes; split the largest route files.

## Technical notes

- Migration file: `db/migrations/20260814103000_router_tenant_wireguard_authorization.sql`, still unapplied.
- Configured secrets today: `APP_ROUTER_SECRET`, `CONNECTOR_UPDATE_PRIVATE_KEY`, `CRON_SECRET`, `LOVABLE_API_KEY`, `PUBLIC_APP_URL`. No VPS secrets set.
- Storage: `db-backups`, `payment-receipts`, `portal-assets`, `database_export_26_07_26` — all private.

Approve this and tell me which items to execute; the audit itself required no code changes.
