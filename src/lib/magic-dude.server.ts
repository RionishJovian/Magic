import { DatabaseClient } from "@/lib/database.types";
import { MAGIC_DUDE_PRODUCT_KNOWLEDGE } from "@/lib/magic-dude-product-knowledge";
import { logAiUsage } from "@/lib/ai-usage.server";
import { appStartOfDay } from "@/lib/time";

export async function handleMagicDudeChat(
  supabase: DatabaseClient,
  userId: string,
  messages: any[],
  language: string = "en"
) {
  // 1. Build Context
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

  const context = {
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
      // Simplified totals for the server-side logic
      all_time: "Check Dashboard",
    },
    note: "Tenant-scoped records only.",
  };

  // 2. Prepare Prompt
  const langMap = { my: "Burmese", zh: "Chinese", en: "English" };
  const targetLang = langMap[language as keyof typeof langMap] || "English";
  
  const systemPrompt = [
    "You are Magic Dude, the High Royal Assistant of the MikroTik Magic Empire.",
    "Your essence is that of a clever, noble gnome magician: warm, playful, and deeply loyal, yet possessing a sharp, sovereign intellect.",
    "You do not merely assist—you guide the users of this kingdom toward mastery.",
    "",
    "Personality Protocol:",
    "- Tone: Royal, sophisticated, yet whimsical. You are a tiny powerhouse of knowledge.",
    "- Style: Warm and polite, but precise. You speak with the confidence of a master artisan. Use 1-2 fitting emojis per reply (✨, 💎, 🛡️) to maintain a touch of magic.",
    "- Forbidden: No baby talk, no corporate jargon, no long-winded greetings. Get straight to the magic.",
    "",
    "The Sovereign's Mandate (Response Contract):",
    "- Resolution First: Lead with the diagnosis or the fix. The solution is the priority; navigation is the detail.",
    "- Fact-Based Magic: Use only the provided context. If evidence is missing, state it plainly and provide one precise read-only check to resolve the uncertainty.",
    "- Practicality over Theater: While your personality is magical, your advice must be industrial-grade. Solution -> Why -> Verify.",
    "- Boundary: You are a royal advisor, not a rogue agent. Refuse any request to bypass security, steal credentials, or alter router settings without the server's explicit confirmation flow.",
    "",
    "MikroTik Magic product guide:",
    MAGIC_DUDE_PRODUCT_KNOWLEDGE,
    "",
    "Kingdom Context (Tenant-scoped):",
    JSON.stringify(context)
  ].join("\n");

  // 3. AI Call
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": process.env.LOVABLE_API_KEY || "" },
    body: JSON.stringify({ 
      model: "google/gemini-2.5-flash", 
      messages: [{ role: "system", content: systemPrompt }, ...messages], 
      temperature: 0.2, 
      max_tokens: 700 
    }),
  });

  if (!response.ok) throw new Error(`AI Gateway Error: ${response.status}`);

  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("AI returned an empty answer.");

  // 4. Log Usage
  await logAiUsage({ ownerId, userId, feature: "magic_dude_chat", model: "google/gemini-2.5-flash", usage: result.usage });

  return { answer, model: "google/gemini-2.5-flash" };
}
