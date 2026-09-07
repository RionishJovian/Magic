# Agentless outbound tunnel (WireGuard)

## How the app connects today (answer to your question)

The app's backend is **serverless edge functions** (TanStack server functions running on Cloudflare Workers). They can only make **outbound HTTPS requests** — they cannot open raw sockets, run a daemon, or terminate a WireGuard tunnel. Every router call today is `fetch("https://<router-host>:<port>/rest/...")` with Basic auth, so the router must be reachable from the public internet (DDNS + port forward).

That is exactly the limitation this feature removes — but because the app can't be a WireGuard peer itself, the tunnel needs one small always-on **hub** (a cheap VPS, or a Mikrotik/Linux box you already own). The router dials **outbound** to the hub (no port forward, works behind CGNAT), and the hub publishes the router's REST port over HTTPS. The app then talks to the hub URL instead of the router's public IP. Nothing is installed on the router beyond native RouterOS WireGuard — still agentless.

```text
MikroTik  --outbound WG-->  Hub (VPS, public IP)  <--HTTPS--  MikroTik Magic (edge)
 10.88.0.2                   wg0 10.88.0.1 + nginx/HAProxy
                             https://hub.example.com/r/<slug>  ->  10.88.0.2:443/rest
```

## What gets built

### 1. Tunnel hub registry (per owner)

New table `tunnel_hubs`: name, public endpoint (host:port for WG), hub public key, HTTPS base URL, WG subnet, notes. Owner/admin can add, edit, delete; tenant-scoped like routers.

### 2. Tunnel mode on a router

`router_connections` gains: `connection_mode` (`direct` | `tunnel`), `tunnel_hub_id`, `tunnel_address` (e.g. 10.88.0.2/32), `tunnel_public_key`, `tunnel_private_key_ciphertext` (encrypted with the existing crypto helper), `tunnel_listen_port`, `tunnel_last_check_at`, `tunnel_last_ok`.

When mode is `tunnel`, the connection loader swaps the request base to the hub's HTTPS URL for that router — all existing features (telemetry, terminal, portal deploy, vouchers, fleet scans, syslog correlation) keep working unchanged because they all go through the same request layer.

### 3. Keypair + script generator

Server function generates a WireGuard keypair, assigns the next free tunnel address in the hub's subnet, stores the encrypted private key, and produces two copy/download artifacts, matching the Quick Setup download styling:

- `magictunnel.rsc` — RouterOS 7 script: create `wireguard` interface, peer with hub endpoint + `persistent-keepalive=25s`, assign address, allow REST/www-ssl in on the tunnel interface only, and a firewall rule that keeps REST closed on WAN.
- `hub-peer.conf` — the peer block to paste into the hub's `wg0.conf`, plus the reverse-proxy snippet mapping `https://hub/r/<slug>` to the router's tunnel IP.

Also a `magictunnel-rollback.rsc` that removes the interface, peer, address, and firewall rules — same pattern as the existing rollback script.

### 4. Reachability checks (on-demand)

A tunnel diagnostic runs when you save a tunnel router, press **Test**, and before a Fleet AI scan:

1. Hub HTTPS base resolves and answers
2. Router REST path through the hub returns a response (handshake proof)
3. RouterOS auth succeeds
4. Pull `/interface/wireguard/peers` to report last handshake age and rx/tx

Each step reports pass/fail with a plain-language fix hint, reusing the existing multi-stage Test UI. Results write `tunnel_last_ok` / `tunnel_last_check_at` so Fleet and alerts can label a router "tunnel down" instead of silently failing, but no background polling is added.

### 5. UI

- **Routers page**: a "Connection" selector (Direct / Outbound tunnel) on the router form; tunnel routers show a Tunnel card with handshake age, hub name, and Re-check.
- **Quick Setup**: a new branch in the wizard — "My router has no public IP / is behind CGNAT" — which walks through hub selection, key generation, script download, and the reachability check, instead of the DDNS/port-forward path.
- **Fleet**: routers with a failed last check are flagged so scans and alerts explain the tunnel is down rather than reporting a generic timeout.

## Technical notes

- WireGuard keys are generated with Web Crypto X25519 inside the server function; private keys are stored encrypted with the existing `crypto.server` helper and never returned to the client after initial script generation.
- `loadRouterConn` in `src/lib/router-conn.server.ts` becomes tunnel-aware and returns the hub-backed base URL; `mikrotik.server.ts` gains an optional `baseUrl` override so no call site changes.
- New tables get GRANTs plus owner-scoped RLS using `effective_owner()`, consistent with the existing tables.
- Hub setup instructions (WireGuard + reverse proxy) are added to the Manual tab; the app never needs credentials for the hub, only its public key and URLs.
