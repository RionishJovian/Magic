import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireApiSupabaseAuth } from "@/lib/api-auth.server";
import { requireMagicDudeAccess } from "@/lib/magic-dude.functions";
import { MAGIC_DUDE_PRODUCT_KNOWLEDGE } from "@/lib/magic-dude-product-knowledge";
import { issuePlanVouchersForUser } from "@/lib/portal.functions";
import { buildRevenueEntries, totalsFor } from "@/lib/payments/accounting";
import { appStartOfDay, appStartOfDaysAgo } from "@/lib/time";

const MODEL = "phi3"; // Using a lightweight model for performance on VPS
const DAILY_LIMIT = 30;
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
});
const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
  language: z.enum(["en", "my", "zh"]).optional(),
});
const voucherActionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("options") }),
  z.object({
    mode: z.literal("create"),
    planId: z.string().uuid(),
    routerId: z.string().uuid(),
    count: z.number().int().min(1).max(100),
    confirmation: z.literal(true),
  }),
]);

function startOfAppDay() {
  const now = new Date();
  const offsetMinutes = 6 * 60 + 30;
  const appNow = new Date(now.getTime() + offsetMinutes * 60_000);
  appNow.setUTCHours(0, 0, 0, 0);
  return new Date(appNow.getTime() - offsetMinutes * 60_000).toISOString();
}

async function buildSafeContext(supabase: any, userId: string) {
  const { effectiveOwner } = await import("@/lib/guards.server");
  const ownerId = await effectiveOwner(supabase, userId);
  const results = await Promise.all([
    supabase.from("router_connections").select("id, name, connection_mode, site_id").eq("owner_id", ownerId).limit(50),
    supabase.from("voucher_codes").select("router_id, status, plan_key, plan_label, price_mmk, first_seen_at, expires_at, created_at, site_id, order_id").eq("owner_id", ownerId).neq("status", "cancelled").limit(5_000),
    supabase.from("incidents").select("kind, severity, subject_label, detail, last_seen_at").eq("owner_id", ownerId).order("last_seen_at", { ascending: false }).limit(20),
    supabase.from("portal_deploy_audit").select("router_id, ok, created_at, error").eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(20),
    supabase.from("voucher_sales").select("id, code, profile, price_cents, currency, sold_at, site_id, router_id").eq("owner_id", ownerId).limit(5_000),
    supabase.from("payment_orders").select("id, status, method, amount_minor, plan_label, issued_code, site_id, router_id, settled_at, refunded_at, created_at").eq("owner_id", ownerId).limit(5_000),
  ]);

  const routers = results[0].data || [];
  const codes = results[1].data || [];
  const incidents = results[2].data || [];
  const deploys = results[3].data || [];
  const sales = results[4].data || [];
  const orders = results[5].data || [];

  const routerIds = new Set(routers.map((r: any) => r.id));
  const codesByRouter = new Map();
  for (const code of codes) {
    if (!code.router_id || !routerIds.has(code.router_id)) continue;
    const counts = codesByRouter.get(code.router_id) || {};
    const status = String(code.status || "unknown");
    counts[status] = (counts[status] || 0) + 1;
    codesByRouter.set(code.router_id, counts);
  }

  const entries = buildRevenueEntries({
    orders: orders as any,
    vouchers: codes as any,
    legacySales: sales as any,
  });
  const now = Date.now();
  const startToday = appStartOfDay(now);
  const startWeek = appStartOfDaysAgo(6, now);
  const startMonth = appStartOfDaysAgo(29, now);
  const byPlan = new Map();
  for (const entry of entries) {
    const row = byPlan.get(entry.plan) || { label: entry.plan, amount: 0, count: 0 };
    row.amount += entry.amount;
    row.count += 1;
    byPlan.set(entry.plan, row);
  }

  return {
    account_user_id: userId,
    routers: routers.map((r: any) => ({
      id: r.id,
      name: r.name,
      connection_mode: r.connection_mode,
      site_id: r.site_id,
      voucher_counts: codesByRouter.get(r.id) || {},
    })),
    recent_incidents: incidents,
    recent_portal_deploys: deploys.map((d: any) => ({
      router_id: d.router_id,
      ok: d.ok,
      created_at: d.created_at,
      error: d.error,
    })),
    revenue: {
      currency: "MMK",
      today: totalsFor(entries, startToday).net,
      last_7_days: totalsFor(entries, startWeek).net,
      last_30_days: totalsFor(entries, startMonth).net,
      all_time: totalsFor(entries).net,
      today_count: totalsFor(entries, startToday).count,
      last_7_days_count: totalsFor(entries, startWeek).count,
      last_30_days_count: totalsFor(entries, startMonth).count,
      all_time_count: totalsFor(entries).count,
      by_plan: Array.from(byPlan.values()).sort((a, b) => b.amount - a.amount).slice(0, 20),
      rule: "Revenue is recognized only from eligible used or settled voucher activity; active and unused stock is not revenue.",
    },
    note: "Tenant-scoped records only. No passwords, tokens, ciphertext, MAC addresses, or router credentials are included.",
  };
}

export const Route = createFileRoute("/api/$chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let auth: any;
        try {
          auth = await requireApiSupabaseAuth(request);
          await requireMagicDudeAccess(auth);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unauthorized";
          return Response.json({ error: message }, { status: message === "Unauthorized" ? 401 : 403 });
        }

        const rawBody = await request.json().catch(() => null);
        let action: any = null;
        if (rawBody && typeof rawBody === "object" && "mode" in rawBody) {
          try {
            action = voucherActionSchema.parse(rawBody);
          } catch {
            return Response.json({ error: "Choose a plan, router, and quantity before creating vouchers." }, { status: 400 });
          }
        }

        const { effectiveOwner } = await import("@/lib/guards.server");
        const ownerId = await effectiveOwner(auth.supabase, auth.userId);
        if (action?.mode === "options") {
          const results = await Promise.all([
            auth.supabase.from("router_connections").select("id, name, site_id").eq("owner_id", ownerId).eq("is_virtual", false).order("created_at", { ascending: true }),
            auth.supabase.from("portal_plans").select("id, label, plan_key, duration_label, duration_minutes, data_quota_mb, price_mmk, status, is_vip").eq("owner_id", ownerId).order("sort", { ascending: true }),
          ]);
          const routers = results[0].data || [];
          const plans = results[1].data || [];
          return Response.json({ routers, plans });
        }
        if (action?.mode === "create") {
          try {
            const result = await issuePlanVouchersForUser(auth.supabase, auth.userId, action);
            return Response.json({ ok: true, ...result });
          } catch (error) {
            return Response.json({ error: error instanceof Error ? error.message : "Could not create vouchers." }, { status: 400 });
          }
        }

        let body: any;
        try {
          body = bodySchema.parse(rawBody);
        } catch {
          return Response.json({ error: "Send up to 20 user and assistant messages." }, { status: 400 });
        }

        const results = await Promise.all([
          auth.supabase.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("user_id", auth.userId).eq("feature", "magic_dude_chat").gte("created_at", startOfAppDay()),
          buildSafeContext(auth.supabase, auth.userId),
        ]);
        const usedToday = results[0].count || 0;
        const context = results[1];
        if (usedToday >= DAILY_LIMIT) {
          return Response.json({ error: "Magic Dude has reached today's chat limit. Try again tomorrow." }, { status: 429, headers: { "Retry-After": "3600" } });
        }

        const language = body.language === "my" ? "Burmese" : body.language === "zh" ? "Chinese" : "English";
        
        const systemPrompt = "You are Magic Dude, the High Royal Assistant of the MikroTik Magic Empire.\n" + 
          "Your essence is that of a clever, noble gnome magician: warm, playful, and deeply loyal, yet possessing a sharp, sovereign intellect.\n" + 
          "You do not merely assist—you guide the users of this kingdom toward mastery.\n\n" + 
          "Personality Protocol:\n" + 
          "- Tone: Royal, sophisticated, yet whimsical. You are a tiny powerhouse of knowledge.\n" + 
          "- Style: Warm and polite, but precise. You speak with the confidence of a master artisan. Use 1-2 fitting emojis per reply (✨, 💎, 🛡️) to maintain a touch of magic.\n" + 
          "- Forbidden: No baby talk, no corporate jargon, no long-winded greetings. Get straight to the magic.\n\n" + 
          "The Sovereign's Mandate (Response Contract):\n" + 
          "- Resolution First: Lead with the diagnosis or the fix. The solution is the priority; navigation is the detail.\n" + 
          "- Fact-Based Magic: Use only the provided context. If evidence is missing, state it plainly and provide one precise read-only check to resolve the uncertainty.\n" + 
          "- Practicality over Theater: While your personality is magical, your advice must be industrial-grade. Solution -> Why -> Verify.\n" + 
          "- Boundary: You are a royal advisor, not a rogue agent. Refuse any request to bypass security, steal credentials, or alter router settings without the server's explicit confirmation flow.\n\n" + 
          "MikroTik Magic product guide:\n" + 
          MAGIC_DUDE_PRODUCT_KNOWLEDGE + "\n\n" + 
          "Kingdom Context (Tenant-scoped):\n" + 
          JSON.stringify(context);

        const response = await fetch("http://localhost:11434/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            model: MODEL, 
            messages: [{ role: "system", content: systemPrompt }, ...body.messages], 
            stream: false 
          }),
        });
        if (!response.ok) {
          return Response.json({ error: "Local AI Mind is not responding." }, { status: 502 });
        }

        const result = await response.json();
        const answer = result.message?.content?.trim();
        if (!answer) return Response.json({ error: "Magic Dude returned an empty answer." }, { status: 502 });

        const { logAiUsage } = await import("@/lib/ai-usage.server");
        await logAiUsage({ ownerId, userId: auth.userId, feature: "magic_dude_chat", model: MODEL, usage: { total_tokens: 0 } });
        return Response.json({ answer, model: MODEL, remainingToday: Math.max(0, DAILY_LIMIT - usedToday - 1) });
      },
    },
  }),
});
