# Phase 2 — Quick Setup script: DDNS / TLS:443 / REST honesty

Status: **merged** to `main` via #6 (2026-08-15).

Source: 2026-08-15 audit of `buildScript` in Quick Setup (`app.quick-setup.tsx`).

## Problem

The guided `magicsetup.rsc` claimed to enable DDNS, TLS on 443, and REST, but several gaps made Cloud Remote fail after a “successful” import:

1. DDNS wait was only 4s — `dns-name` often empty when printed.
2. Certificate was signed without waiting for `private-key=yes`; CN was `mikrotik-magic`, not the DDNS host.
3. Script enabled `api-ssl` (binary API) while REST is served by `www-ssl`; Manual says disable `api-ssl`.
4. No WAN firewall accept for TCP 443 — common cause of `port-closed` after setup.
5. Step 4 “Auto-detect from LAN” dialed a private LAN IP via a cloud server fn (always refused after Phase 1).

## P0 — Script correctness

- [x] Wait/retry until Cloud DDNS has a non-empty `dns-name` (fail clearly if not).
- [x] Create/sign `mikrotik-magic` with `common-name` = DDNS name; wait for signing; refuse if incomplete.
- [x] Enable `www-ssl` on port 443 with that cert; disable `www`, `api`, `api-ssl`, telnet, ftp.
- [x] Idempotent firewall input accept for TCP 443 tagged `mikrotik-magic-rest`.
- [x] Soft rollback removes firewall tag + cert + API user + disables www-ssl (server + .rsc).

## P1 — Wizard honesty

- [x] Replace “Auto-detect from LAN” with “Verify DDNS hostname” against a public host only.
- [x] Copy explains: paste hostname from the script terminal; cloud cannot dial LAN IPs.
- [x] Soft rollback host = DDNS hostname only (no LAN fallback).

## Related

- Phase 1 (connector / no cloud→LAN dial): `.lovable/plan/phase-1-connector-nav-audit-fixes-2026-08-14.md`
- Phase 1.5 (Alibaba hub): `.lovable/plan/phase-1.5-alibaba-wireguard-hub-2026-08-14.md`

## Out of scope

- Locking `www-ssl address=` to Magic egress (requires known egress IPs).
- Least-privilege `magic-api` user group (Manual advanced path).
