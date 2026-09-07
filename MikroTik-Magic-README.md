# MikroTik Magic — Project README (AI context export)

> Single-source description of the MikroTik Magic application, intended to be
> fed to a local AI model (e.g. an Ollama-hosted model) so it understands the
> project's purpose, architecture, feature surface, roles, and constraints.
> Generated 2026-08-27 from the live codebase. All figures below are derived
> from the app's own configuration tables and navigation code, not marketing copy.

---

## 1. What it is

**MikroTik Magic** (`mikromagic`) is a cloud web application for running a
MikroTik RouterOS hotspot business. It lets an operator manage MikroTik routers,
UniFi access points, Cisco switches, and Ruijie gateways from a single browser
dashboard — remotely over the internet or locally on the LAN.

The business it serves: a **voucher-code hotspot**. The operator connects a
MikroTik RouterBOARD as the gateway, attaches access points for Wi-Fi, and guests
get internet access by entering a voucher code issued from the MikroTik hotspot
system. MikroTik Magic is the cloud control plane on top of that setup.

**Live URLs**

- Published: https://mikromagic.lovable.app
- Custom domain: https://mikromagic.app (and https://www.mikromagic.app)
- Preview: https://id-preview--01520fe2-2926-48eb-af86-61b334047e63.lovable.app

---

## 2. Technology stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start v1 (full-stack React 19, SSR/SSG) |
| Build tool | Vite 8 (Nitro / Cloudflare-Worker build target) |
| Styling | Tailwind CSS v4 (native `@import` + `@theme` in `src/styles.css`) |
| UI primitives | shadcn/ui + Radix UI, `class-variance-authority`, Tailwind-merge |
| Backend / DB / Auth | Lovable Cloud (Supabase under the hood) — Postgres, Auth, Storage |
| Data layer | TanStack Query + Supabase JS client; server functions for privileged ops |
| Forms | react-hook-form + zod |
| Charts / maps | Recharts, Leaflet + react-leaflet |
| Toasts | sonner |
| Tests | Vitest (477 tests run without external services; 4 DB-integration suites need live PG creds) |
| Package manager | Bun (canonical) |
| Typecheck | `bunx tsc --noEmit` (passes clean) |
| Local Connector agent | `src/agent/**` — zero-dependency Node.js CLI, self-updating, Ed25519-signed |

**Standard commands** (from `package.json`):

```sh
bun run dev      # dev server on http://localhost:8080
bun run build    # production build
bun run test     # vitest run
bun run lint     # eslint (has pre-existing drift; not a clean baseline)
bun run i18n:audit  # i18n coverage audit (the only thing CI runs)
```

---

## 3. Architecture overview

```
Public routes (no login)             Authenticated app (/app/*, 34 pages)
  / (landing)                           Business: Home, Revenue, Vouchers,
  /auth (sign-in)                         Print, Reseller Operation, Payments,
  /pricing                              Portal, Magic Coins, Services,
  /portal/checkout (info-only)           Manual, Profile
  /api/public/* (connector, webhooks)  Operations: Sites, Routers, Connectors,
  /.mcp, /.well-known (MCP)               Devices & ports, Access Points,
                                          Incidents, Fleet, Site topology,
                                          Live users, Syslog AI, Magic Dude,
                                          Quick setup
                                        Advanced: Terminal, Deployments,
                                          Production readiness, Test lab,
                                          Scripts, Backups, Audit log, Users,
                                          Tenants, Credit usage, Language coverage
```

- **Routing**: file-based via TanStack Router (`src/routes/*`). The only root
  layout is `src/routes/__root.tsx`. `routeTree.gen.ts` is auto-generated.
- **Navigation model** (`src/lib/nav/modes.ts`): tabs are grouped into three
  modes — **Business**, **Operations**, **Advanced** — and filtered per role.
- **Server boundary**: app-internal logic uses `createServerFn` from
  `@tanstack/react-start` (typed RPC). External callers (webhooks, cron,
  connector agent) use TanStack server routes under `src/routes/api/public/*`.
- **Supabase clients**:
  - Browser: generated `supabase` from `@/integrations/supabase/client` (RLS applies).
  - Authenticated server fn: `.middleware([requireSupabaseAuth])` builds a
    user-scoped client from the anon key + caller's JWT.
  - Privileged/bypass: `supabaseAdmin` (service-role) — RLS-bypass admin ops only.

---

## 4. Roles & access model

Roles live in a separate `user_roles` table (never on the profile table). The
canonical `app_role` literals (see `src/lib/app-role.ts`):

| Role | Who | Notes |
|---|---|---|
| `primary` | Application owner / producer | Does not own a café. Rank 2. |
| `client` (User) | Café / shop owner running their own hotspot | Self-owns (`owner_id = user_id`). **16 core tools**. |
| `agent` (Verified Agent) | Recruited by the app owner to bring in café Users | Earns Magic Coins commissions. Agent accounts never expire. |
| `expired` | Lapsed account | Can only reach Profile/Services/Manual to renew. |
| `pending` | Not yet activated | Limited. |
| `platform_admins` (Developer) | Platform staff | Rank 1 — outranks Primary, platform-wide privileged access. |

**Privilege rule**: `isPrivilegedAccount = isPlatformAdmin || hasTenantPrimaryRole`.
**Client access contract**: the `client` role exposes exactly **16 features** (never
advertised as "22 tools"). Magic Dude (AI) is role-locked to privileged roles.
User Management is Primary-only.

**Tenant isolation**: every user row self-owns; ordinary users never see other
tenants' data. RLS is enabled on every public table.

---

## 5. Connection engines (how a board is reached)

Four transports, all fail-closed when unconfigured:

1. **Direct REST** — RouterOS 7.1+ REST API over the LAN or a public IP/DDNS.
2. **Local Connector agent** (`src/agent/**`) — a zero-dependency Node.js CLI
   installed on a Windows/macOS/Linux machine inside the customer LAN. It makes
   outbound HTTPS calls only (pair → heartbeat → poll jobs → post results),
   proxies jobs to local devices, and self-updates via Ed25519-signed manifests.
   Never listens on a port; only private LAN IPv4 targets are ever contacted;
   TLS verification is never globally disabled (self-signed certs accepted only
   via a pinned SHA-256 fingerprint).
3. **Legacy Cloud/VPS proxy** (`src/lib/cloud-vps.server.ts`) — reads
   `VPS_ROUTER_API_URL` + `VPS_ROUTER_API_SECRET`.
4. **WireGuard peer foundation** (`src/lib/wireguard/*`) — agentless outbound
   tunnel: authorization, route policy, signed VPS transport, peer lifecycle.
   50 tests cover it, but it is currently inert (no UI wired, staged migration
   not yet applied). Reads `VPS_ROUTER_API_URL` + `VPS_ROUTER_API_SIGNING_SECRET`
   + `VPS_ROUTER_API_KEY_ID`.

> Note: the two VPS stacks use incompatible credential sets and are not yet
> consolidated onto one signed transport.

---

## 6. Feature surface (per role)

Derived from `src/lib/nav/modes.ts` and `src/lib/product-claims.ts`.

### Client (User) — 16 core tools
Home, Revenue, Vouchers, Print, Reseller Operation, Payments (if `cash_sales`
granted), Portal, Services, Profile, Manual, Sites, Routers, Devices & ports,
Access Points, Incidents, Fleet, Live users, Syslog AI, Magic Dude (locked state).

### Primary (owner) — adds
Quick setup, Terminal, Deployments, Production readiness, Test lab, Scripts,
Audit log, Users, Tenants, Credit usage, Language coverage, Connectors.

### Agent — adds
Magic Coins (commission ledger, referrals, reports).

### Developer (platform_admins) — adds
Site topology, Backups, plus a **Developer Router Support Console** for
cross-tenant inspect/reboot/**sync voucher plans** under a time-limited,
revocable customer delegation (`router_support_grants`, max 72h, fully audited).

---

## 7. Captive portal & guest commerce

- The captive portal is **not** a scaffolded slideshow. Payment method names
  and card designs are **operator-customizable**.
- Temporary access uses RouterOS **7.1+ Hotspot trial** (`login-by` includes
  `trial`, `trial-user-profile=mm-trial`, Connect as `T-$(mac-esc)`).
- Helper pages live in the Hotspot `html-directory` and must work **without**
  cloud payment providers.
- Guests never choose a plan — the operator assigns voucher profiles.
- "One-click Publish Portal" deploys/zips portal content to the router's
  `/hotspot` directory.

---

## 8. Monetization model

**Manual service-purchase model** (no self-signup; accounts created by
developers/agents):

- **Monthly** — extends expiry by one month.
- **Annual** — extends expiry by one year.
- **Plus tier** (30,000 MMK) — adds +1 to every device-type quota (additive).

**Pricing (MMK)** — from `src/lib/pricing.functions.ts`, live "Grand opening"
promo (Asia/Yangon calendar, 2026-08-23 → 2026-09-24, 30% off):

| Plan | Standard | Promo (30% off) |
|---|---|---|
| Monthly | 95,000 | 66,500 |
| Annual (Sapphire) | 1,045,000 | 731,500 |

The promo sells only when the kill switch (`active`) is on **and** today is
within the window.

**Agent commissions (Magic Coins)** — from the approved product requirements:
- Emerald (monthly) → 1.5 points per successful monthly activation
- Sapphire (annual) → 15 points per annual activation
- New account creation → 20 points
- Refunds **reverse** awarded points
- Agents see only their own clients, orders, points, commissions, and reports

---

## 9. AI features

Production AI runs through the **Lovable AI Gateway** (no key to manage).
For **local dev only**, Ollama can be reached at `http://localhost:11434/v1/chat/completions`
— but production (Cloudflare Workers) cannot reach local Ollama.

| Task | Callsite | Recommended Ollama model |
|---|---|---|
| Fleet AI scan / insights | `fleet-ai.server.ts`, `ai.functions.ts` | `qwen2.5:14b` (best JSON discipline) |
| Audit error diagnosis | `audit-diagnosis.ts` | `qwen2.5:14b` |
| Syslog translation (EN↔Burmese/Chinese) | syslog hook | `qwen2.5:14b` (`llama3.1:8b` lighter) |

All AI prompts demand strict `response_format: { type: "json_object" }`.

---

## 10. Public API endpoints (`/api/public/*`)

This prefix bypasses site auth, so handlers verify callers internally:
- `/api/public/connector/*` — pair, heartbeat, jobs, result, version (signed
  self-update), device install downloads (Windows/macOS/Linux), setup-tool.
- `/api/public/hooks/*` — db-backup, fleet-ai-scan (cron), syslog/$token,
  telegram callback, voucher-maintenance.
- `/api/public/checkout` — info-only checkout.

Stable cron URLs:
- Production: `https://mikromagic.app`
- Preview: `https://mikromagic.lovable.app`

---

## 11. Security posture

- RLS enabled on every public table; GRANTs tuned per policy.
- Roles in a separate `user_roles` table; `has_role` security-definer function.
- `requireSupabaseAuth` middleware on protected server functions.
- Service-role key (`supabaseAdmin`) never exposed to browser; used only for
  RLS-bypass admin ops.
- Public Supabase URL + anon key published on `window.__MM_PUBLIC__` (SSR boot
  script); service role never.
- Local Connector: OS secret-store token, Ed25519-signed updates, pinned TLS
  fingerprints, private-LAN-only targets.
- Leaked-password protection enabled; signed URLs hardened against IDOR.

---

## 12. Known constraints / gotchas

- **No Supabase secrets by default**: public routes render, but you cannot sign
  in or reach `/app/*`. Use DEV-only `/dev/ux-shell` to preview dashboard chrome.
- **Lint has drifted**: `bun run lint` reports many pre-existing
  `prettier/prettier` + `react-hooks/rules-of-hooks` violations. CI only runs
  the i18n audit.
- **4 Vitest suites need live PG creds** (`tenant-isolation`,
  `virtual-devices`, `device-quota`, `tier-pass-points`) — they shell out to
  `psql` against the live Supabase DB. The other 477 tests pass with no
  external services.
- **Typecheck**: use `bunx tsc --noEmit` (not `tsgo`, which isn't installable here).
- **Router inventory is currently empty** (0 rows in `router_connections`), so
  no live device data exercises any transport path yet.
- **WireGuard foundation is inert** — fully implemented and tested, but nothing
  calls it; the staged authorization migration is not yet applied.
- **Two incompatible VPS stacks** — consolidation pending.

---

## 13. Stability policy

The project is under a feature freeze: **no new features**. Work is limited to
bug finding, root-cause analysis, and fixes. In-app copy must match reality
(e.g. the client role has 16 features, not "22 tools").

---

## 14. Directory map (key paths)

```
src/
  routes/
    index.tsx                # landing (public)
    auth.tsx, pricing.tsx    # public auth/pricing
    __root.tsx               # app shell (Toaster, global chrome)
    _authenticated/          # 34 /app/* pages + route.tsx gate
    api/public/*             # connector, webhooks, cron
    [.]mcp/, [.well-known]   # MCP + OAuth protected resource
  lib/
    nav/modes.ts             # navigation + role filtering
    app-role.ts              # canonical role literals
    product-claims.ts        # derives marketing digits from real lists
    pricing.functions.ts     # pricing + promo window
    wireguard/               # agentless outbound tunnel (inert)
    cloud-vps.server.ts      # legacy VPS transport
    *.functions.ts           # ~52 typed-RPC server functions
    *.server.ts              # server-only internals
  integrations/supabase/     # auto-gen clients (do not edit)
  agent/                    # Local Connector CLI (separately packaged)
  components/                # shadcn-based UI components
  styles.css                # Tailwind v4 theme (glass-morphism, dark)
db/migrations/              # SQL migrations
tests/                      # Vitest suites
docs/                       # runbooks, backup, security
.lovable/plan/              # archived plans
```

---

## 15. Feeding this to a local AI model

Suggested system prompt framing when you load this file into a local model:

> You are an assistant with knowledge of the MikroTik Magic codebase. Read the
> attached README for the project's purpose, stack, roles, features, security
> model, and known constraints. Treat all figures (role tool counts, pricing,
> test counts) as authoritative from the README, not your prior assumptions.
> When asked to change code, respect the stability freeze: bug-fixes only,
> no new features, and keep in-app copy consistent with the README's stated facts.

For Qwen 2.5 / Llama 3.1: this file is ~6–8k tokens and fits comfortably in
context alongside a specific question or code snippet.

---

*End of README export.*
