import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type UsageRow = { key: string; calls: number; tokens: number };

export type UsageSummary = {
  days: number;
  totalCalls: number;
  totalTokens: number;
  estimatedCredits: number;
  byUser: UsageRow[];
  byFeature: UsageRow[];
  byDay: UsageRow[];
};

/** Rough conversion used for the dashboard estimate only. */
const CREDITS_PER_1K_TOKENS = 0.02;

export const aiUsageSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ days: z.number().int().min(1).max(90).default(30) }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }): Promise<UsageSummary> => {
    const g = await import("./guards.server");
    await g.requirePrivileged(context.supabase, context.userId);

    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("ai_usage_events")
      .select("user_id, feature, total_tokens, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    const events = (rows ?? []) as Array<{
      user_id: string;
      feature: string;
      total_tokens: number | null;
      created_at: string;
    }>;

    const ids = [...new Set(events.map((e) => e.user_id))];
    const profilesRes = ids.length
      ? await context.supabase.from("profiles").select("id, display_name, username").in("id", ids)
      : { data: [] };
    const names = new Map(
      (
        (profilesRes.data ?? []) as Array<{
          id: string;
          display_name: string | null;
          username: string | null;
        }>
      ).map((p) => [p.id, p.display_name ?? p.username ?? p.id.slice(0, 8)]),
    );

    const bucket = (map: Map<string, UsageRow>, key: string, tokens: number) => {
      const row = map.get(key) ?? { key, calls: 0, tokens: 0 };
      row.calls += 1;
      row.tokens += tokens;
      map.set(key, row);
    };

    const byUser = new Map<string, UsageRow>();
    const byFeature = new Map<string, UsageRow>();
    const byDay = new Map<string, UsageRow>();
    let totalTokens = 0;

    for (const e of events) {
      const tokens = e.total_tokens ?? 0;
      totalTokens += tokens;
      bucket(byUser, names.get(e.user_id) ?? e.user_id.slice(0, 8), tokens);
      bucket(byFeature, e.feature, tokens);
      bucket(byDay, e.created_at.slice(0, 10), tokens);
    }

    const sorted = (m: Map<string, UsageRow>) =>
      [...m.values()].sort((a, b) => b.tokens - a.tokens);

    return {
      days: data.days,
      totalCalls: events.length,
      totalTokens,
      estimatedCredits: Number(((totalTokens / 1000) * CREDITS_PER_1K_TOKENS).toFixed(2)),
      byUser: sorted(byUser),
      byFeature: sorted(byFeature),
      byDay: [...byDay.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    };
  });
