# Hub / VPS backup checklist

Code redeploy source of truth: `deploy/mikromagic-hub/` on GitHub.

## Files to archive on the VPS (offline, encrypted)

| Path                                       | Why                                |
| ------------------------------------------ | ---------------------------------- |
| `/etc/mikromagic-hub/env`                  | Signing keys + hub config          |
| `/opt/mikromagic-hub/`                     | Running service copy               |
| `/etc/nginx/` sites for hub / WebFig proxy | TLS + routing                      |
| `/etc/wireguard/`                          | Interface + peer keys (**secret**) |
| `/etc/letsencrypt/` or cert paths          | TLS certs                          |
| systemd unit for hub (if any)              | Restart policy                     |

## Suggested archive command (store privately)

```bash
sudo tar czf ~/mikromagic-hub-backup-$(date +%Y%m%d).tgz \
  /etc/mikromagic-hub \
  /opt/mikromagic-hub \
  /etc/wireguard \
  /etc/nginx/sites-enabled \
  /etc/nginx/sites-available 2>/dev/null || true
# Encrypt before leaving the machine, e.g. age / gpg
```

## After restore

1. Copy `deploy/mikromagic-hub/service.mjs` (+ `hmac-selftest.mjs`) onto the VPS.
2. Restore `/etc/mikromagic-hub/env` from vault.
3. Align Lovable `VPS_ROUTER_*` with hub `MM_HUB_*`.
4. Run hub HMAC self-test.
5. Republish app; Routers → Test.

## Nginx references in git

- `deploy/mikromagic-hub/nginx-provisioner.conf`
- `docs/hub-webfig-nginx.conf`
