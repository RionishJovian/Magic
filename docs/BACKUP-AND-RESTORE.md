# MikroTik Magic — backup & restore (git-safe)

**Rule:** Git holds **structure, code, SQL, and templates**. Real secrets, `.pem` keys, and live DB dumps with PII stay **out of git** (password manager + Lovable Secrets + VPS `/etc`).

This package inventories what you already have in the repo and what you must back up offline.

---

## What is already on GitHub `main`

| Area                           | Location                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------- |
| App source (TanStack / React)  | `src/`                                                                       |
| Local Connector agent          | `src/agent/`                                                                 |
| DB migrations (schema history) | `supabase/migrations/` (~98 files)                                           |
| Lovable Cloud paste SQL        | `.lovable/sql/` (~22 files)                                                  |
| Magic Hub service code         | `deploy/mikromagic-hub/`                                                     |
| Hub nginx snippets             | `docs/hub-webfig-nginx.conf`, `deploy/mikromagic-hub/nginx-provisioner.conf` |
| Plans / phase notes            | `.lovable/plan/`                                                             |
| Security / connector docs      | `docs/SECURITY-RUNBOOK.md`, `docs/CONNECTOR-MVP.md`                          |
| Env **names** (empty values)   | `.env.example`                                                               |

## What must NOT go in git

- `SUPABASE_SERVICE_ROLE_KEY`, anon key values, JWT secrets
- `VPS_ROUTER_API_SIGNING_SECRET` / hub `MM_HUB_SIGNING_KEY`
- WireGuard private keys, `.pem`, SSH keys
- Telegram bot tokens, `CRON_SECRET`, `APP_ROUTER_SECRET`
- Live `pg_dump` of production with customer vouchers / emails (store encrypted offline)

---

## Offline backup checklist (you run these)

### A. Lovable Cloud → Secrets

Copy **names + values** into a password manager (1Password / Bitwarden). Do not commit.

See: `docs/backup/secrets-inventory.md`

### B. Database

1. Lovable Cloud → SQL / Supabase → **export** or `pg_dump` (schema + data) to encrypted storage.
2. Keep a dated copy: `mikromagic-db-YYYYMMDD.dump`
3. Schema-only is also covered by replaying `supabase/migrations/` + `.lovable/sql/` in order (see `docs/backup/sql-restore-order.md`).

### C. Alibaba / Magic Hub VPS

On the VPS (as root), archive **config only** (strip secrets before any git commit):

```bash
# Example — store the tarball OFF the VPS, encrypted, NOT in git
sudo tar czf /tmp/mikromagic-hub-config.tgz \
  /etc/mikromagic-hub/ \
  /opt/mikromagic-hub/ \
  /etc/nginx/sites-enabled/ \
  /etc/wireguard/ 2>/dev/null || true
```

Replace live secrets with placeholders before sharing. Keep the real tarball in your password manager / private drive.

Hub app code to redeploy is already in git: `deploy/mikromagic-hub/service.mjs`.

### D. Custom domain / Cloudflare

- Note DNS records for `mikromagic.app` / hub hostname
- Note Lovable publish target / custom domain binding

### E. Operator accounts

- Owner UUID + Telegram handle for recovery (see SECURITY-RUNBOOK)
- Bank / payment details live in DB (`owner` settings) — covered by DB dump

---

## Restore order (disaster)

1. Restore Supabase / Lovable Cloud project (or new project + apply migrations).
2. Paste secrets from password manager into Lovable → Secrets.
3. Redeploy hub files from `deploy/mikromagic-hub/`; restore `/etc/mikromagic-hub/env` from offline backup.
4. Align `VPS_ROUTER_*` (Lovable) with `MM_HUB_*` (VPS).
5. Republish app.
6. Routers → Test one peer.

Details: `docs/backup/sql-restore-order.md`, `docs/backup/hub-vps-checklist.md`.

---

## Related inventory files

- `docs/backup/secrets-inventory.md` — every env name the app reads
- `docs/backup/sql-restore-order.md` — migrations + Lovable SQL lists
- `docs/backup/hub-env.template` — hub env file shape (empty values)
- `docs/backup/hub-vps-checklist.md` — VPS files to archive
