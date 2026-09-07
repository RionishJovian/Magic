# Site topology — Phase C: Managed downstream (deferred)

**Status:** **backlog / not started** — keep for a later project  
**Parent:** Phase A (diagram, PR #173) + Phase B (guest pool health)  
**Audience today:** platform administrators only; Phase C may widen rollout when polished

## Problem

Phase A labels ports manually (eth3 → CRS326, eth4 → TP-Link AP). Phase B validates the gateway pool. Neither discovers what is **actually plugged into** a CRS326 or outdoor AP on port 3.

Typical Starlink café:

```
WAN → RB5009 → eth3 → CRS326 → [APs on CRS ports]
                 eth4 → TP-Link AP (direct)
                 eth5 → Ruijie outdoor
```

Operators want Dude-like truth without WinBox — especially when a switch hides downstream link state.

## Goal (when we pick this up)

1. **Managed devices table** — `managed_devices` or extend `site_topology_config` with downstream rows: parent port, MAC, vendor hint, role (switch / AP / other), optional REST target if integrated later
2. **CRS as first-class node** — when eth3 is labeled “CRS326”, show CRS ports as a subtree (not flat labels)
3. **Neighbor hints** — best-effort: RouterOS `/ip/neighbor`, bridge host table, or LLDP where available; never invent devices
4. **Link coloring** — propagate `running` / carrier down through switch → AP edges when data exists
5. **Rollout** — start platform-admin; consider site-owner read-only view after v2 is stable

## Explicit non-goals (Phase C)

- Full multi-vendor AP management (UniFi / Omada APIs) — separate access-point plan
- Replacing Hotspot Apply or voucher sync
- Cloud dialing LAN IPs (stay Hub / Connector / tunnel only)

## Dependencies / risks

- CRS326 is L2 — RB5009 REST may not see CRS port states without SNMP, SwOS API, or a Magic agent on the switch
- Honesty rule: **label-only** downstream stays until we have a real poll path
- May need `managed_devices` migration + RLS scoped like `site_topology_config`

## Suggested implementation order (future)

1. Schema + UI for saved downstream tree (manual + import from labels)
2. Bridge host / neighbor poll from RB5009 for direct-attached APs only
3. CRS SwOS or SNMP spike — go/no-go before promising auto-discovery
4. Owner-visible read-only topology (feature flag)

## References

- Phase A migration: `supabase/migrations/20260822210000_site_topology_platform_admin.sql`
- Phase B plan: `.lovable/plan/site-topology-phase-b-smarter-pooling-2026-08-22.md`
- AP multi-brand backlog: `.lovable/plan/access-point-management-multi-brand-2026-08-08.md`
