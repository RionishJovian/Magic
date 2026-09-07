import { createFileRoute } from "@tanstack/react-router";

type TelegramCallback = {
  id: string;
  data?: string;
  message?: { chat?: { id?: string | number } };
  from?: { id?: string | number };
};

function callbackOf(value: unknown): TelegramCallback | null {
  if (!value || typeof value !== "object" || !("callback_query" in value)) return null;
  const callback = value.callback_query;
  if (!callback || typeof callback !== "object" || !("id" in callback)) return null;
  const id = callback.id;
  if (typeof id !== "string") return null;
  return callback as TelegramCallback;
}

/**
 * Telegram inline approve/reject callbacks.
 *
 * Three independent gates before anything is written:
 *  1. the webhook shared secret header (derived from the bot token),
 *  2. the chat id must be the configured owner chat (actor binding),
 *  3. the one-time review token must exist, be unexpired and unused.
 *
 * Approval then goes through the same review state machine as the web page,
 * so a replayed callback can never issue a second voucher.
 */
export const Route = createFileRoute("/api/public/hooks/telegram/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const {
          telegramConfigured,
          telegramWebhookSecret,
          answerCallback,
          sendOwnerMessage,
          ownerChatId,
        } = await import("@/lib/notify/telegram.server");
        if (!telegramConfigured())
          return Response.json({ error: "not_configured" }, { status: 404 });

        const expected = await telegramWebhookSecret();
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!expected || got !== expected) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        const update: unknown = await request.json().catch(() => null);
        const cb = callbackOf(update);
        if (!cb) return Response.json({ ok: true, ignored: true });
        if (!cb?.data) return Response.json({ ok: true, ignored: true });

        const fromChat = String(cb.message?.chat?.id ?? cb.from?.id ?? "");
        if (fromChat !== ownerChatId()) {
          await answerCallback(cb.id, "Not allowed.");
          return Response.json({ ok: true, ignored: true });
        }

        // Tier Pass service purchases carry a signed, self-contained payload.
        {
          const { purchaseSigningMaterial } = await import("@/lib/notify/telegram.server");
          const { parsePurchaseCallback } = await import("@/lib/notify/purchase-tokens");
          const parsed = await parsePurchaseCallback(String(cb.data), purchaseSigningMaterial());
          if (parsed) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { TENANT_PRIMARY_ROLE } = await import("@/lib/app-role");
            const [{ data: platform }, { data: owners }] = await Promise.all([
              supabaseAdmin.from("platform_admins").select("user_id").limit(1),
              supabaseAdmin
                .from("user_roles")
                .select("user_id")
                .eq("role", TENANT_PRIMARY_ROLE)
                .limit(1),
            ]);
            const actorUserId = ((platform ?? [])[0]?.user_id ?? (owners ?? [])[0]?.user_id) as
              string | undefined;
            if (!actorUserId) {
              await answerCallback(cb.id, "No reviewer account configured.");
              return Response.json({ ok: true, outcome: "no_reviewer" });
            }
            const scope = { userId: actorUserId, tenantId: actorUserId, isPlatformAdmin: true };
            const { accountLabel } = await import("@/lib/services/account-label.server");
            try {
              if (parsed.action === "approve") {
                const { approvePurchase } = await import("@/lib/services/purchase-review.server");
                const r = await approvePurchase(supabaseAdmin, {
                  purchaseId: parsed.purchaseId,
                  actorUserId,
                  scope,
                  channel: "telegram",
                });
                const who = await accountLabel(supabaseAdmin, r.purchase.user_id);
                await answerCallback(
                  cb.id,
                  r.activation
                    ? `Approved — ${r.purchase.service_label} activated for ${who}.`
                    : `Approved — ${r.purchase.service_label} credited to ${who}.`,
                );
                await sendOwnerMessage(`${who} — approved (${r.purchase.service_label}).`);
              } else {
                const { rejectPurchase } = await import("@/lib/services/purchase-review.server");
                const r = await rejectPurchase(supabaseAdmin, {
                  purchaseId: parsed.purchaseId,
                  actorUserId,
                  scope,
                  channel: "telegram",
                  reason: "Rejected from Telegram",
                });
                const who = await accountLabel(supabaseAdmin, r.purchase.user_id);
                await answerCallback(cb.id, `Rejected — nothing was activated for ${who}.`);
                await sendOwnerMessage(`${who} — rejected (${r.purchase.service_label}).`);
              }
              return Response.json({ ok: true, outcome: parsed.action });
            } catch (e) {
              console.error(
                `Telegram purchase ${parsed.action} failed:`,
                e instanceof Error ? `${e.message}\n${e.stack}` : e,
              );
              await answerCallback(
                cb.id,
                e instanceof Error ? e.message : "Could not apply that decision.",
              );
              return Response.json({ ok: true, outcome: "not_pending" });
            }
          }
        }

        const [prefix, token] = String(cb.data).split(":");
        const decision = prefix === "ok" ? "approve" : prefix === "no" ? "reject" : null;
        if (!decision || !token) return Response.json({ ok: true, ignored: true });

        const { hashToken, checkToken, applyReview } = await import("@/lib/payments/review");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const hash = await hashToken(token);

        const { data: row } = await supabaseAdmin
          .from("payment_review_tokens")
          .select("id, order_id, owner_id, receipt_id, actor_ref, expires_at, used_at")
          .eq("token_hash", hash)
          .maybeSingle();

        const verdict = checkToken(row as never, { actor: fromChat });
        if (!verdict.ok) {
          await answerCallback(cb.id, `This action is no longer valid (${verdict.reason}).`);
          return Response.json({ ok: true, outcome: verdict.reason });
        }

        // Replay protection: claim the token before doing any work.
        const { data: claimed } = await supabaseAdmin
          .from("payment_review_tokens")
          .update({ used_at: new Date().toISOString(), used_action: decision })
          .eq("id", row!.id)
          .is("used_at", null)
          .select("id")
          .maybeSingle();
        if (!claimed) {
          await answerCallback(cb.id, "Already handled.");
          return Response.json({ ok: true, outcome: "replay" });
        }

        const { createReviewStore } = await import("@/lib/payments/orders.server");
        const result = await applyReview(createReviewStore(supabaseAdmin, { serviceRole: true }), {
          orderId: row!.order_id,
          ownerId: row!.owner_id,
          receiptId: row!.receipt_id,
          tokenId: row!.id,
          decision,
          actor: "telegram",
          reason: decision === "reject" ? "Rejected from Telegram" : null,
        });

        const confirm =
          result.outcome === "approved"
            ? `Approved. Voucher issued${result.code ? `: ${result.code}` : ""}.`
            : result.outcome === "already_approved"
              ? "Already approved earlier."
              : result.outcome === "rejected"
                ? "Rejected. The guest can submit a new receipt."
                : `No change (${result.outcome}).`;
        await answerCallback(cb.id, confirm);
        await sendOwnerMessage(`Order ${row!.order_id.slice(0, 8)} — ${confirm}`);
        return Response.json({ ok: true, outcome: result.outcome });
      },
    },
  },
});
