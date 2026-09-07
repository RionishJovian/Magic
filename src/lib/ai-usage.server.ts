// Server-only recorder for AI Gateway calls so owners can see exactly which
// account and which feature is burning Lovable credits.

export type AiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export async function logAiUsage(opts: {
  ownerId: string;
  userId: string;
  feature: string;
  model: string;
  usage?: AiUsage | null;
  cached?: boolean;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_usage_events").insert({
      owner_id: opts.ownerId,
      user_id: opts.userId,
      feature: opts.feature,
      model: opts.model,
      prompt_tokens: opts.usage?.prompt_tokens ?? 0,
      completion_tokens: opts.usage?.completion_tokens ?? 0,
      total_tokens:
        opts.usage?.total_tokens ??
        (opts.usage?.prompt_tokens ?? 0) + (opts.usage?.completion_tokens ?? 0),
      cached: opts.cached ?? false,
    });
  } catch (e) {
    console.error("[ai-usage] failed to record usage", e);
  }
}
