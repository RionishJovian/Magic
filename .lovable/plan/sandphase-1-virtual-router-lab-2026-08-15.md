# Sandphase 1 — usable in-app sandbox (virtual router)

Status: **merged** to `main` via GitHub PR #9 (2026-08-15). Remaining operator steps: apply `supabase/migrations/20260815143000_sandphase1_virtual_router.sql` **and** `supabase/migrations/20260816071000_fix_quota_trigger_sites_connection_mode.sql` on Lovable Cloud, then republish. Path 3 hub work is separate.

## Contract

- One virtual MikroTik per tenant (`connection_mode = sandbox`, `environment = test`, `is_virtual = true`).
- Any non-expired member may create, reset, delete, and connection-check it.
- Never dials LAN, public IPs, or the Singapore hub. No promotion to production.
- Does not consume the paid router quota.
- Label everywhere: **Sandbox · not real hardware**.
- v1 operations: connection check, Live users (kick/ban), Vouchers (hotspot users/profiles).
- Out of scope here: portal deploy, Multi-WAN, Cloud/WireGuard provision, Terminal free shell.

## Wiring

Intercept RouterOS REST at `loadRouterConn` / `mikrotik.server` when `connection_mode = sandbox`. Persist the fake device in `sandbox_state.world`.
