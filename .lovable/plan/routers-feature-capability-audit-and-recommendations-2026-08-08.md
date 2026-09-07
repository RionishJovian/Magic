# Routers feature — capability audit and recommendations

## What the Routers page does today

Verified from `src/routes/_authenticated/app.routers.tsx`, `src/lib/routers.functions.ts`, `src/lib/shield.functions.ts`, `src/lib/tunnel.functions.ts`, `src/lib/mikrotik.server.ts`, `src/lib/guards.server.ts`.

| Capability                                              | State                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Add / edit / delete router (host, port, user, password) | Works; passwords AES-256-GCM encrypted, blank password keeps existing                                                    |
| Save auditing                                           | Every save success/failure written to `router_save_audit`                                                                |
| Connection test                                         | Deep 4-step test (DNS → TCP → TLS → REST) with a remediation checklist; tunnel routers tested via hub                    |
| Live telemetry                                          | Per-router collapsible panel: RouterOS version, uptime, CPU, memory, active users, per-interface RX/TX rates, 5s polling |
| Login Bypass Shield                                     | Per-router on/off toggle                                                                                                 |
| Outbound WireGuard tunnel                               | Full panel: key generation, rotation, hub selection, reachability                                                        |
| Device quota                                            | `DeviceLimitCard` + server-side `enforceDeviceQuota` (1 router for client roles)                                         |
| Search / filter                                         | Name, host, username                                                                                                     |
| WebFig deep link                                        | Opens the router's own UI in a new tab                                                                                   |
| Guided setup hand-off                                   | Links into the Quick Setup wizard                                                                                        |

## Gaps found

1. **Delete is unguarded and unlogged.** `deleteRouter` performs no `requireNotExpired` check and writes no audit row, unlike `saveRouter`.
2. **TLS options are not editable in the UI.** The form always submits `useTls: true` and `allowInsecureTls: true`; there is no checkbox, and editing a plain-HTTP router silently flips it to HTTPS.
3. **No site assignment.** `router_connections.site_id` exists, but the form never sets it, so routers cannot be grouped under a site from this page.
4. **No at-a-glance status.** `routersStatus` (online/offline per router, tunnel-aware) already exists as a server function but the page never calls it — every row shows the same animated "live" dot regardless of reachability. Status is only knowable by expanding telemetry or clicking Test.
5. **Per-row panels fan out on load.** Every router row mounts a Shield status query immediately, so each page load makes one router round-trip per router. Fine at 1 router, slow and noisy at 10+.
6. **No connection-mode indicator.** `listRouters` does not return `connection_mode`, `tunnel_last_ok`, or `last_active_path`, so direct vs. tunnel and failover state are invisible in the list.
7. **Test results are transient.** Diagnostics vanish on reload; nothing is stored for support/history.
8. **No lifecycle actions.** No reboot, no config backup/restore shortcut (backups live on a separate page), no RouterOS version/update hint.

## Recommended features (priority order)

### P1 — correctness and safety

- Guard `deleteRouter` with `requireNotExpired` and write a `router_save_audit` row (`action: "delete"`), matching save behaviour.
- Add explicit **Use HTTPS (TLS)** and **Allow self-signed certificate** checkboxes to the form so edits stop overwriting stored values.

### P2 — visibility

- Add a **fleet status strip** at the top of the page powered by the existing `routersStatus` (X online / Y offline, refresh button), and a per-row status pill (Online / Offline / Tunnel down) driven by the same result.
- Extend `listRouters` to return `connection_mode`, `site_id`, `tunnel_last_ok`, `last_active_path`, and render a **Direct / Tunnel / Failover** badge per row.
- Persist the last test outcome (reuse `router_save_audit` or a small `router_test_results` table) and show "Last tested: <time> — OK/Failed" on each row.

### P3 — organisation and scale

- **Site selector** in the add/edit form, plus a "Group by site" toggle in the list.
- **Lazy panels**: collapse Shield / Tunnel / Telemetry behind a single expandable row so no router calls happen until the user opens a router. Big win once accounts hold several routers.
- **Bulk actions** for owner/admin: test all, enable Shield on all.

### P4 — lifecycle

- Row actions for **Reboot** (privileged roles only, confirm dialog, audited) and **Backup now** that reuses the existing backup logic and links to the Backups page.
- Show RouterOS version with an "update available" hint from the telemetry data already fetched.

## Technical notes

- New/changed server functions live in `src/lib/routers.functions.ts`; keep each declaration a thin wrapper and load helpers via dynamic import inside the handler, as the file already does.
- Status strip should call `routersStatus` with React Query, a manual refresh and no aggressive polling — every call touches every router.
- Any privileged action (reboot) must go through `requirePrivileged` in `src/lib/guards.server.ts` and be recorded, mirroring `ap_actions_audit`.
- Persisting test results requires one migration: table + GRANTs + RLS scoped to `effective_owner(auth.uid())`.
