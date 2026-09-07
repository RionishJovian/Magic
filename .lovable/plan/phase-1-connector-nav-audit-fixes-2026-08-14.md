# Phase 1 — Connector, Cloud Remote (DDNS), and nav audit fixes

Status: **implemented** on branch `cursor/phase-1-connector-nav-fixes` (2026-08-15).

Source: 2026-08-14 live-app QA audit.

## P0 — Local Connector / DDNS honesty

- [x] Skip `assertSafeEndpoint` when `connectorId` is set; require private LAN IPv4 instead.
- [x] Routers form: label **LAN IP** for Local Connector (not “Public host / DDNS”).
- [x] `testRouter` must use `loadRouterConn` / connector path (no cloud TCP to RFC1918).
- [x] `probeWanExposure` / CloudRemoteCheck must not dial LAN IPs from the cloud.
- [x] Pass TLS fingerprint through `connectorFetch` for MikroTik self-signed certs.

## P1 — races / pairing / nav

- [x] Atomic job claim; atomic pairing; don’t swallow agent result POSTs.
- [x] Minting a pairing code should invalidate the old token.
- [x] Localhost install origin; mode switch navigates; enforce `canAccessPath`; tenant “view as” real or removed; site filter consistent.

## Related

- Phase 1.5 (VPS hub): `.lovable/plan/phase-1.5-alibaba-wireguard-hub-2026-08-14.md`
