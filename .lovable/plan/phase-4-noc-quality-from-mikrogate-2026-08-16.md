# Phase 4 — NOC quality (MikroGate adoption)

**Status:** merged to `main` via GitHub PR #33 (2026-08-16). Closed.  
**Date:** 2026-08-16  
**Reference:** live demo [MikroGate AI](https://netwiz-ai.lovable.app) vs MikroTik Magic ops surfaces.  
**Constraint:** adopt **functions** only — do **not** restyle to MikroGate theme/UI. Real RouterOS probes / `/execute` Apply fix — no mock slideshow cards.

### Operator follow-up (Cloud)

Apply `supabase/migrations/20260816190000_phase4_incident_kinds.sql` in Lovable Cloud SQL Editor, then republish — required for critical-insight → Incidents promotion.

## Goal

Raise Fleet / telemetry / AI / incidents / remediation quality so operators get MikroGate-class **usefulness** inside Magic’s existing features (no new product tabs named Traffic / Security / Config).

## Source of truth for roles

| Division        | Who                                                                                                             | Rule of thumb                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **User useful** | Any signed-in member who can already see the surface (owner, admin, and non-expired ops users per existing nav) | **Read / monitor / soft ack / navigate** — no new RouterOS writes                       |
| **Owner only**  | `owner` or `admin` (`privilegedOnly`), unless noted `ownerOnly`                                                 | **Write / remediate / policy / audit** — RouterOS mutations and account-wide automation |

Business surfaces (Revenue, Vouchers, Payments, Portal, Magic Points, Services) are **out of scope** — MikroGate has nothing to adopt there.

---

## Division A — User useful

Day-to-day ops value. Prefer enriching data already polled (Fleet health, `routerTelemetry`, sessions, syslog) without new write paths.

### A1 — Fleet cards & Home live ops

| Adopt                                        | Existing home                      | Notes                                                                                          |
| -------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Board name + client count on each fleet card | `/app/fleet`                       | `board-name` from `/system/resource`; clients from active hotspot/users already used elsewhere |
| Critical-insight badge + last scan age       | Fleet header + Home `LiveOpsStrip` | Count open critical insights; show “scanned Xm ago”                                            |
| Immediate refresh control                    | Fleet                              | Explicit re-poll of `getFleetHealth` (and optional flag insights)                              |
| Jump-to-router focus                         | Home → Fleet                       | Deep link / query so Home critical chip opens Fleet focused on that router                     |

### A2 — Routers → Live telemetry (read depth)

| Adopt                                    | Existing home    | Notes                                                                                                                      |
| ---------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Persist **board-name** on the router row | `/app/routers`   | Today mostly buried in Test report                                                                                         |
| **Temperature** when RouterOS exposes it | `TelemetryPanel` | `/system/health` (skip gracefully if absent)                                                                               |
| Interface focus + short TX/RX window     | `TelemetryPanel` | Select interface; keep last N poll samples in-panel (no long-term TSDB required in this phase)                             |
| Services status (read-only)              | `TelemetryPanel` | Compact counts: firewall rules + hits/s (best-effort), WireGuard peers connected, active queue trees, syslog entries today |

### A3 — AI insights (view / soft actions)

| Adopt                                | Existing home                  | Notes                                                                                                                       |
| ------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Richer evidence subtitles            | Fleet + Home `AiInsightsPanel` | MikroGate-style `router · interface · metric` evidence                                                                      |
| Relative age on each insight         | Fleet + Home                   | `just now` / `2m` from event/scan time                                                                                      |
| **Acknowledge** (dismiss / baseline) | Fleet + Home                   | Soft local or DB ack — **not** RouterOS apply                                                                               |
| Detector coverage (scan output only) | `runAiScanNow` / flag scan     | Teach model + pre-checks for: SSH brute-force, WAN saturation, DHCP pool %, interface down, VPN rekey fail, AP carrier down |

### A4 — Live users & session signals

| Adopt                               | Existing home    | Notes                                                        |
| ----------------------------------- | ---------------- | ------------------------------------------------------------ |
| Fleet/Home **active client totals** | Fleet + Live ops | Roll up from existing session snapshots                      |
| Optional **top talkers** (read)     | `/app/live`      | Highest down/up for selected router — no new Traffic product |

### A5 — Syslog → visibility

| Adopt                                              | Existing home              | Notes                                                                                      |
| -------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| “Entries today” / critical count on services strip | Telemetry + optional Fleet | Read from ingested syslog for that router/site                                             |
| High-signal events visible as insights (read)      | Fleet / Syslog             | Surface auth-fail / interface-down class events in the insights list when already ingested |

### A6 — Access Points (ops signal)

| Adopt                                       | Existing home                | Notes                                                     |
| ------------------------------------------- | ---------------------------- | --------------------------------------------------------- |
| Wlan / carrier-down as Fleet insight (view) | Fleet + `/app/access-points` | Reuse AP alarms/status already polled; no auto-enable yet |

### A7 — Cloud / WireGuard status (read)

| Adopt                          | Existing home                                 | Notes                                    |
| ------------------------------ | --------------------------------------------- | ---------------------------------------- |
| Live **peers connected** count | Telemetry services strip / CloudPanel summary | Read-only health next to handshake check |

---

## Division B — Owner only (privileged)

Remediation and policy. Gate with existing `privilegedOnly` (owner/admin) unless marked `ownerOnly`. Every RouterOS write must confirm, fail safe, and land in audit history.

### B1 — Apply fix (P0)

| Adopt                                      | Existing home                     | Notes                                                                                   |
| ------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------- |
| One-click **Apply fix** from `fix_command` | Fleet + Incidents → Terminal path | Confirm modal → run via existing REST (`runTerminalCommand` / equivalent) → show result |
| Pre-fill Terminal from insight             | `/app/terminal`                   | Privileged: command + target router from Fleet/Incident                                 |
| Remediation audit trail                    | Audit log / terminal history      | Who / when / router / command / ok                                                      | fail |

### B2 — Incidents + alert kinds

| Adopt                                 | Existing home        | Notes                                                                                 |
| ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| Promote critical insights → Incidents | `/app/incidents`     | Carry suggestion + `fix_command` payload                                              |
| New alert rule kinds                  | Incident alert rules | Brute-force, WAN saturated, DHCP pool high, interface down, peer flapping / VPN rekey |
| Insight → Incident → Apply deep link  | Fleet ↔ Incidents    | Privileged apply only                                                                 |

### B3 — Shield / address-list remediation

| Adopt                                                   | Existing home                          | Notes                                               |
| ------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| **Add source to address-list** from brute-force insight | Login Bypass Shield / firewall helpers | Scoped list name, reversible, audited; never silent |

### B4 — Syslog automation (policy)

| Adopt                                                      | Existing home                       | Notes                           |
| ---------------------------------------------------------- | ----------------------------------- | ------------------------------- |
| Optional auto-pipe high-signal syslog → insights/incidents | Syslog AI + Fleet                   | Owner/admin toggle; default off |
| Quota / rate limits for auto-created incidents             | Credit usage / scan limits patterns | Prevent flood                   |

### B5 — Scripts & deployments hygiene

| Adopt                                             | Existing home       | Notes                                        |
| ------------------------------------------------- | ------------------- | -------------------------------------------- |
| “Save successful fix as Script template”          | `/app/scripts`      | `ownerOnly` preferred                        |
| Applied fixes visible alongside Deployments/Audit | Deployments / Audit | Reuse history models; no parallel shadow log |

### B6 — AP / interface enable (write)

| Adopt                                                         | Existing home            | Notes                                            |
| ------------------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| Apply “enable interface” style fixes for AP/wlan carrier-down | Fleet Apply + AP actions | Privileged only; confirm device + interface name |

---

## Suggested build order

1. **User A1 + A2** — Fleet card completeness + telemetry depth (high visible quality, low risk).
2. **User A3 detectors (read) + Owner B1 Apply fix** — closes the MikroGate “AUTO-FIX” gap safely.
3. **Owner B2 Incidents bridge** — insights become actionable tickets.
4. **User A4–A7** — client totals, top talkers, syslog volume, WG peers, AP signals.
5. **Owner B3–B6** — address-list, syslog auto-pipe, script save, AP enable.

Do not ship Owner Apply (B1) without confirm + audit.

## Out of scope

- MikroGate theme, cyan NOC chrome, bottom Traffic/Security/Config tabs as new IA.
- Long-term metrics DB / NetFlow / full SOC wallboard.
- Merging CloudPanel + TunnelPanel (still a prior follow-up).
- Changing Phase 1.5 hub secrets / handshake work (separate backlog).
- Business monetization features.

## Related

- Phase 3 IA: `.lovable/plan/phase-3-ia-hidden-treasures-2026-08-15.md`
- Phase 1.5 hub: `.lovable/plan/phase-1.5-alibaba-wireguard-hub-2026-08-14.md`
- Comparison session reference: MikroGate AI at `https://netwiz-ai.lovable.app`
