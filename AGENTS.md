<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Cursor Cloud specific instructions

**What this is:** MikroTik Magic (`mikromagic`) — a TanStack Start + React 19 + Vite 8 SSR
dashboard (Lovable Cloud / Cloudflare-Nitro build target) for running a MikroTik hotspot
business, backed by Supabase. `src/agent/**` is a separately-packaged Local Connector CLI
(not part of the web dev server).

**Package manager is Bun** (canonical, per `.github/workflows/i18n.yml` + `bunfig.toml`),
even though `README.md` mentions npm and a `package-lock.json` is also committed. `bun` is
installed and symlinked into `/usr/local/bin`. The startup update script runs `bun install`.
`bunfig.toml` enforces a 24h supply-chain release-age guard on fresh installs.

**Standard commands** (see `package.json` scripts): `bun run dev`, `bun run build`,
`bun run test`, `bun run lint`. Dev server binds `http://localhost:8080` (host/port are fixed
by `@lovable.dev/vite-tanstack-config`'s sandbox detection, not `vite.config.ts`).

**Non-obvious gotchas:**

- `bun run lint` currently reports many pre-existing `prettier/prettier` +
  `react-hooks/rules-of-hooks` violations. CI only runs the i18n audit (not lint/test/build),
  so lint has drifted — do not assume a clean lint baseline.
- 4 Vitest files import `tests/helpers/db.ts` and shell out to `psql` using `PG*` env vars
  pointed at the **live Supabase project DB**: `tenant-isolation`, `virtual-devices`,
  `device-quota`, `tier-pass-points`. Without those `PG*` credentials they fail with
  `spawn psql ENOENT` / connection errors. The `psql` client is installed; the remaining
  **477 tests pass with no external services**.
- Typecheck: `docs/SECURITY-RUNBOOK.md` says `bunx tsgo --noEmit`, but `tsgo` is not an
  installable package here — use `bunx tsc --noEmit` (passes clean).
- No Supabase secrets are set by default. The app runs degraded: public routes (`/`, `/auth`,
  `/pricing`) render, but you cannot sign in or reach `/app/*` (auth-gated). Use the DEV-only
  `/dev/ux-shell` route to preview the dashboard chrome without a login. To exercise
  authenticated flows, provide `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (accounts are created by developers/agents — there is no
  self-signup). Optional feature secrets: `LOVABLE_API_KEY` (AI), `VPS_ROUTER_*` (WireGuard
  hub), Telegram/payments/cron vars.
- **Captive portal / guest commerce:** do not ship scaffolded, slideshow, or sandbox-only
  guest flows. Payment method **names and card designs are operator-customizable**. Temporary
  access must use RouterOS **7.1+ Hotspot trial** (`login-by` includes `trial`,
  `trial-user-profile=mm-trial`, Connect as `T-$(mac-esc)`). Helper pages live in the Hotspot
  `html-directory` and must work without cloud payment providers.
- **SQL that must run on Lovable Cloud:** when a change needs SQL applied (migrations not yet
  on the live DB), always put the **full runnable SQL in one or more copy-paste boxes** in the
  final user message (and under `.lovable/sql/` or `/opt/cursor/artifacts/*.sql`). Prefer two
  short runs over one huge script when Lovable’s SQL Editor errors. Do not only link migration
  filenames. Never ask the user to paste secrets (service role key) into SQL.
- Auth/write model: server functions guarded by `requireSupabaseAuth`
  (`src/integrations/supabase/auth-middleware.ts`) build a **user-scoped** client from the
  anon `SUPABASE_PUBLISHABLE_KEY` + the caller's JWT, so RLS-scoped reads/writes (e.g.
  `saveSite`) work with just the anon key + a logged-in session — no service role. The
  service-role `supabaseAdmin` (`client.server.ts`) is only for RLS-bypass admin ops. The
  live app also publishes its public Supabase `url` + anon key on `window.__MM_PUBLIC__`
  (SSR boot script), never the service role.

**Git / PR merge policy (agents):**

- Never merge a PR that is `CONFLICTING` / `DIRTY`, or that needs a conflict-resolution merge
  commit into `main`. Rebase the feature branch onto latest `main` until it is a clean
  fast-forward or a clean merge with **no** conflict markers to hand-resolve.
- Prefer `git revert` (new commit) over force-push when undoing a bad merge already on `main`.
- Do not combine unrelated mainline features by “resolving both sides” during a conflicted
  merge — that is how duplicate locale keys and mixed copy land on `main`.
