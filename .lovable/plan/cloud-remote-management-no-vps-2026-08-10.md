# Cloud Remote Management (no VPS)

Goal: make "Cloud Remote" a first-class way to add and manage a router from anywhere, using MikroTik's own free Cloud DDNS hostname (`xxxx.sn.mynetname.net`) plus TLS REST — no external service required.

Important reality check for your setup: this works on your **ISP fiber** line if the ISP gives you a public IP. **Starlink is CGNAT by default** (no public IP), so a direct cloud connection cannot reach it. The plan therefore includes an automatic WAN check that tells you which line supports Cloud Remote and routes the Starlink site to the Local Connector instead — no guessing.

## What gets built

1. **Cloud Remote as an explicit connection choice**
   - On the Routers page, replace the vague "Cloud / Direct (public address or tunnel)" dropdown entry with three clearly labelled cards: Cloud Remote (DDNS + TLS), Local Connector, Outbound Tunnel (advanced).
   - Choosing Cloud Remote reveals a hostname field pre-filled with the DDNS pattern, plus port, API user, and password.

2. **WAN / CGNAT detection step**
   - A "Check this line" action runs on the router: reads `/ip cloud` (DDNS name and public address) and compares it against the WAN interface address.
   - Result badges: **Public IP — Cloud Remote works**, **CGNAT detected — use Local Connector**, or **Port 443 unreachable — fix firewall/port forward**.
   - The existing reachability probe is reused for the final port test.

3. **Cloud Remote wizard entry on the Routers page**
   - Same steps already in Quick Setup, surfaced inline where you add a router: run setup script → auto-detect DDNS hostname → test connection → save the router.
   - The script continues to enable IP Cloud DDNS, a TLS certificate on 443, the REST service, a restricted API user, and a firewall rule that only permits 443 from the internet.

4. **Live status for cloud routers**
   - Each cloud router row shows Online / Offline / Error with last successful check time, driven by a lightweight periodic REST ping (same polling used by live telemetry).
   - On failure, the existing AI diagnosis is offered ("DNS not resolving", "cert mismatch", "credentials rejected", "likely CGNAT").

5. **Manual and translations**
   - User manual gets a "Option A — Cloud Remote (DDNS)" section matching the existing Local Connector section, with the CGNAT caveat spelled out.
   - New labels/help text added to Chinese and Burmese; action buttons and command boxes stay English.

## Not included

No VPS, WireGuard hub, or third-party relay is added. If the Starlink site must be managed remotely, the options remain the Local Connector (already working) or a relay you own — the existing Tunnel mode stays untouched for that.

## Technical notes

- No schema change: `router_connections.connection_mode = 'direct'` already covers this path; only UI, a detection server function, and status polling are added.
- New server function `probeWanExposure` (extends existing `probeCloudDns` / `checkPublicReachability`) returns `{ ddnsName, cloudPublicAddress, wanAddress, isCgnat, port443Reachable }`.
- Router-side calls stay inside `createServerFn` with `requireSupabaseAuth` and ownership checks; credentials remain AES-256-GCM encrypted.
- No changes to Local Connector, Tunnel, or the existing Cloud/VPS scaffolding.
