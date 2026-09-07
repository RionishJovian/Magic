# Hotspot foundation in Hotspot Wi-Fi (SSID) panel — plan

**Status:** shipped on `main` — checklist, foundation (pool + profile + server), built-in Wi‑Fi + LAN port modes, visual review dialog.  
**Date:** 2026-08-19  
**Parent:** `.lovable/plan/hotspot-ssid-wifiwave2-audit-and-plan-2026-08-19.md` (SSID create shipped on `main`)

## Problem

Today **Hotspot Wi-Fi (SSID)** can create guest Wi-Fi, but optional **/ip/hotspot** only works when the router already has:

| Requirement     | RouterOS object                                  | Today                                               |
| --------------- | ------------------------------------------------ | --------------------------------------------------- |
| IP pool         | `/ip pool` name **`hotspot-pool`**               | Only in **Master hotspot script** (Scripts library) |
| Hotspot profile | `/ip/hotspot/profile` name **`hsprof-vouchers`** | Same script                                         |
| Hotspot server  | `/ip/hotspot` on the LAN bridge                  | Same script, or manual WinBox                       |

Operators who only ran **Quick Setup** (DDNS/TLS) or who have a bare ax² see a **disabled** “Also create /ip/hotspot” checkbox and must hunt the long Master script. That breaks the “one place on Routers” goal.

## Goal

Under the same **Hotspot Wi-Fi (SSID)** accordion on each router row, let the operator complete the **minimum captive-portal foundation** without opening Scripts:

1. **IP pool** (`hotspot-pool`) — if missing
2. **Hotspot server profile** (`hsprof-vouchers`) — if missing
3. **Hotspot server** (`/ip/hotspot` on chosen bridge) — if missing
4. **Guest SSID** (wifiwave2 virtual AP) — already built

All in one checklist UI, one confirm, ordered apply.

## Non-goals (stay out of this panel)

Do **not** fold these into v1 — they belong elsewhere or stay in Master script:

- WAN / NAT / firewall baseline
- Full voucher **user profiles** (`voucher-1h`, `mm-1d`, data-quota plans) → **Plans / Vouchers** + portal deploy
- Bridge creation, LAN IP, DHCP server, DNS — **probe + warn** if missing; optional small “LAN prerequisites” helper later
- Replacing or renaming existing operator pools/profiles that use **different names** (read-only detect + link to Scripts)
- UniFi / CAPsMAN SSID management (unchanged Access Point tab)

## UX — single tree on Routers

Keep one accordion: **Hotspot Wi-Fi (SSID)**. Inside it, a **Setup checklist** (always visible when probe succeeds):

```
Hotspot Wi-Fi (SSID)
├── Status strip
│   ├── IP pool (hotspot-pool)        ✓ / Missing
│   ├── Hotspot profile (hsprof-vouchers) ✓ / Missing
│   ├── Hotspot server (on bridge)    ✓ / Missing / Already on bridge-lan
│   └── Guest SSID (Magic)            ✓ count / None
├── [Section A] Hotspot foundation     ← NEW (only when pool or profile missing)
├── [Section B] Guest Wi-Fi (SSID)     ← existing form
└── Primary action
    └── “Set up hotspot” (runs missing steps in order) OR split buttons (see below)
```

### Section A — Hotspot foundation (new)

Shown when `hasHotspotPool === false` OR `hasHotspotProfile === false`.

**Read-only defaults** (derived from probe, editable only if we must):

| Field           | Source                      | Default                                                     |
| --------------- | --------------------------- | ----------------------------------------------------------- |
| Bridge          | existing probe              | `suggestedBridge` (e.g. `bridge-lan`)                       |
| Gateway IP      | `GET /ip/address` on bridge | e.g. `192.168.88.1`                                         |
| Pool name       | fixed product convention    | `hotspot-pool`                                              |
| Pool range      | subnet of gateway /24       | e.g. `192.168.88.10-192.168.88.254`                         |
| Profile name    | fixed                       | `hsprof-vouchers`                                           |
| Hotspot address | same as gateway IP          | `192.168.88.1`                                              |
| DNS name        | optional text               | `login.hotspot.lan` (placeholder; portal deploy can change) |
| HTML directory  | fixed for portal compat     | `hotspot`                                                   |

Copy for operators (plain language):

> **Step 1 — Hotspot foundation**  
> Creates the IP pool and captive-portal profile MikroTik Magic expects. Does not change firewall, WAN, or voucher plans.

**Prerequisites gate** (block apply with clear message, do not silently fail):

- Chosen bridge exists
- Bridge has an IP address (e.g. `192.168.88.1/24`)
- Bridge is not on WAN list
- If no DHCP on bridge: **warn** “Guests may not get IPs until DHCP is configured” (do not auto-add DHCP in v1 unless we add a explicit sub-step)

### Section B — Guest SSID (existing)

Unchanged behaviour: open SSID, bands, CAP disable, bridge/datapath.

### Primary actions

**One button:** **Set up hotspot** — runs, in order, only **missing** steps: foundation → server → SSID (or bridge+port for external AP mode).

**Auto-detect form** with manual switch:

| Mode               | When                                      | Fields                              |
| ------------------ | ----------------------------------------- | ----------------------------------- |
| **Built-in Wi‑Fi** | Router has `wifi1`/`wifi2` (wifiwave2)    | SSID name, bands (2.4 / 5)          |
| **AP on LAN port** | No local Wi‑Fi, or user switches manually | SSID name, ether port (e.g. ether2) |

Small toggle: **Built-in Wi‑Fi** | **AP on LAN port** — default from probe; user can override.

### Review popup before apply (required)

After **Set up hotspot**, open a **review dialog** (not a wizard). User reads, edits choices by closing dialog and changing fields, then confirms or cancels.

**Dialog title:** `Review hotspot setup`

**Body — human summary (what they entered):**

- Router name
- Mode: Built-in Wi‑Fi or AP on LAN port
- Guest SSID name
- Port (LAN mode only)
- Bridge
- Bands (built-in only)

**Body — what will be created (only missing items):**

```
Will create on this router:
  ✓ IP pool hotspot-pool (192.168.88.10–254)     — or "Already exists, skip"
  ✓ Hotspot profile hsprof-vouchers
  ✓ Hotspot server on bridge-lan
  ✓ Guest Wi‑Fi "CafeGuest" on 2.4 + 5 GHz       — built-in mode
  — or —
  ✓ Add ether2 to bridge-lan + hotspot server     — LAN port mode
  ℹ Set SSID "CafeGuest" on your access point     — LAN port mode note
```

**Warnings block** (if any): CAP disable, no DHCP on bridge, etc.

**Buttons:**

- **Cancel** — close, no router writes
- **Change** — same as Cancel (focus back to form)
- **Apply to router** — run plan; primary button

Server builds the list from `planHotspotSetup()` so the popup matches exactly what REST will run. No apply until user clicks **Apply to router**.

### When everything already exists

Checklist all green; Section A hidden; Section B remains for adding another guest SSID or band.

## Technical design

### Extend probe (`wifi-hotspot.server.ts`)

Add to `WifiHotspotProbe`:

```typescript
foundation: {
  pool: { exists: boolean; name: string | null; ranges: string | null };
  profile: { exists: boolean; name: string | null; hotspotAddress: string | null };
  server: { exists: boolean; interface: string | null };
  bridge: {
    name: string;
    gatewayIp: string | null;      // e.g. 192.168.88.1
    prefix: number | null;         // e.g. 24
    hasDhcpServer: boolean;
  } | null;
  readyForFoundation: boolean;
  readyForServer: boolean;
  blockReason: string | null;
}
```

Additional GETs (read-only): `/ip/address`, `/ip/dhcp-server`, existing pools/profiles/servers.

### New write module (same file or `wifi-hotspot-foundation.server.ts`)

Constants:

```typescript
export const MM_HOTSPOT_POOL_NAME = "hotspot-pool";
export const MM_HOTSPOT_PROFILE_NAME = "hsprof-vouchers";
export const MM_HOTSPOT_FOUNDATION_COMMENT = "mm-hotspot-foundation";
```

**Create pool** (only if name absent):

```text
PUT /ip/pool
  name=hotspot-pool
  ranges=<derived>
  comment=mm-hotspot-foundation
```

**Create profile** (only if name absent):

```text
PUT /ip/hotspot/profile
  name=hsprof-vouchers
  hotspot-address=<gatewayIp>
  dns-name=<dnsName>
  html-directory=hotspot
  login-by=http-chap,http-pap
  comment=mm-hotspot-foundation
```

Aligns with Master script §9 and `portal-template.server.ts` (expects `hsprof-vouchers` for html-directory hint).

**Create server** (existing logic, enable when foundation exists or was just created):

```text
PUT /ip/hotspot
  name=mm-hs-<slug> or hs-lan if first
  interface=<bridge>
  address-pool=hotspot-pool
  profile=hsprof-vouchers
  comment=mm-hotspot-server
```

### Orchestration

New function: `planHotspotSetup(probe, input)` returning ordered steps:

1. Foundation pool (if missing)
2. Foundation profile (if missing)
3. Hotspot server (if missing on bridge)
4. SSID steps (existing `planHotspotSsidCreate`)

New server fn: `setupHotspotWifi` or extend `createWifiHotspotSsid` with `includeFoundation: boolean`.

Apply remains **idempotent**: skip any step whose probe says already satisfied.

### Safety / isolation (no impact on other ops)

| Rule                                                                               | Rationale                      |
| ---------------------------------------------------------------------------------- | ------------------------------ |
| Never PATCH existing `hotspot-pool` or `hsprof-vouchers`                           | Avoid breaking live hotspot    |
| If pool exists under **another name**, show “Found pool X — use Scripts or rename” | No guessing                    |
| If profile exists under another name, same                                         | Portal deploy may target by id |
| Tag only **new** rows with `mm-hotspot-foundation` / existing SSID tags            | Removable later                |
| No firewall, NAT, `/ip/service`, Quick Config tags                                 | Same isolation as SSID feature |
| `requireNotExpired` on all writes                                                  | Match Quick Config             |
| WAN bridge refused                                                                 | Already implemented            |

### Tests

Extend `tests/wifi-hotspot.test.ts`:

- Plan includes pool + profile when missing
- Skips pool when `hotspot-pool` exists
- Refuses foundation when bridge has no IP
- Full orchestration order: pool → profile → server → wifi
- Does not overwrite existing profile

### i18n

Translate **descriptions**; keep button labels **Create foundation**, **Set up hotspot**, **hotspot-pool**, **hsprof-vouchers** in English per project rules.

## Acceptance criteria

1. Operator on ax² with only Quick Setup done opens **Hotspot Wi-Fi (SSID)** and sees checklist with pool/profile **Missing**.
2. One action creates pool + profile + server + guest SSID without opening Scripts.
3. Router with Master script already applied shows checklist green; foundation section hidden; SSID create still works.
4. No changes to Access Point, Quick Setup, Shield, Portal deploy paths except they benefit from foundation existing.
5. Automated tests cover plan order and skip-if-exists; manual ax² verify WinBox **IP → Hotspot** and guest portal intercept.

## Build order (when approved)

1. **Probe extension** — foundation block + prerequisite messages (read-only).
2. **Foundation writer** — pool + profile only; UI Section A + “Create foundation”.
3. **Orchestrator** — merge foundation + server + SSID; one **Set up hotspot** button.
4. **Docs** — Manual page one paragraph; demote “run Master script first” to “optional full gateway template”.

## Open questions for Rionish

1. ~~**One button vs two:**~~ **Locked:** one **Set up hotspot** button + **review popup** before apply.
2. ~~**Auto-detect:**~~ **Locked:** auto-detect Built-in Wi‑Fi vs AP on LAN port; manual switch if wrong.
3. **Fixed names vs picker:** Keep `hotspot-pool` / `hsprof-vouchers` only (recommended for portal compat), or allow picking an existing pool/profile?
4. **DHCP:** v1 warn-only, or add optional “Create DHCP on bridge” sub-step?
5. **DNS name:** Default `login.hotspot.lan` or pull from router Cloud DDNS when present?

---

**Deliverable of this document:** product/tech plan only. No Lovable republish, no SQL, no RouterOS writes until build slice is approved.
