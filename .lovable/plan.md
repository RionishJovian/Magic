# Magic Dude AI Chatbot

Turn the existing **Magic Dude** page from a three-button "safe check" into a real conversational assistant that can read live fleet data, scoped to whoever is asking.

## What you get

A chat panel on Operations → Magic Dude:

- Ask anything in plain language — "why can't guests log in at Shwe Cafe?", "how many vouchers are unused?", "what does this syslog line mean?", "write me a script to limit YouTube on the guest profile".
- The assistant answers from **your own live data**: your routers, sites, sessions, vouchers, syslog, device health, incidents. It never sees another tenant's anything.
- Answers stream in as it thinks, with a visible "thinking" trace and a stop button.
- Conversations are saved per user, with a thread list on the left so you can come back to a past troubleshooting session.
- Markdown output — tables, bullet lists, and copyable RouterOS command blocks.

**Read-only.** The chatbot never reboots a router, pushes config, bans a MAC, or creates a voucher. It can *write the command for you to run* in Terminal, but the action stays on its owning page. This keeps the existing audit trail honest and avoids a whole class of blast-radius risk.

## Access

- Visible to **all roles including client**, reusing the current Magic Dude unlock gate exactly as-is: Primary / Developer / Agent are exempt; a User account unlocks with 5 Magic Coins for 30 days. Trial and expired accounts stay locked.
- Every data lookup runs through the caller's own authenticated session, so RLS decides what the model can see. Agents see their own clients, clients see only themselves.

## Cost control

Reuses the existing AI usage tracking (`ai_usage_events`) and adds a per-account daily message cap so a runaway chat can't drain credits. Cap is configurable per tier.

---

## Technical section

### Dependencies
Add `ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `react-markdown`. Model: `openai/gpt-5.6-sol` on the Lovable AI Gateway **Responses API** (`/v1/responses`), streaming, `forceReasoning: true`, `reasoningEffort: "medium"`, `reasoningSummary: "auto"`, `store: false`, `include: ["reasoning.encrypted_content"]`.

### Database (one migration)
- `magic_dude_threads` — `id`, `user_id`, `owner_id`, `title`, `created_at`, `updated_at`.
- `magic_dude_messages` — `id`, `thread_id`, `role`, `parts` (jsonb, stores UIMessage parts verbatim including tool calls), `created_at`.
- RLS: owner-scoped SELECT/INSERT/UPDATE/DELETE on `auth.uid() = user_id` (threads) and via thread ownership (messages). `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;` on both. No `anon` grant.
- Small `magic_dude_chat_usage` counter table (`user_id`, `day`, `messages`) for the daily cap, same RLS shape.

### Server route
`src/routes/api/chat.ts` — `createFileRoute("/api/chat")` with a POST handler:
1. Verify the bearer token and build a user-scoped Supabase client (same path `requireSupabaseAuth` uses; the route re-implements the header read since routes don't take server-fn middleware).
2. Re-run `getMagicDudeAccess` (extracted from `magic-dude.functions.ts` into `magic-dude-access.server.ts` so both the server fn and the route share it). 403 if locked.
3. Check + increment the daily cap. 429 with a clear message if exceeded.
4. `streamText` with the tool set below, `stopWhen: stepCountIs(50)`, `abortSignal: request.signal`.
5. Persist the assistant message via `onFinish`; return `toUIMessageStreamResponse({ sendReasoning: true })`.

### Tools (`src/lib/magic-dude/tools/*.ts`)
All read-only, all take the caller's `supabase` client via closure, all zod-schema'd and strict-compatible (every property required, optionals `.nullable()`, no defaults):

| Tool | Backs onto |
| --- | --- |
| `list_routers` | existing `src/lib/mcp/tools/list-routers.ts` |
| `get_router_reachability` | existing MCP tool |
| `list_active_users` | existing MCP tool |
| `list_vouchers` / `voucher_stats` | existing MCP tool + `voucher_codes` |
| `get_portal_settings` | existing MCP tool |
| `search_syslog` | `syslog_events`, bounded window + limit |
| `list_incidents` | `incidents` |
| `get_device_health` | `device_health_samples` |
| `get_revenue_summary` | `voucher_sales` / `payment_orders` |
| `routeros_reference` | static lookup over `magic-dude-ros-knowledge.ts` |

Every tool caps rows (default 50) and strips secrets — never returns `password_ciphertext`, tokens, or connector credentials. Shared redaction helper enforces this in one place.

### System prompt
Built per-request from `magic-dude-persona.ts` + `magic-dude-ros-knowledge.ts`, plus the caller's role, tier, router count, and language preference (EN / Burmese / Chinese from the existing i18n setting). States plainly: read-only, never claims to have made a change, always names which router a finding came from.

### UI
- `src/components/magic-dude/ChatPanel.tsx` — `useChat` with `DefaultChatTransport({ api: "/api/chat" })`, keyed by `threadId`; renders `message.parts` (text via `react-markdown`, reasoning in a collapsible, tool calls as compact activity chips).
- `src/components/magic-dude/ThreadList.tsx` — list/create/rename/delete via new server fns in `magic-dude-chat.functions.ts`.
- Route becomes `app.magic-dude.$threadId.tsx` under `_authenticated`, with `app.magic-dude.tsx` as the layout that renders the thread list + `<Outlet />` and redirects `/app/magic-dude` to the newest or a fresh thread. The existing three-topic safe-check stays as quick-start prompt chips that seed the first message.
- Reuses the existing lock screen and unlock purchase flow unchanged.

### Errors
Gateway status handling per contract: 402 → "AI credits exhausted, the app owner needs to top up"; 403 → blocked-by-policy message; 429 → back off with `Retry-After`; 400/401 → surfaced as a configuration error, never retried. All shown in the chat surface, never swallowed into a fake assistant reply.

### Tests
- Tool tenant isolation: each tool called as tenant A cannot return tenant B's rows.
- Locked account (trial / expired / no unlock) gets 403 from `/api/chat`.
- Daily cap returns 429 past the limit.
- Redaction: no tool output contains ciphertext or token columns.
- Thread/message RLS: user A cannot read user B's threads.

### Not touched
No changes to routers, vouchers, portal deploy, connector, payments, or any existing write path. No new write capability anywhere.
