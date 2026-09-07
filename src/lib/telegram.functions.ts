import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Owner/admin Telegram setup actions. Clients cannot link Telegram. Secrets
 * stay on the server: the browser only ever learns whether things are
 * configured, the bot username, and a masked owner chat id.
 */

async function audit(
  ownerId: string,
  actorUserId: string,
  action: string,
  outcome: string,
  detail?: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("notifier_audit").insert({
    owner_id: ownerId,
    actor_user_id: actorUserId,
    channel: "telegram",
    action,
    outcome,
    detail: detail ? detail.slice(0, 400) : null,
  });
}

export const telegramSetupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePrivileged } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);

    const { telegramConfigured, ownerChatId, getBotIdentity, getWebhookInfoSafe } =
      await import("./notify/telegram.server");
    const { maskChatId, validatePublicBaseUrl, callbackUrlFor } = await import("./notify/setup");

    const configured = telegramConfigured();
    const verdict = validatePublicBaseUrl(process.env["PUBLIC_APP_URL"]);

    if (!configured) {
      return {
        configured: false,
        bot_username: null as string | null,
        chat_id_masked: "",
        webhook: null as Awaited<ReturnType<typeof getWebhookInfoSafe>> | null,
        expected_callback_url: verdict.ok ? verdict.url! : null,
        public_url_ok: verdict.ok,
        public_url_reason: verdict.reason ?? null,
        suggested_callback_url: callbackUrlFor("https://mikromagic.app"),
        hint: "Connect the Telegram connector and add TELEGRAM_OWNER_CHAT_ID in Project Settings → Secrets. Web review keeps working meanwhile.",
      };
    }

    const [identity, webhook] = await Promise.all([getBotIdentity(), getWebhookInfoSafe()]);
    return {
      configured: true,
      bot_username: identity.username,
      chat_id_masked: maskChatId(ownerChatId()),
      webhook,
      expected_callback_url: verdict.ok ? verdict.url! : null,
      public_url_ok: verdict.ok,
      public_url_reason: verdict.reason ?? null,
      suggested_callback_url: callbackUrlFor("https://mikromagic.app"),
      hint: identity.ok
        ? "Telegram approvals are active."
        : "Telegram rejected the bot credentials. Reconnect the Telegram connector.",
    };
  });

export const registerTelegramWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePrivileged, effectiveOwner } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);
    const owner = await effectiveOwner(context.supabase, context.userId);

    const { telegramConfigured, registerWebhook } = await import("./notify/telegram.server");
    const { validatePublicBaseUrl, callbackUrlFor } = await import("./notify/setup");

    if (!telegramConfigured()) {
      await audit(owner, context.userId, "webhook_register", "blocked", "secrets_missing");
      throw new Error(
        "Telegram is not configured. Connect the Telegram connector and set TELEGRAM_OWNER_CHAT_ID first.",
      );
    }

    const verdict = validatePublicBaseUrl(process.env["PUBLIC_APP_URL"]);
    if (!verdict.ok) {
      await audit(owner, context.userId, "webhook_register", "blocked", verdict.reason);
      throw new Error(
        `No canonical public URL is configured, so nothing was registered. Set PUBLIC_APP_URL in Project Settings → Secrets to your production origin, then register ${callbackUrlFor("https://mikromagic.app")}.`,
      );
    }

    const result = await registerWebhook(verdict.url!);
    await audit(
      owner,
      context.userId,
      "webhook_register",
      result.ok ? "ok" : "failed",
      result.ok ? verdict.url : result.error,
    );
    if (!result.ok) throw new Error(`Telegram rejected the webhook: ${result.error}`);
    return { ok: true, url: verdict.url! };
  });

export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ confirm: z.literal(true) }).parse(raw))
  .handler(async ({ context }) => {
    const { requirePrivileged, effectiveOwner } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);
    const owner = await effectiveOwner(context.supabase, context.userId);

    const { telegramConfigured, sendTestMessage } = await import("./notify/telegram.server");
    const { isTestRateLimited, TEST_LIMIT } = await import("./notify/setup");

    if (!telegramConfigured()) {
      throw new Error("Telegram is not configured, so no test message was sent.");
    }

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await context.supabase
      .from("notifier_audit")
      .select("created_at")
      .eq("action", "test_notification")
      .gte("created_at", since);

    if (isTestRateLimited((recent ?? []) as Array<{ created_at: string }>)) {
      await audit(owner, context.userId, "test_notification", "rate_limited");
      throw new Error(`Only ${TEST_LIMIT} test messages per hour. Try again later.`);
    }

    const ok = await sendTestMessage();
    await audit(owner, context.userId, "test_notification", ok ? "ok" : "failed");
    if (!ok)
      throw new Error("Telegram did not accept the test message. Check the bot and chat id.");
    return { ok: true };
  });

export const listNotifierAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePrivileged } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("notifier_audit")
      .select("id, action, outcome, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
