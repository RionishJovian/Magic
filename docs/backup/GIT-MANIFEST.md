# Git backup manifest — what this repo already protects

Generated for ops recovery. Secrets are **not** included.

## Code & product

- `src/` — web app + server functions
- `src/agent/` — Local Connector CLI
- `public/` — static assets
- `tests/` — vitest suite

## Database structure

- `supabase/migrations/` — full migration history
- `.lovable/sql/` — Cloud SQL Editor paste scripts
- `src/integrations/supabase/types.ts` — generated table types

## Magic Hub / VPS code (not live secrets)

- `deploy/mikromagic-hub/service.mjs`
- `deploy/mikromagic-hub/hmac-selftest.mjs`
- `deploy/mikromagic-hub/nginx-provisioner.conf`
- `docs/hub-webfig-nginx.conf`
- `src/lib/wireguard/vps.server.ts` — app-side hub client

## Ops docs

- `docs/BACKUP-AND-RESTORE.md`
- `docs/backup/*`
- `docs/SECURITY-RUNBOOK.md`
- `docs/CONNECTOR-MVP.md`
- `.lovable/plan/*`

## Env templates

- `.env.example`
- `docs/backup/hub-env.template`
- `docs/backup/secrets-inventory.md`

## You still need offline

- Filled secrets vault
- Encrypted `pg_dump` of live data
- Encrypted VPS `/etc/mikromagic-hub` + WireGuard archive
