# Hotspot SSID (create new Wi-Fi) — audit and plan

**Status:** implemented on branch `cursor/hotspot-ssid-audit-plan-c6f5` (Routers → Hotspot Wi-Fi panel).  
**Date:** 2026-08-19  
**Hardware context:** RouterOS 7.24 hAP ax² WinBox **WiFi** window (`wifi1` / `wifi2`, mode `ap`, status **no connection to CAPsMAN**, empty SSID). That is the **wifiwave2 / `/interface/wifi`** stack, not legacy `/interface/wireless`.

---

## Verdict

MikroTik Magic **does not** already have a working **“create a new hotspot SSID”** path for this class of router.

There **is** a generic **Create SSID** control on **Access Point**, but it is the wrong stack, the wrong security model, and it never creates `/ip hotspot`. Using it on an ax² would miss the radios you see in WinBox and could write leftover **legacy CAPsMAN** (`/caps-man`) objects instead of a guest SSID on `wifi1`/`wifi2`.

| Surface                                  | Create SSID?            | Binds IP Hotspot?                                 | Talks to `/interface/wifi`? | Fit for captive-portal guest SSID?                                   |
| ---------------------------------------- | ----------------------- | ------------------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `/app/access-points` → SSIDs             | Yes (UI + `saveApSsid`) | No                                                | **No**                      | **No** (WPA password, CAPsMAN / legacy wireless)                     |
| `/app/routers` + Quick Config            | No                      | Tweaks existing hotspot (trial, flood, isolation) | No                          | No                                                                   |
| `/app/quick-setup`                       | No                      | No (DDNS / TLS / REST user only)                  | No                          | No                                                                   |
| Scripts library `master-hotspot-gateway` | No Wi-Fi                | Yes, on `bridge-lan`                              | No                          | Gateway + external AP in **bridge mode**; SSID is not on this router |
| Scripts library `capsman-wifi`           | Paste-only              | No                                                | No (legacy `/caps-man`)     | Staff WPA2, not guest open hotspot                                   |
| Portal / vouchers / sessions             | No                      | Assumes hotspot already exists                    | No                          | Downstream of SSID                                                   |

**Product implication:** treat this as a **new operator feature** (or a dedicated extension of Routers), not a “turn on the existing Access Point form.”

---

## What already exists (code)

### 1. Access Point → Create SSID (closest, still not this feature)

- UI: `src/routes/_authenticated/app.access-points.tsx` (`SsidsTab`: name, password min 8, VLAN → **Create SSID**).
- Server: `saveApSsid` in `src/lib/access-points.functions.ts` (`ssid.create` / `ssid.update`, password optional in schema but UI pushes WPA-style password).
- MikroTik driver: `src/lib/ap/mikrotik.server.ts`
  - **List:** `/caps-man/configuration` if any rows exist; else `/interface/wireless`.
  - **Create (no `ref`):** `POST /caps-man/configuration` only. Comment in code: _“works for CAP-managed fleets.”_
  - **Edit local:** `PATCH /interface/wireless/{id}` only if you already have a `local:` ref from list.
  - **Password:** first `/caps-man/security` row, or first `/interface/wireless/security-profiles` row → **WPA2-PSK**.
- Never reads `/interface/wifi`, `/interface/wifi/configuration`, `/interface/wifi/security`, `/interface/wifi/datapath`, `/interface/wifi/cap`, or `/interface/wifi/capsman`.
- Requires a separate **controller** row with brand `mikrotik` + a linked router. It is not on the Routers card.

On the WinBox screenshot: empty SSID + **no connection to CAPsMAN** means the radios are **wifiwave2 CAPs** waiting for a manager. Legacy `/caps-man/configuration` list is likely empty, `/interface/wireless` is empty on ax² (wifi package, not `wireless`). The Access Point tab would show **No SSIDs reported** even though `wifi1`/`wifi2` exist.

### 2. IP Hotspot in the REST client (users / profiles, not radio)

`src/lib/mikrotik.server.ts` already GETs/writes:

- `/ip/hotspot/active`, `host`, `user`, `user/profile`, `profile`, `cookie`, `ip-binding`

There is **no** `createResource` for `/ip/hotspot` (the **server** instance: name, interface, address-pool, profile). The app assumes the operator already ran a hotspot server (script, WinBox, or prior config).

### 3. Master script vs on-radio SSID

`src/data/scripts.ts` `master-hotspot-gateway`:

- Hotspot on **`bridge-lan`** (ether2–ether5).
- Explicit topology: **external AP in bridge mode** serves Wi-Fi; this RouterBoard is the gateway.
- Does **not** set `wifi1`/`wifi2` SSID.

That matches a CCR / non-wifi gateway. It does **not** match “this hAP ax² should broadcast a guest SSID.”

### 4. Quick Config

`src/lib/quick-config.server.ts` features: client isolation, WAN guard, login flood, fair QoS, auto backup, **trial guest access**, NTP.

Trial guest access **requires an existing hotspot profile**. It does not create radios or SSIDs.

### 5. Capability flags that look like SSID write

`src/lib/devices/vendors.ts` lists `ssidRead` / `ssidWrite` for some AP vendors. Those are inventory labels, not a RouterOS wifiwave2 writer.

---

## WinBox mapping (what “create new Wi-Fi for hotspot” actually is)

Operator intent from the WiFi window:

1. **Stop waiting on CAPsMAN** for this box if it is the AP (local AP, not a remote CAP).
2. Define **Security** (hotspot guest = typically **open**, not WPA).
3. Define **Configuration** (SSID name, country, `mode=ap`).
4. Define **Datapath** (bridge the STA traffic onto the LAN/hotspot bridge).
5. Apply to **wifi1** and/or **wifi2**, **or** add a **virtual** interface (`New`) with `master-interface=wifi1` so a staff SSID can stay on the physical radio.
6. **IP → Hotspot**: server `interface=` must be that **bridge** (or the wifi slave if not bridged). Captive portal HTML stays in `html-directory`.

Do **not** set a WPA2 password on the guest SSID if the product is voucher / trial captive portal. WPA is for a **private/staff** SSID; mixing it into “Create hotspot SSID” would block the portal intercept.

---

## Goals for a later implementation (not this PR)

Operator on **Routers** (primary) can:

1. See existing wifiwave2 interfaces (`wifi1`, `wifi2`, virtuals): name, SSID, disabled, CAP vs local, master-interface.
2. **Create hotspot SSID** with:
   - SSID string (1–32)
   - Band: 2.4, 5, or both (map to wifi1/wifi2 by current band / `master-interface`)
   - Placement: **virtual AP** (default, safer) vs **overwrite physical** (destructive, confirm)
   - Datapath bridge: pick existing bridge (prefer the one already used by `/ip/hotspot`)
   - Security: **Open (hotspot)** default; optional staff WPA2 as a **separate** SSID type, not the default
3. If no `/ip/hotspot` server exists: **optional** “also create hotspot server on this bridge” using existing profile helpers (`hsprof-vouchers` / portal deploy profile), not a second portal stack.
4. Tag every Magic-owned wifi object with a stable comment (e.g. `mm-hotspot-ssid`) so it can be listed and removed without touching unmanaged radios.
5. Dry-run / preview of REST calls before Apply. No silent CAPsMAN writes.

### Non-goals (v1)

- UniFi / Ruijie / generic AP controllers (already have their own SSID form).
- New wifiwave2 CAPsMAN manager for a fleet of CAPs (`/interface/wifi/capsman`) — different product; Access Point remains the fleet surface **after** that driver is rewritten.
- Country/channel/TX-power wizard (Radios tab later).
- Changing portal HTML or voucher plans.
- Scaffolded guest commerce.

---

## Recommended UX placement

**Put the wizard on the Routers row**, next to Quick Config, not only under Access Point.

Reasons:

- The ax² **is** the router already in `router_connections`. Operators will not add a second “MikroTik controller.”
- Access Point Create SSID is branded as WPA + VLAN for UniFi-class WLANs.
- Quick Setup must stay REST/DDNS-only (Phase 2 honesty).

Access Point MikroTik driver should later **read** `/interface/wifi` so the SSIDs tab is not empty, but **creating a hotspot SSID** should still be a Routers action with open-auth + hotspot bind.

Copy: **Create hotspot Wi-Fi (SSID)** — never “Create SSID” alone, to distinguish from staff WPA.

---

## Technical sketch (for the build that follows this plan)

Detect stack (in order):

1. `GET /interface/wifi` — wifiwave2 (ax², ax³, …)
2. `GET /interface/wireless` — legacy wireless
3. Else: “this device has no local radios; use an external AP or Access Point / CAPsMAN”

Wifiwave2 create (virtual AP, dual-band same SSID):

```text
POST /interface/wifi/security     { name: mm-hs-open, authentication-types: "" }
POST /interface/wifi/datapath     { name: mm-hs-dp, bridge: <chosen-bridge> }
POST /interface/wifi/configuration
  { name: mm-hs-cfg, ssid: <SSID>, country: <optional>, security: mm-hs-open, datapath: mm-hs-dp, mode: ap }
POST /interface/wifi
  { name: mm-hs-2g, master-interface: wifi1, configuration: mm-hs-cfg, comment: mm-hotspot-ssid }
POST /interface/wifi
  { name: mm-hs-5g, master-interface: wifi2, configuration: mm-hs-cfg, comment: mm-hotspot-ssid }
```

CAP wait state: if `wifi1`/`wifi2` show no CAPsMAN, **preview** must include `/interface/wifi/cap set enabled=no` (or equivalent) **only after confirm**, because that is a topology change.

Hotspot bind (optional second step):

- `GET /ip/hotspot` — if a server already uses the chosen bridge, skip.
- Else `PUT/POST /ip/hotspot` with `interface=<bridge>`, reuse existing address-pool and hotspot profile when present.
- Use the same PUT-first create pattern as hotspot users (PR #100), not ad-hoc POSTs.

Staff SSID (optional later): reuse Access Point password fields against `/interface/wifi/security` WPA2, **never** as the default for “hotspot.”

### Files likely to change in a future slice

- New: `src/lib/wifi-hotspot.server.ts` + `src/lib/wifi-hotspot.functions.ts`
- UI: `src/routes/_authenticated/app.routers.tsx` or a `HotspotSsidPanel`
- Tests: fake REST store covering `/interface/wifi*` + `/ip/hotspot` (mirror `tests/quick-config.test.ts`)
- Later: extend `src/lib/ap/mikrotik.server.ts` list/save to wifiwave2 **without** routing hotspot-open creates through WPA Create SSID
- i18n: translate feature descriptions; keep button **Create hotspot SSID** in English per project language rules

No new tables required for v1 if comments tag RouterOS objects. Optional later: `ssid_actions_audit` (or reuse `ap_actions_audit` with `router_id`).

---

## Risks

| Risk                       | Why                                   | Mitigation in the future build                                    |
| -------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Writing `/caps-man` on ax² | Current `saveSsid` create path        | Never call `/caps-man` from the hotspot wizard                    |
| WPA on guest SSID          | Portal never shows                    | Default security **open**; password field hidden for hotspot type |
| Breaking CAP mode          | Radios waiting on CAPsMAN             | Explicit confirm; do not auto-disable CAP                         |
| Bridging wifi into WAN     | Wrong datapath                        | Only allow existing LAN/hotspot bridges; never WAN list           |
| Duplicate hotspot servers  | Two servers on one interface          | Skip create if interface already has a server                     |
| Virtual AP on CAP slaves   | Some CAP setups reject local virtuals | Probe + clear error                                               |
| Country unset              | wifiwave2 may refuse enable           | Read existing radio country; do not invent US                     |

---

## Acceptance criteria (when we implement — not now)

1. On a reachable hAP ax² (wifi package), the operator can preview then apply a new **open** SSID that appears on `wifi1` and/or `wifi2` (or named virtuals) in WinBox **WiFi**.
2. Guest association lands on the same L2 domain as `/ip hotspot` (chosen bridge).
3. Existing unmanaged SSIDs are not renamed unless the operator chose overwrite.
4. Access Point **Create SSID** is unchanged in v1 (or clearly labeled staff/CAPsMAN).
5. Automated tests cover detect-stack, virtual-AP payload, skip-hotspot-if-present, refuse WAN bridge — no live router required in CI.
6. One real ax² handshake is a **manual** gate after deploy, same as Phase 1.5 hub Test.

---

## Suggested build order (future PRs)

1. **Read-only probe** on Routers: list `/interface/wifi` + `/ip/hotspot` (no writes). Proves stack detection on real hardware.
2. **Create virtual open SSID** + datapath to an existing hotspot bridge (writes tagged `mm-hotspot-ssid`).
3. **Optional** create `/ip/hotspot` server when missing.
4. **wifiwave2 list** on Access Point (read) so the SSIDs tab is honest.
5. Only then consider staff WPA + CAPsMAN-v2.

---

## This document’s deliverable

Plan and audit only. No RouterOS writes from the app, no Lovable republish, no SQL.
