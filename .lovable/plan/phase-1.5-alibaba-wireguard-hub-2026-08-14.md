# Phase 1.5 — Alibaba Singapore WireGuard hub readiness

Status: **planned (Cloud/VPS-native path).** Not implemented yet.  
Decision (2026-08-14): standardize on **CloudPanel + signed `/internal/provisioner`**, not agentless `tunnel_hubs` `/r/<routerId>/` (deferred).

## Goal

One NAT/CGNAT (or lab) router can:

1. Provision a peer through the app (Cloud / WireGuard).
2. Handshake to Singapore Hub (`hub.mikromagic.app:51820`).
3. Pass **Test** / live REST through the hub (not the public WAN).

## What the live hub actually is

| Piece           | Live state                                                                     |
| --------------- | ------------------------------------------------------------------------------ |
| Host            | `hub.mikromagic.app` / `47.237.197.22`, SSH `ecs-user`                         |
| WG              | `wg0` `10.77.0.1/24`, UDP 51820, pubkey `4NScAtuL…ms38=`                       |
| TLS             | Let’s Encrypt OK                                                               |
| Control plane   | `mikromagic-hub-peer` on `127.0.0.1:8787` behind nginx `/internal/provisioner` |
| Data plane REST | **Missing** — no `/peers/.../rest` and no `/r/...`                             |
| Active peers    | None (`peers.json` has one `removed` verification peer)                        |

### Hub control-plane contract (source of truth = VPS `service.mjs`)

| Op      | Method + path                        | Scope header    |
| ------- | ------------------------------------ | --------------- |
| Create  | `PUT /v1/peers/by-router/{routerId}` | `peers:create`  |
| Inspect | `GET /v1/peers/{peerId}`             | `peers:inspect` |
| Disable | `POST /v1/peers/{peerId}/disable`    | `peers:disable` |
| Remove  | `DELETE /v1/peers/{peerId}`          | `peers:remove`  |

Create body (required): `tenantId`, `routerId`, `requestedBy`, `idempotencyKey` (`wg-peer:{routerId}:create`), `routerPublicKey`, `routerName`, `managementRestPort`.  
**Forbidden** in body: `address`, `allowedIps`, `privateKey`, `endpoint`, … — hub allocates `tunnelAddress` and returns `hubPublicKey` / `endpoint` / `allowedIps: ["10.77.0.1/32"]`.  
App must **generate** the router keypair; hub never returns a private key.

Auth headers hub expects: `X-MM-Key-Id`, `X-MM-Timestamp` (**ISO**, `Date.parse`), `X-MM-Request-Id`, `X-MM-Scope`, `X-MM-Tenant-Id`, `X-MM-Router-Id`, `X-MM-Requested-By`, `X-MM-Signature`.  
HMAC canonical = `method\npath\ntimestamp\nrequestId\nscope\ntenantId\nrouterId\nrequestedBy\nrawBody`.

Nginx only forwards those four `/v1/peers/...` shapes (not `POST /v1/peers`, not `/peers/.../rest`).

### App contract today (mismatched)

| Area         | App today                                                  | Hub today                                               |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------- |
| Create       | `POST /v1/peers` + `address`/`allowedIps`                  | `PUT .../by-router/{id}` + `routerPublicKey`            |
| Disable      | `PATCH /v1/peers/{id}`                                     | `POST .../disable`                                      |
| Headers      | `X-MM-Tenant`, `X-MM-Router`, `X-MM-Nonce`, unix timestamp | `…-Id` names, Request-Id, Scope, Requested-By, ISO time |
| Sign payload | body **digest**                                            | raw **body**                                            |
| Keys         | expects hub to return `privateKey`                         | app must send `routerPublicKey`                         |
| REST Test    | `{base}/peers/{peerId}/rest/...` (unsigned Basic)          | **not implemented**                                     |

Until these are aligned, CloudPanel cannot talk to Singapore Hub successfully.

## Architecture we will build toward

```text
Browser → CloudPanel → provisionCloudRouter / testRouter
                ↓ signed HMAC
        https://hub.mikromagic.app/internal/provisioner/v1/peers/...
                ↓ nginx
        127.0.0.1:8787 (hub peer service) → wg0 peers

Browser/app REST → {VPS_ROUTER_API_URL}/peers/{peerId}/rest/...
                ↓ (new data-plane proxy on hub)
        https://10.77.0.N:443/rest/...  (RouterOS over WG)
```

Do **not** use TunnelPanel / `tunnel_hubs` / `/r/<uuid>/` in this phase (avoids dual modes colliding on `tunnel_address`).

## Implementation plan (order)

### Step 0 — freeze decisions (done)

- [x] Path = Cloud/VPS-native
- [x] Subnet = `10.77.0.0/24`
- [x] No PEM/secrets in git

### Step 1 — align app ↔ hub control plane (app code)

Rewrite the signed client to match the live hub (do not invent a second hub API):

1. Update `src/lib/wireguard/vps.server.ts` headers + canonical HMAC + ISO timestamp.
2. Update `src/lib/wireguard/provisioner.server.ts` routes/methods/bodies to hub table above.
3. Update `provisionCloudRouter` to: generate keys locally → PUT create → persist ciphertext + `cloud_peer_id` + hub-allocated `tunnel_address` → script with hub `allowedIps` (`10.77.0.1/32`) and hub pubkey/endpoint.
4. Align disable/remove/inspect with hub.
5. Fix/extend tests in `tests/wireguard-*.test.ts`.

**Exit:** signed create/inspect against hub returns 200 with a real peer in `wg show` (can use a throwaway key before any router).

### Step 2 — Lovable / server env

Set (values from VPS `MM_HUB_*`, never commit):

- `VPS_ROUTER_API_URL=https://hub.mikromagic.app/internal/provisioner`
- `VPS_ROUTER_API_SIGNING_SECRET` = hub signing key
- `VPS_ROUTER_API_KEY_ID=v1` (matches `MM_HUB_SIGNING_KEY_ID`)
- `VPS_ROUTER_WG_SUBNET=10.77.0.0/24` (if app still allocates locally for anything; create path should prefer hub allocation)

**Exit:** app `isCloudConfigured()` true; create call reaches nginx (not connection refused).

### Step 3 — hub data-plane REST proxy (VPS ops + small config)

Hub service does **not** proxy RouterOS today. Add a data plane the app already calls:

- Prefer: nginx (or tiny local proxy)  
  `location /internal/provisioner/peers/{peerId}/rest/` → `https://{tunnelAddress}:443/`  
  with `proxy_ssl_verify off`, forward `Authorization`.
- PeerId → IP map from `/var/lib/mikromagic-hub/peers.json` (regenerate on peer sync, or lua/njs lookup).
- Default REST port **443** until hub stores `managementRestPort` (field is validated on create but **not persisted** today — optional hub-service follow-up).

Also confirm Alibaba security group: UDP **51820**, TCP **443**. Keep `ip_forward=0` for now.

**Exit:** from the VPS, `curl -k -u user:pass https://10.77.0.N:443/rest/system/resource` works after handshake; same URL shape via public hub hostname works for the app.

### Step 4 — one live router proof

1. CloudPanel → Provision on one router.
2. Paste RouterOS script.
3. `wg show` shows handshake.
4. App **Test** / Check now green.
5. Clean or ignore stale `removed` peer in `peers.json`.

### Step 5 — harden (only after proof)

- Persist `managementRestPort` on hub peer records if non-443 needed.
- Optional `/health`.
- Operator docs in Manual for Cloud (not Tunnel) path.
- Do **not** enable TunnelPanel against this hub until a later phase.

## Explicitly out of scope for Phase 1.5

- Phase 1 Local Connector / DDNS LAN-probe bugs
- Agentless `tunnel_hubs` + `/r/<routerId>/`
- Changing hub WireGuard subnet or rotating hub private key
- Opening port 8787 publicly

## Risks

1. **Contract rewrite is larger than “set env vars”** — app and hub were built against different Phase-3 drafts.
2. **REST proxy is mandatory** for Test/telemetry; control-plane alone only proves handshake.
3. **Do not** provision the same router via TunnelPanel and CloudPanel (shared `tunnel_address`).
4. Signing mismatches show up as opaque 401s — fix client to hub, don’t loosen hub auth.

## Success criteria

- [ ] App signed `PUT .../by-router/...` creates a peer visible in `wg show`.
- [ ] Router handshake within ~30s of script apply.
- [ ] App Test reaches RouterOS via hub REST proxy.
- [ ] No secrets in the git repo.

## Approve before coding

Implement **Step 1 (app client alignment)** first on a branch, then env (Step 2), then hub REST proxy (Step 3), then live proof (Step 4).
