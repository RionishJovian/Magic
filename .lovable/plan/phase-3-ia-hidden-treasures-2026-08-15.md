# Phase 3 — Surface hidden treasures (IA promotions)

**Status:** merged to `main` via GitHub PR #11 (2026-08-15)  
**Date:** 2026-08-15

## Goal

Promote already-built operator value that was buried under mode walls, expanders, and mislabeled homes. Prefer placement over new features.

## Scope (shipped)

1. **Stage Home** — when any gateway is online, lead with a live ops strip; keep the setup checklist for incomplete / offline accounts (hides when complete + gateway live).
2. **Home cards** — add Incidents, Connectors, Sandbox, Payments; refresh Vouchers / Portal copy.
3. **Nav** — move `/app/orders` from Advanced → Business as **Payments** (still privilegedOnly).
4. **Routers row** — Login Bypass Shield + Live telemetry accordion visible without opening Details; Cloud / Tunnel / Multi-WAN stay behind Details.
5. **Plans** — extract `PlansPanel` onto Vouchers; Portal keeps brand + deploy only, with a link to plans.
6. **Remote access chooser** — one equal-choice card set (Public DDNS · Local Connector · Cloud Remote · Sandbox) on Home empty state and Quick setup.

## Out of scope (follow-ups)

- Merging CloudPanel + TunnelPanel into one Remote access page
- Multi-WAN on Sites
- Unifying Home AI vs Fleet AI naming
- PWA install banner on Home
- Syslog empty-state wizard
