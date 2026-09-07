# Tunnel resilience, quotas and role limits

Seven changes across the tunnel system, roles, branding and cost visibility.

## 1. WireGuard key rotation without downtime

- New "Rotate keys" action in the Tunnel panel, admin/owner only.
- Two-phase flow so the link never drops:
  1. Generate a new keypair and show the hub peer snippet + RouterOS commands that ADD the new key alongside the old one. Router and hub keep both peers.
  2. After a reachability check passes on the new key, a "Confirm rotation" button stores the new key and prints the cleanup snippet that removes the old peer.
- If the check fails, "Abort rotation" restores the previous key and prints the rollback snippet. Nothing is committed until the check passes.
- Confirmation dialog before both phases, stating exactly what changes on the router.
- Rotation attempts are recorded so the Audit log shows who rotated what and when.

## 2. Automatic failover between direct and tunnel mode

- A router can now hold both a direct endpoint and a tunnel endpoint.
- New preference per router: Direct only, Tunnel only, or Auto (default when a tunnel exists).
- In Auto, every server-side call picks the path via a short-lived cached reachability result: try the preferred path, fall back to the other on connection failure, and remember the winning path for a few minutes.
- Fleet health, AI scans, telemetry, terminal and the scheduled scan all go through the same path resolver, so they never disagree about which route is live.
- Auth failures never trigger failover (bad credentials are not a path problem).

## 3. Reachability status indicator in the Tunnel panel

- A status chip at the top of the panel: Tunnel active / Direct active / Unreachable / Never checked.
- Shows last check time (Yangon time, relative) and the active path.
- Explicit line: "Scans and alerts will use the tunnel" or "...will use the direct endpoint".
- Manual "Check now" stays on-demand; nothing polls in the background.

## 4. Brand signature light/dark polish

- The signature gradient gets separate light and dark palettes so it stays readable on light backgrounds.
- Fixed inline spacing rules so it aligns to the brand name baseline everywhere it appears.
- Portal watermark spacing matched to the in-app signature (same offsets, same glass treatment); it stays non-removable.

## 5. Credit usage dashboard (owner/admin only)

Lovable's billing balance is not readable from inside the app, so this dashboard measures what the app itself spends: every AI call the app makes.

- New usage log capturing each AI request: which user, which feature (Fleet scan, syslog translation, insights), token counts, model and timestamp.
- New owner-only "Usage" section showing: total AI calls this month, breakdown by user, breakdown by feature, and a 30-day trend.
- Cost-saving controls in the same view:
  - Per-role monthly AI scan quotas (already 5 for clients) made visible and editable.
  - Caching of scan results so re-running within a short window returns the last result instead of a new AI call.
  - Reminder banner listing anything currently scheduled to run automatically.

## 6. Device add limits with approval

- Each account may add 1 router, 1 UniFi controller and 1 site by default.
- Attempting to add beyond the limit creates an approval request instead of the record, and the user sees "Waiting for owner approval".
- Owners see pending requests in the Users/Admin area with Approve or Deny; approving raises that account's allowance by one for that device type.
- Owners and admins are exempt from the limits.

## 7. Expired accounts: narrower read-only scope

- Expired accounts keep access to Overview, Profile, Portal and Live users (read-only).
- Routers, Sites, UniFi/APs, Fleet, Terminal, Vouchers, Revenue and Backups are hidden from navigation and blocked server-side for expired accounts.
- Blocked pages show a short "Your account expired — contact the owner to reactivate" card instead of an error.

## Technical notes

- Tunnel rotation and failover live in `src/lib/tunnel.functions.ts` / `tunnel.server.ts`; the path resolver goes in `src/lib/router-conn.server.ts` so every caller inherits it.
- DB migrations: rotation state + previous key on `router_connections`, a `connection_preference` column, an `ai_usage_events` table, a `device_allowances` / `device_requests` pair, all with GRANTs and owner-scoped RLS.
- Role gating is enforced both in `src/routes/_authenticated/app.tsx` navigation and in the server functions, never in the UI alone.
