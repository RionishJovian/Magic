# Agent role and Magic Point commissions

Add a new "Agent" account role that can register new users for the app, with owner approval gating activation, plus a Magic Point commission dashboard for agents.

## Roles and account states

- New role: **agent**. Agent accounts never expire and get every normal user feature, minus User management and minus their own account-creation limits — plus one extra tab: **Magic Points**.
- Agents can create new user accounts. Those accounts start as **pending**: they can open every page and read data, but all writes are blocked (same read-only enforcement already used for expired accounts).
- Status pill on an account:
  - Blue "Pending approval" — created by an agent, not yet approved.
  - Green "Active" — owner approved; the account becomes a normal client with the usual 1-month window.
- Every account created by an agent stores the agent's id, so the owner sees "Created by <agent>" in User management and commissions can be attributed.

## Owner approvals

- User management gains a **Pending approvals** section listing agent-created accounts with the agent's name, created date, and Approve / Reject actions.
- Approving flips the account to active client (30-day window) and awards the agent 20 Magic Points.
- Rejecting removes the pending account and awards nothing.
- Owner gets a notification (existing bell system) whenever an agent creates an account.

## Magic Points

- Currency name shown everywhere: **Magic Point** (e.g. "240 Magic Points").
- Earning rules:
  - **20 Magic Points** when the owner approves an agent-created account for the first time.
  - **10 Magic Points** every time the owner renews / reactivates one of that agent's referred accounts for another month.
- Points are recorded as immutable ledger rows (agent, referred account, reason, amount, date) so the totals are auditable and never double-counted.
- New **Magic Points** tab for agents: lifetime total, this-month total, count of accounts referred vs approved, and a table of every point event. Owner sees the same view across all agents, with a per-agent breakdown.

## Access rules summary

| Capability               | Owner/Admin      | Agent         | Pending            | Client  | Expired |
| ------------------------ | ---------------- | ------------- | ------------------ | ------- | ------- |
| User management          | yes              | no            | no                 | no      | no      |
| Create user accounts     | yes              | yes (pending) | no                 | no      | no      |
| Magic Points tab         | yes (all agents) | yes (own)     | no                 | no      | no      |
| Write actions across app | yes              | yes           | no (read-only)     | yes     | no      |
| Account expiry           | none             | none          | n/a until approved | 1 month | expired |

## Technical notes

- Migration: add `agent` and `pending` to the `app_role` enum; add `created_by_agent uuid` to `user_roles` (or a small `account_referrals` table) so the agent link survives role changes; new `agent_points` ledger table (`agent_id`, `referred_user_id`, `kind` = signup | renewal, `points`, `created_at`) with GRANTs, RLS (agents read own rows, owner reads all, inserts server-side only) and a unique constraint preventing duplicate signup awards.
- Update `handle_new_user` / expiry trigger logic so `agent` and `pending` never get an `expires_at`, and the expiry cron skips them.
- Server functions in `src/lib/users.functions.ts`: `createAgentUser` (agent-callable, creates pending account), `approvePendingUser` / `rejectPendingUser` (owner-only, awards 20 points), and extend `activateAppUser` / renewal path to award 10 points when the target has a referring agent.
- New `src/lib/agent-points.functions.ts` for ledger reads (own vs all-agents).
- Extend `src/lib/guards.server.ts`: `pending` behaves like `expired` for writes but keeps full read access; `agent` counts as a normal user for quotas and is exempt from expiry.
- UI: new route `src/routes/_authenticated/app.agent.tsx` (Magic Points), nav entry in `app.tsx` gated to agent/owner, pending-approval section + status pills + "Created by" column in `app.users.tsx`, and a read-only banner for pending accounts.
- i18n: feature/tab names and descriptions get zh/my entries; all action buttons stay English per existing rules.
