# Magic Hub → DigitalOcean migration runbook

Replaces the locked Alibaba ECS (Singapore) hub. Nothing in the app changes: the app
only talks to `VPS_ROUTER_API_URL` over signed HMAC, so a new host with the same
hostname + same signing secret is a drop-in swap.

---

## 0. What the hub actually is

| Piece                                | Where it lives                                          |
| ------------------------------------ | ------------------------------------------------------- |
| Peer control plane (Node)            | `deploy/mikromagic-hub/service.mjs` → `/opt/mikromagic-hub/` |
| Env / signing key                    | `/etc/mikromagic-hub/env`                               |
| Peer registry                        | `/var/lib/mikromagic-hub/peers.json`                    |
| WireGuard hub interface              | `/etc/wireguard/wg0.conf` (subnet `10.77.0.0/24`, hub `10.77.0.1`) |
| nginx provisioner + WebFig vhost     | `deploy/mikromagic-hub/nginx-provisioner.conf`, `docs/hub-webfig-nginx.conf` |

---

## 1. Droplet spec (what to create on DigitalOcean)

- Ubuntu 24.04 LTS, **Singapore (SGP1)** — closest to Myanmar, keeps latency similar.
- Basic / Regular, **1 vCPU / 2 GB RAM / 50 GB SSD** ($12/mo) is enough; 1 GB works but
  2 GB gives headroom for nginx + WireGuard + Node.
- **Reserved (floating) IP** — attach one so a future rebuild does not change DNS.
- SSH key auth only, no password login.
- Enable weekly backups or at least manual snapshots.
- Cloud firewall (inbound): `22/tcp` from your IP only, `80/tcp`, `443/tcp` from anywhere,
  `51820/udp` from anywhere (WireGuard). Everything else denied.
- Do **not** use the "VPN Server" 1-Click app — it installs its own opinionated
  WireGuard/OpenVPN stack that fights our peer control plane. Plain Ubuntu + our scripts.

---

## 2. Prompt for DigitalOcean's AI assistant

Paste this into the DO AI Assistant:

```text
I need a production VPS for a WireGuard hub + reverse proxy. Please give me exact
DigitalOcean steps and CLI (doctl) commands for:

1. Create an Ubuntu 24.04 LTS Droplet in the SGP1 (Singapore) region, Basic plan,
   1 vCPU / 2 GB RAM / 50 GB SSD, SSH key authentication only, monitoring enabled,
   weekly backups enabled, named "mikromagic-hub".
2. Create and attach a Reserved IP to that Droplet so the public IP survives rebuilds.
3. Create a Cloud Firewall named "mikromagic-hub-fw" attached to that Droplet with:
   - inbound TCP 22 from a single admin IP only
   - inbound TCP 80 and 443 from 0.0.0.0/0 and ::/0
   - inbound UDP 51820 from 0.0.0.0/0 and ::/0
   - all other inbound denied; all outbound allowed
4. Enable IPv4 forwarding and install wireguard, nginx, certbot and Node.js 20 LTS.
5. Show how to point an external DNS A record (hub.mikromagic.app, managed at my
   registrar) at the Reserved IP, and issue a Let's Encrypt certificate with
   certbot --nginx for that hostname.
6. Recommended hardening: unattended-upgrades, fail2ban for sshd, disabling password
   and root SSH login, and how to take a manual snapshot before/after changes.

Do NOT recommend the VPN Server 1-Click app — I run my own WireGuard control plane.
Give commands only for Ubuntu 24.04, and note anything DigitalOcean-specific
(e.g. how Reserved IPs interact with the Droplet's anchor IP).
```

---

## 3. About the WireGuard keys (important)

There are **two** key sets:

**A. Hub server keypair** (`/etc/wireguard/wg0.conf` on the old Alibaba box)

- If you can still SSH into the locked Alibaba instance, copy the `PrivateKey` from
  `/etc/wireguard/wg0.conf` and reuse it on DigitalOcean. Then **no router has to be
  re-pasted** — every board already trusts that public key.
- If the instance is unrecoverable, generate a new hub keypair:
  ```bash
  umask 077 && wg genkey | tee /etc/wireguard/hub.key | wg pubkey > /etc/wireguard/hub.pub
  ```
  Consequence: every router's `[Peer] PublicKey` and `Endpoint` are now wrong, so each
  board must run the paste script again (Routers → Connect via Hub → *Show paste window*,
  which reissues with `reissueScript: true`).

**B. Per-router peer keys** — these are safe. The app stores each router's
`cloud_wg_public_key`, `cloud_wg_address` and encrypted private key in the database, so
`peers.json` can be rebuilt on the new hub from the app; you do not need the old
`peers.json` file. Copy it if you have it (faster), otherwise re-provision per router.

**C. The HMAC signing secret** (`MM_HUB_SIGNING_KEY` ↔ `VPS_ROUTER_API_SIGNING_SECRET`)
must be identical on the new hub and in Lovable Secrets. Reuse the existing value from
your password manager — then the app needs zero changes. If you rotate it, update both
sides in the same maintenance window.

---

## 4. Build the new hub

```bash
# as root on the new droplet
apt update && apt -y upgrade
apt -y install wireguard nginx certbot python3-certbot-nginx ufw fail2ban
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt -y install nodejs

echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-mm.conf && sysctl --system
mkdir -p /opt/mikromagic-hub /etc/mikromagic-hub /var/lib/mikromagic-hub
```

WireGuard `/etc/wireguard/wg0.conf` (hub side, peers are appended by the service):

```ini
[Interface]
Address = 10.77.0.1/24
ListenPort = 51820
PrivateKey = <hub private key from section 3A>
SaveConfig = false
```

```bash
systemctl enable --now wg-quick@wg0
wg show wg0 public-key   # note this — routers must trust it
```

Hub env `/etc/mikromagic-hub/env` (chmod 600):

```bash
MM_HUB_SIGNING_KEY_ID=v1
MM_HUB_SIGNING_KEY=<same value as VPS_ROUTER_API_SIGNING_SECRET>
MM_HUB_LISTEN=127.0.0.1:8787
MM_HUB_WG_INTERFACE=wg0
MM_HUB_ENDPOINT=hub.mikromagic.app:51820
MM_HUB_PEERS_PATH=/var/lib/mikromagic-hub/peers.json
MM_HUB_SUBNET=10.77.0.0/24
MM_HUB_SKEW_MS=300000
MM_HUB_PUBLIC_URL=https://hub.mikromagic.app/internal/provisioner
```

Service files from this repo:

```bash
install -m 755 deploy/mikromagic-hub/service.mjs      /opt/mikromagic-hub/service.mjs
install -m 755 deploy/mikromagic-hub/hmac-selftest.mjs /opt/mikromagic-hub/hmac-selftest.mjs
```

systemd unit `/etc/systemd/system/mikromagic-hub-peer.service`:

```ini
[Unit]
Description=MikroTik Magic hub peer control plane
After=network-online.target wg-quick@wg0.service

[Service]
EnvironmentFile=/etc/mikromagic-hub/env
ExecStart=/usr/bin/node /opt/mikromagic-hub/service.mjs
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now mikromagic-hub-peer
```

nginx: create the `hub.mikromagic.app` server block, then inside it
`include` the provisioner and WebFig snippets from this repo
(`deploy/mikromagic-hub/nginx-provisioner.conf`, `deploy/mikromagic-hub/mikromagic-peer-rest-map.conf`,
`docs/hub-webfig-nginx.conf`). The `limit_req_zone mikromagic_provisioner` and the
`map` blocks go at `http {}` level. Then:

```bash
certbot --nginx -d hub.mikromagic.app
nginx -t && systemctl reload nginx
```

---

## 5. Cutover

1. Point `hub.mikromagic.app` DNS at the DigitalOcean Reserved IP (lower TTL first).
2. Confirm Lovable Secrets still hold the matching values:
   `VPS_ROUTER_API_URL=https://hub.mikromagic.app/internal/provisioner`,
   `VPS_ROUTER_API_KEY_ID=v1`, `VPS_ROUTER_API_SIGNING_SECRET=<same as MM_HUB_SIGNING_KEY>`,
   `VPS_ROUTER_WG_SUBNET=10.77.0.0/24`, `VPS_ROUTER_HUB_ROUTE=10.77.0.1/32`.
3. Run the self-test on the droplet:
   ```bash
   sudo bash -c 'set -a; . /etc/mikromagic-hub/env; set +a; node /opt/mikromagic-hub/hmac-selftest.mjs'
   ```
   Both `localhost` and `public` must PASS.
4. In the app: Routers → pick one board → **Test**. If the hub keypair changed, use
   **Connect via Hub → Show paste window** and re-paste on that board first.
5. Roll the remaining boards, then take a DigitalOcean snapshot.
6. Remove the in-app outage broadcast banner when all boards are green.

---

## 6. Rollback

Keep the Alibaba appeal open until cutover is proven. Rollback = repoint DNS back and
restore `/etc/mikromagic-hub/env`; the app itself never changes.
