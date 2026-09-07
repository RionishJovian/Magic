# MikroTik Magic — Product Requirements (from the two workflow diagrams)

Treat the two diagrams below as the final, authoritative requirements. Codex has full implementation and audit permission — the earlier "product-context only, no code changes" restriction is removed.

---

## Diagram 1 — Voucher-Only Workflow (MikroTik Magic)

Two sides: Operator/Admin (blue) and Guest (green). The flow is linear; the guest never selects a plan.

### Operator / Admin side

1. **Create Plan Templates** — set duration, speed, data limit, device limit, etc.
2. **Generate Vouchers** — bulk-create voucher codes for each plan.
3. **Bind Voucher to HotSpot Profile** — each plan is linked to a RouterOS HotSpot profile.
4. **Deploy / Sync to Router** — MikroTik Magic deploys users, profiles and voucher data to the router.
5. **Router Ready** — router has portal and voucher data; ready for guests.

### Guest side (NO plan selection)

1. **Connect to Wi-Fi** — guest connects to the hotspot SSID.
2. **Captive Portal Opens** — the login page is shown automatically.
3. **Enter Voucher Code** — guest enters the voucher code only and clicks "Login".
4. **Router Validates Code** — router checks the voucher code in its database.
   - **Valid code →** 5A. Access Granted: internet access provided based on the voucher plan/profile.
   - **Invalid / Expired code →** 5B. Access Denied: access denied and an error message shown.

**Guest experience rule:** Connect → Enter voucher code → Get access. No plan selection. Just a simple voucher login.

---

## Diagram 2 — Magic Points (Agent Commission) Workflow

### Topic 1: Linear workflow

1. **Agent Registration** — agent registers in MikroTik Magic and gets a unique Agent ID.
2. **Agent Registers Client** — agent invites/registers a new client under them using their Agent ID.
3. **Client Uses MikroTik Magic** — client manages routers, hotspot and other features.
4. **Client Orders Tier Pass** — client selects a Tier Pass (Emerald / Sapphire) and places an order.
5. **Upload Payment Receipt** — client uploads the bank-transfer receipt for the selected plan.
6. **Admin Reviews Order** — owner/admin reviews the order, receipt and payment details.
7. **Admin Approves or Rejects** — Approve → order completed; Reject → no points.
8. **Magic Points Awarded** — if approved, points awarded to the agent based on plan type and rules.
9. **Monthly Commission Report** — points and commission records stored and visible in monthly reports (3 months).

Key flow: Agent brings client → client buys Tier Pass → admin approves → points awarded to agent → monthly records & commission.

### Topic 2: Tier Pass & Points rules

| Tier Pass         | Plan Type | Points for Agent (order completed) | Renewal / repeat order (same client)                                  |
| ----------------- | --------- | ---------------------------------- | --------------------------------------------------------------------- |
| **Emerald Plan**  | Monthly   | **1.5 Magic Points**               | Renew next month → another 1.5 points. No renewal → 0 for that month. |
| **Sapphire Plan** | Annual    | **15 Magic Points**                | Renew annually → 15 points on completion. No renewal → 0.             |

Points awarded ONLY when order status is "Completed (Approved)". Pending, Rejected, Cancelled or Refunded = 0 points (or reversed if already awarded).

### Topic 3: Commission eligibility

- Points awarded only for paid Tier Pass orders that are Approved/Completed by admin.
- Manual Tier Pass granted by admin (no paid order) does NOT generate agent points by default.
- Points linked to the agent who registered the client — referral locked at first valid client registration.
- Duplicate orders for the same period are not eligible for additional points.
- If an order is cancelled or refunded, any awarded points are reversed.
- Guest voucher purchases/usage do NOT directly generate agent points. Points are based on client Tier Pass orders only.

### Topic 4: Record & data

- Every transaction references: Agent → Client → Order → Tier Pass → Points → Date → Status.
- Points recorded monthly.
- Agent reports cover the last 3 months (points, clients, orders, commissions).
- Records stored in app cloud securely for at least 3 months.
- Agents can view only their own clients, orders, points and reports.

### Status definitions

- **Pending** — receipt submitted, waiting for admin review. 0 points.
- **Approved / Completed** — payment verified, order completed. Points awarded.
- **Rejected** — payment invalid or order not approved. 0 points.
- **Cancelled** — order cancelled by client before approval. 0 points.
- **Refunded** — payment refunded after completion. Points reversed.

---

## Where today's app already matches the spec

- Agent role + referral lock via `account_referrals` (locked per client at first registration).
- Agent-only client creation (`agentCreateUser`), with 7-day default expiry and no owner approval.
- Agent-scoped ledger reads in `agents.functions.ts` (own rows only; owner/admin see all).
- Point ledger `agent_points` with agent + referred user + kind + points + note + date.
- Voucher plan/profile binding and router deploy/sync in `app.vouchers.tsx` and the portal deploy path.

## Where today's app diverges from the spec (context for Codex, not a build order)

- Points are a flat 15 per purchase (`PLAN_PURCHASE_POINTS = 15`, `kind = "renewal"`). Spec needs tier-aware: Emerald monthly = 1.5, Sapphire annual = 15; the `points` column must hold fractional values.
- Ledger rows do not store the order id or tier pass, so reversal on refund and duplicate-period blocking are not possible today.
- No refund/cancellation path reverses awarded points.
- Manual/admin-granted passes are not distinguished from paid approved orders in the award path.
- No 3-month agent commission report view.
- The live guest checkout (`/portal/checkout`) lets guests pick a plan and pay. The voucher-only diagram says guests must never choose a plan — resolve whether this checkout stays as a separate paid-voucher surface or is retired.

## Note

This document captures the diagrams as product requirements. No code changes are made here; Codex implements. Unrelated parts of the app are out of scope.
