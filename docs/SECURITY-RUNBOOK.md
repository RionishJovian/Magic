# Security runbook — staged operations, credentials and rollback

No credentials live in source, migrations, seeds, logs, or UI. There is **no**
unauthenticated endpoint that can create, promote, reset, or delete users.

## Create the first owner (one-time, manual)

1. In the backend (Cloud → Users), create the user with a strong unique
   password generated in a password manager. Confirm the email.
2. Copy the new user's UUID.
3. Apply a one-time migration (or run SQL through the backend console) that
   grants the role and the username mapping — no password ever appears here:

   ```sql
   insert into public.user_roles (user_id, role, owner_id)
   values ('<USER_UUID>', 'owner', '<USER_UUID>')
   on conflict (user_id, role) do nothing;

   insert into public.profiles (id, display_name, username)
   values ('<USER_UUID>', '<display name>', '<username>')
   on conflict (id) do update set username = excluded.username;

   insert into public.owner_accounts (username, auth_email, user_id)
   values ('<username>', '<email>', '<USER_UUID>')
   on conflict (username) do update set auth_email = excluded.auth_email,
                                        user_id = excluded.user_id;
   ```

## Rotate compromised credentials

Every password that was previously hard-coded (the old default owner account)
must be treated as compromised:

1. Change that account's password in Cloud → Users, or delete the account
   outright if it is no longer needed.
2. Sign out all sessions for the account.
3. Rotate backend API keys and any shared secrets in the project's secret
   store; never paste replacements into code or chat.

## Login privacy

`resolveLoginEmail` returns an unroutable placeholder for unknown usernames, so
responses never disclose account existence. It applies a durable, hashed
per-IP (10 requests/minute) and identifier (5 requests/minute) limiter through
the service-role-only rate-limit primitive. Limiter failures fail closed and
the raw username or voucher value is never used as the persisted key.

The limiter is intentionally scoped to the public account-login operation. It
does not claim to be a per-router or per-tenant voucher limiter because that
guest authentication path is not implemented by this application; RouterOS
currently authenticates hotspot users directly and Magic observes first use.

---

## Staged test-router procedure

The Test Lab (`/app/test-lab`, owner/admin only) separates two environments:

- **Sandbox** (`/app/test-lab/sandbox`) — simulation only. In-memory fixtures,
  no credentials, no packets, nothing persisted. Use it for UI and workflow
  work.
- **Real routers** (`/app/test-lab/real`) — physical hardware, with the setup
  checklist and the staged rollout rules.

Procedure for a new isolated lab router:

1. Work through the checklist on the Real routers page: isolated lab router on
   its own uplink, dedicated RouterOS API user, separate hotspot profile, fake
   vouchers only, non-production portal directory, local connector or
   restricted tunnel preferred, never publicly exposed.
2. Register the router deliberately from the Routers page. No record is created
   automatically; a router registered through this path defaults to
   `environment = test`.
3. Run the **read-only connection check** first (identity, RouterOS version,
   board). It performs no writes.
4. Only then perform one guarded write at a time, each with its typed
   confirmation.
5. Promote to production only when the router is genuinely serving customers:
   requires an owner/admin role plus the phrase `PROMOTE <ROUTER NAME>`.

### Typed confirmations and batch limits

| Action                     | Phrase                     | Extra requirement         |
| -------------------------- | -------------------------- | ------------------------- |
| Promote to production      | `PROMOTE <NAME>`           | owner/admin role          |
| Demote to test             | `TEST <NAME>`              | —                         |
| Deploy portal (test)       | `DEPLOY <NAME>`            | —                         |
| Deploy portal (production) | `DEPLOY PRODUCTION <NAME>` | owner/admin role          |
| Allow self-signed TLS      | `ALLOW SELF SIGNED <NAME>` | owner/admin role + reason |

Confirmations are case- and whitespace-insensitive but otherwise exact. Batch
limits: **1** target for test-environment actions, **5** for production. A
failed confirmation is itself an audited event.

## Endpoint and TLS policy

- A router endpoint is a bare hostname or IP literal plus a separate numeric
  port. URLs, schemes, paths, `user@`, query strings, brackets, zone ids and
  embedded ports are rejected before anything is saved or dialled.
- Addresses in loopback, private, link-local, CGNAT, documentation,
  benchmarking, multicast and reserved ranges are refused, for IPv4, IPv6 and
  IPv4-mapped IPv6. Hostnames are resolved and every resolved address is
  checked; `localhost`, `*.local` and `*.internal` are refused outright.
- The endpoint is re-validated immediately before an outbound connection, not
  only at save time.
- **Verified TLS is the default** on both the direct and connector paths. There
  is no unconditional insecure mode.
- A self-signed certificate is a per-router exception: owner/admin only, a
  written reason is required, the UI shows a prominent warning, and the grant is
  written to `router_ops_audit`. The stored flag and the client behaviour are
  the same value — nothing is silently weakened.

## Portal deployment and rollback guarantees

Deployment is staged into a versioned directory (`hotspot-mm-<version>`), every
file is verified to exist, and only then are the **selected** hotspot profiles
switched. Profiles that were not selected are never touched. A partial failure
triggers an automatic rollback of exactly the completed steps, profile mapping
first.

What a rollback restores:

- **Hotspot profile html-directory** — restored exactly to the prior value.
- **Text files** (login/alogin/status/error pages, CSS) — restored
  byte-for-byte; their prior content is read and captured before any write.
- **Files that did not exist before** — removed, so a rollback leaves no
  residue.

Known limitation — **binary assets are not restorable**. If a logo or hero
image already existed at the target path and was overwritten, the app does not
keep a copy of the original bytes and therefore cannot put it back. Those paths
are reported by `unrestorableAssets()` and surfaced in the UI; they are left in
place rather than deleted, which is the safest available behaviour. Re-upload
the original image manually if you need it back.

## Audit coverage

`router_ops_audit` (RLS-scoped to the effective owner) records actor, owner,
router, action, environment, outcome, duration and error text — never
passwords, keys or certificate material. Covered actions: connection checks,
endpoint/TLS validation failures, self-signed TLS exceptions, test-router
setup and promotion/demotion, portal deploy initiation and result (including
partial failures), rollback outcomes, and failed typed confirmations.

## MCP

The MCP server is OAuth-protected (Supabase issuer, `authenticated` audience)
and every tool runs as the signed-in account under the same row-level security
as the web UI. It currently exposes **read-only tools only**:

- `list_routers`
- `list_active_hotspot_users`
- `list_vouchers`
- `get_portal_settings`

`create_voucher`, `kick_user` and `ban_mac` exist in the source tree but are
**not registered** with the server and do not appear in
`.lovable/mcp/manifest.json`, so no client can call them. `tests/mcp-policy.test.ts`
fails the build if that ever changes. The in-app version of this policy lives at
`/app/test-lab/mcp`.

Before any write tool is enabled: a written blast-radius review signed off by
the owner, a typed confirmation and single-target limit inside the tool, an
audit record per invocation, and a successful staged trial on an isolated test
router.

## Browser and storage hardening

Every HTML/API response from `src/server.ts` gets:

- `Content-Security-Policy` (`default-src 'self'`, `frame-ancestors 'self'`, no objects)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` disabling camera, microphone, geolocation, payment, USB
- `Strict-Transport-Security` on HTTPS only (never on localhost)

`script-src-attr 'none'` also blocks inline JavaScript event-handler
attributes. The broader `script-src 'unsafe-inline'` allowance remains a
known migration item: RootShell emits a dynamic public-config boot script and
a theme boot script, while generated RouterOS guest pages intentionally use
inline scripts and styles for RouterOS compatibility. Removing it without a
nonce/hash or external-asset migration would break the current portal/runtime.

Captive-portal HTML escapes operator text and only interpolates `#RRGGBB` into CSS.
Receipt objects in `payment-receipts` must live under
`<effective_owner()>/<auth.uid()>/…`. Guest uploads still go through the service
role after the checkout token is checked. Apply
`.lovable/sql/security-run1-storage.sql` then
`.lovable/sql/security-run2-definer-grants.sql` then
`.lovable/sql/security-run3-global-platform-rls.sql` then
`.lovable/sql/security-run4-role-defaults-select.sql` on Lovable Cloud if those
policies are not on the live database yet.

Public `SECURITY DEFINER` RPCs are INVOKER wrappers; the privileged bodies live
in `private`. `list_features` / `has_feature` always resolve `auth.uid()` unless
the caller is a platform administrator.

## Session reconciliation boundary

Magic session rows are accounting and observation state; RouterOS remains the
enforcement plane for current MikroTik deployments. Poll reconciliation is
idempotent at the decision level: an unreachable router makes open rows
`stale`, and a successful poll closes rows no longer reported or reopens rows
that reappear. Database write failures are now surfaced and audited instead
of being silently ignored, with owner-scoped updates as defense in depth.

The current maintenance path can mark an expired Magic voucher while a router
is unreachable, and does not have a safe, vendor-neutral gateway revoke
contract. Automatically kicking/deleting RouterOS users in that condition
could change active-session, quota, or revenue semantics. A product-owner
decision is required before implementing gateway-side stale-authorization
enforcement; this phase does not silently change that behavior.

## Pre-publish verification checklist

Run and require green:

```bash
bunx tsgo --noEmit      # typecheck
bun run test            # Vitest suite
bun run lint            # ESLint
bun run build           # production build
```

Then confirm by hand:

- [ ] `.lovable/mcp/manifest.json` lists only the four read-only tools.
- [ ] No router record exists that was created automatically.
- [ ] Every registered lab router has `environment = test`.
- [ ] No `allow_insecure_tls` router without a recorded reason and audit entry.
- [ ] Sandbox pages still state "simulation only" and contact nothing.
- [ ] No credentials, keys or tokens appear in source, migrations or logs.
