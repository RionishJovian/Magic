# Secrets inventory (names only — fill values offline)

Paste real values into a **password manager**. Leave this file empty of secrets forever.

## Lovable Project → Secrets (required for production)

| Name                            | Purpose                | Match / notes                            |
| ------------------------------- | ---------------------- | ---------------------------------------- |
| `SUPABASE_URL`                  | Database API URL       | Lovable Cloud / Supabase project         |
| `SUPABASE_PUBLISHABLE_KEY`      | Anon / publishable key | Browser + user-scoped server             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Service role           | Server admin only — never in browser     |
| `VPS_ROUTER_API_URL`            | Magic Hub base URL     | e.g. `https://hub…/internal/provisioner` |
| `VPS_ROUTER_API_KEY_ID`         | HMAC key id            | Must equal hub `MM_HUB_SIGNING_KEY_ID`   |
| `VPS_ROUTER_API_SIGNING_SECRET` | HMAC secret            | Must equal hub `MM_HUB_SIGNING_KEY`      |
| `VPS_ROUTER_WG_SUBNET`          | WG subnet (optional)   | e.g. `10.77.0.0/24`                      |
| `VPS_ROUTER_HUB_ROUTE`          | Hub route (optional)   | e.g. `10.77.0.1/32`                      |

## Strongly recommended

| Name                | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `APP_ROUTER_SECRET` | Encrypts stored router credentials at rest |
| `CRON_SECRET`       | Auth for cron / scheduled routes           |
| `LOVABLE_API_KEY`   | AI / email / platform features             |
| `PUBLIC_APP_URL`    | Canonical public origin for callbacks      |

## Optional integrations

| Name                            | Purpose                        |
| ------------------------------- | ------------------------------ |
| `TELEGRAM_BOT_TOKEN`            | Owner alerts                   |
| `TELEGRAM_OWNER_CHAT_ID`        | Alert destination              |
| `TELEGRAM_API_KEY`              | Telegram connection helper     |
| `LOVABLE_SEND_URL`              | Email send endpoint            |
| `CONNECTOR_UPDATE_PRIVATE_KEY`  | Local Connector update signing |
| `VITE_SUPABASE_URL`             | Local Vite alias only          |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Local Vite alias only          |

## Hub VPS `/etc/mikromagic-hub/env` (must match Lovable)

| Name                    | Must match Lovable                 |
| ----------------------- | ---------------------------------- |
| `MM_HUB_SIGNING_KEY`    | `VPS_ROUTER_API_SIGNING_SECRET`    |
| `MM_HUB_SIGNING_KEY_ID` | `VPS_ROUTER_API_KEY_ID`            |
| (other hub-only vars)   | See `docs/backup/hub-env.template` |

## Offline vault reminder

- [ ] Secrets copied to password manager (dated)
- [ ] Hub env backed up encrypted
- [ ] WireGuard / SSH keys backed up encrypted
- [ ] Confirmed **no** secret values committed to git
