# Access Point management (multi-brand)

Rename the UniFi tab to **Access Point** and turn it from a read-only viewer into a real AP management console that works across UniFi, MikroTik, Ruijie and a generic/manual profile. The brand is chosen per controller when you add it, and the action buttons shown adapt to what that brand supports.

## What exists today (verified)

- `unifi_controllers` table + `src/lib/unifi.server.ts` (login, sysinfo, clients, devices, block/unblock/kick).
- `src/routes/_authenticated/app.unifi.tsx` — add/test/remove controller, live client table, AP list read-only.
- No SSID, password, VLAN, radio, reboot, alarms, CPU/memory or location control anywhere.
- MikroTik REST client already exists (`src/lib/mikrotik.server.ts`) and can drive CAPsMAN / local wireless on routers already registered.

## Target feature set

| Capability                             | UniFi                                        | MikroTik  | Ruijie | Generic         |
| -------------------------------------- | -------------------------------------------- | --------- | ------ | --------------- |
| AP online/offline, name, model, uptime | yes                                          | yes       | yes    | mapped          |
| Location / notes                       | yes (per AP record)                          | yes       | yes    | yes             |
| CPU / memory / load                    | yes                                          | yes       | yes    | mapped          |
| Connected clients + RSSI               | yes                                          | yes       | yes    | mapped          |
| SSID list                              | yes                                          | yes       | yes    | mapped          |
| Create / edit SSID                     | yes                                          | yes       | yes    | if endpoint set |
| Change Wi-Fi password                  | yes                                          | yes       | yes    | if endpoint set |
| Enable / disable SSID                  | yes                                          | yes       | yes    | if endpoint set |
| VLAN per SSID                          | yes                                          | yes       | yes    | if endpoint set |
| Radio / channel / TX power             | yes                                          | yes       | yes    | if endpoint set |
| Reboot AP                              | yes                                          | yes       | yes    | if endpoint set |
| Alarms / events                        | yes                                          | yes (log) | yes    | mapped          |
| Traffic statistics                     | yes                                          | yes       | yes    | mapped          |
| Multiple sites / customers             | existing Sites scoping applies to all brands |           |        |                 |

Unsupported operations for a given brand render as disabled buttons with a short reason instead of failing at click time.

## Database

Single migration:

- Add `brand` (text, default `unifi`, check in `unifi`/`mikrotik`/`ruijie`/`generic`) plus `api_base_path`, `capabilities` (jsonb, filled by a capability probe) and `router_id` (nullable FK, used when brand = mikrotik) to the existing controller table.
- Add `ap_devices` cache table: controller_id, mac, name, model, location, last_state, last_seen_at, cpu, mem, client_count, so location/notes survive between polls and the list renders instantly.
- New `ap_actions_audit` table: who performed which disruptive action on which AP/SSID and whether it succeeded.
- Grants + RLS on every new table scoped to `effective_owner(auth.uid())`, matching the pattern already used by `unifi_controllers`.

## Driver layer

`src/lib/ap/` with one interface and four drivers:

```text
src/lib/ap/types.ts        ApDriver interface + shared DTOs (ApDevice, Ssid, Radio, Alarm)
src/lib/ap/unifi.server.ts     extends today's unifi.server.ts with wlanconf + devmgr writes
src/lib/ap/mikrotik.server.ts  CAPsMAN /caps-man + /interface/wireless via existing REST client
src/lib/ap/ruijie.server.ts    Reyee/EWEB session login + AP + SSID endpoints
src/lib/ap/generic.server.ts   user-supplied base URL, auth header and endpoint map
src/lib/ap/index.server.ts     driver registry + capability matrix
```

Each driver implements the same methods: `probe`, `listAps`, `listClients`, `listSsids`, `saveSsid`, `setSsidEnabled`, `setSsidPassword`, `setSsidVlan`, `setRadio`, `rebootAp`, `setApMeta`, `listAlarms`, `trafficStats`, `clientAction`. Drivers declare a capability set; the registry reports it to the UI.

## Server functions

`src/lib/access-points.functions.ts` replaces `unifi.functions.ts` (old file removed, its call sites updated). All functions use `requireSupabaseAuth`, `requireNotExpired` and the existing device quota guard. Every write action is recorded in `ap_actions_audit`. Disruptive actions are allowed for any non-expired role, as requested; expired accounts stay read-only.

## UI

- Route `src/routes/_authenticated/app.unifi.tsx` → `app.access-points.tsx` at `/app/access-points`; nav label, Overview card, icon and manual references change from "UniFi APs" to "Access Point".
- Add-controller form gets a **Brand** selector first; the remaining fields (port, UniFi site, router picker, base path, endpoint map) show or hide per brand.
- Each controller expands into tabs: **Access points** (status, CPU/mem, clients, location edit, reboot), **SSIDs** (create/edit, password, enable/disable, VLAN), **Radios** (band, channel, width, TX power), **Clients** (RSSI, traffic, kick/block/unblock), **Alarms**, **Traffic**.
- Destructive actions (reboot, disable SSID, password change) go through a confirm dialog and show the audit trail entry after completing.
- Site filter and the existing device-limit card keep working across all brands.

## Notes

Ruijie and generic drivers are written against their documented HTTP APIs but can only be verified against your real hardware — the Test button reports exactly which capabilities probed successfully so you can see what a given device supports before using it.
