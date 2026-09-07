# Combined plan: alerts + branding + six feature refinements

## Part A — carried over from the previous plan

### A1. Fleet alerts stop nagging once read

The critical-alert popup on Fleet only remembers dismissals for the current page session, so it re-pops on every return.

- Persist read alert keys (`scanId:insightId`) in browser storage so a read alert never pops again on that device.
- Dismissing a popup marks it read; opening the page marks nothing automatically.
- In the AI insights list, read alerts render as dimmed "shadow text" (no glow); unread keep full colour plus a small unread dot.
- A "Mark all read" control clears remaining unread state.

### A2. "Vibes by Nish" signature

- Homepage footer area shows `Vibes by Nish`, with a looping gradient shimmer + soft glow pulse on **Nish**, respecting reduced-motion.

### A3. Permanent portal watermark

- Generated captive-portal pages get a fixed bottom-right `Vibes by Nish` watermark.
- Liquid-glass style: translucent blurred pill, faint border, low-opacity text, no animation.
- Baked into the portal template (login, status, logout, error, alogin) and its stylesheet, so it ships with every deployed bundle and is not editable from the dashboard.

## Part B — six feature refinements

## 1. Agentless outbound tunnel option

For routers behind CGNAT/no public IP, add a "Tunnel" connection mode alongside direct host:port.

- Routers page gets a connection-mode choice: **Direct (public IP/DDNS)** or **Tunnel (WireGuard, no port forwarding)**.
- The app generates a ready-to-paste RouterOS WireGuard script: interface, keys, peer pointing at the hub endpoint, and an allowed-IP for the management subnet.
- Each router gets a stable tunnel IP; REST calls then target that tunnel address instead of the public host.
- Quick Setup gains a branch: if the reachability check says private/CGNAT, it offers the tunnel script instead of the firewall/port-forward path.
- Status chip on the router row: Direct / Tunnel / Tunnel down.

Note: this needs a reachable WireGuard hub endpoint (a VPS or the user's own server). The app produces both sides' config and stores the router side; the hub host/port is entered once in settings. Without a hub, the tunnel option stays disabled with an explanatory note.

## 2. Offline queue + retry

Commands issued while a router is unreachable are no longer lost.

- Any write action (terminal command, portal deploy, shield toggle, voucher push) that fails with a network/timeout error is queued instead of just erroring.
- A background retry runs with backoff when the router next reports online; each item shows Pending / Retrying / Sent / Failed.
- New "Pending actions" panel on the Routers page (and a badge count in the header) to view, retry now, or cancel queued items.
- Idempotency: each queued item stores a key so retries never double-apply.

## 3. Config drift detection

- Periodic (and on-demand) capture of a config fingerprint per router: firewall rules, hotspot profiles, IP services, users, DHCP, NAT.
- The first successful capture becomes the baseline; later captures diff against it.
- Routers page shows a "Config drift" badge with an added/removed/changed line-level diff view.
- Actions: **Accept as new baseline** or **Revert this change** (generates the RouterOS commands to undo, shown for review before applying).
- Drift events feed the Fleet events list so AI Scan can explain them.

## 4. Multi-router voucher pooling

- Voucher plans can target a **pool** of routers/sites rather than one router.
- Generating a batch writes the same codes to every router in the pool, so a guest can log in at any site.
- Central code registry stays the source of truth: first use anywhere marks the code used and revokes it on the other routers.
- Vouchers page: pool selector, per-router sync status (In sync / Missing / Failed), and a "Re-sync pool" action.
- Revenue attributes a sale to the router where the code was first redeemed.

## 5. Native-feeling mobile PWA

- Installable app: web manifest, app icons, theme colour, splash colours, standalone display, iOS touch icon.
- Home-screen launch opens straight into the app shell with safe-area padding so the glass header and bottom content clear the notch and home indicator.
- Mobile navigation polish: larger tap targets, sticky bottom action bars on the busiest pages.
- Install hint card in Profile ("Add MikroTik Magic to your home screen") that hides once installed.

Offline caching and push notifications are not included here — say the word if you want offline mode too.

## 6. Onboarding health score

- New Overview card scoring account readiness 0-100 across checks: router added, connection test passing, TLS enabled, API user hardened, portal branded, plans configured, backup taken, shield enabled, site assigned.
- Each check is a row with pass/fail and a one-tap deep link to the page that fixes it.
- Score ring styled in the app's glass/aurora theme; recomputed on load and after each fix.
- Dismissible once at 100, reappearing if a check regresses.

## Technical notes

- Alerts: `src/routes/_authenticated/app.fleet.tsx` swaps the in-memory seen-set for a `localStorage`-backed read-key store (hydrated in `useEffect` for SSR safety); per-insight `isRead` drives list styling.
- Signature: markup in `src/routes/index.tsx`; keyframes in `src/styles.css` with a `prefers-reduced-motion` guard.
- Watermark: `.wm` block in `STYLE_CSS` plus a watermark element in every page constant in `src/lib/portal-template.server.ts`.
- Tunnel: extend `router_connections` with `conn_mode`, `tunnel_ip`, `wg_pubkey`, plus a per-owner `tunnel_hub` settings row; `router-conn.server.ts` resolves the effective host based on mode. Script generation lives next to the existing Quick Setup generator.
- Queue: new `command_queue` table (owner_id, router_id, kind, payload, status, attempts, idempotency_key) + a retry server function called from the client on router-online transitions and from a maintenance hook.
- Drift: `router_config_snapshots` (fingerprint hash + JSON payload); capture via existing `routerAPI` REST reads; diff computed server-side.
- Pooling: `voucher_pools` / `voucher_pool_routers`, and `voucher_codes` gains `pool_id` + per-router sync rows; revocation reuses the existing MikroTik hotspot user removal path.
- PWA: manifest-only installability (`public/manifest.webmanifest` + icons + head tags in `__root.tsx`). No service worker.
- Health score: pure read-only server function aggregating existing tables; no new schema.

Suggested build order: A1-A3 (small, ship first) → 6 → 5 → 2 → 3 → 4 → 1 (cheapest and safest first, tunnel last since it needs a hub host).
