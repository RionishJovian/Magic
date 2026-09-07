# Site topology — Phase B: Smarter pooling

**Status:** implemented on branch `cursor/site-topology-phase-b-pooling-c6f5` (2026-08-22)  
**Parent:** Phase A (merged PR #173) — `/app/topology` platform-admin WAN → router → ports diagram  
**Gate:** platform administrators only (unchanged)

## Problem

Café sites (RB5009 + CRS326 + external APs) rely on **one shared guest IP pool** (`hotspot-pool`) for both:

- `/ip/hotspot` address-pool (captive portal auth)
- `/ip/dhcp-server` on the LAN bridge (APs and wired guests)

Operators often split pools by mistake (e.g. `lan-pool` for DHCP, `hotspot-pool` for hotspot). Guests get an IP but fail hotspot login. Phase A showed ports but not pool truth.

## Goal

On **Site topology**, after a live probe:

1. Show **guest pool usage** (name, range, used/total, bar)
2. List **hotspot + DHCP bindings** (server → interface → pool)
3. **Health verdict**: shared OK, split pools, missing pool, no DHCP on bridge, high usage (≥90%)

No router writes in this phase — read-only honesty, same transport as Phase A (Hub / Connector REST).

## Shipped surfaces

| Area                                   | Change                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `src/lib/topology/pool-health.ts`      | Pure `evaluateGuestPoolHealth()`                                         |
| `src/lib/topology/pool-probe.ts`       | REST reads `/ip/pool`, `/ip/pool/used`, `/ip/hotspot`, `/ip/dhcp-server` |
| `src/lib/topology/probe.server.ts`     | Merges pool snapshot into `RouterLanProbe`                               |
| `src/components/TopologyPoolPanel.tsx` | Pool card on topology page                                               |
| `tests/topology-pool-health.test.ts`   | Unit tests for health rules                                              |

## Non-goals (Phase B)

- Auto-fix split pools on the router
- Voucher multi-router pooling (separate backlog: `combined-plan-alerts-branding-six-feature-refinements`)
- CRS / downstream AP discovery → **Phase C**

## Operator steps after merge

1. Republish Lovable (no new SQL — Phase A migration already covers `site_topology_config`)
2. Open **Operations → Site topology** as a platform admin
3. Confirm pool card shows `shared_ok` on live RB5009 sites

## Manual gate

One real RB5009 handshake after deploy — same as Phase A / Hub Test. Mocked unit tests only in CI.
