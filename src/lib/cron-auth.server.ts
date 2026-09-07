// Shared authentication for scheduled/cron webhook endpoints.
//
// These endpoints are reachable from the public internet, so they must be
// gated by a real, non-public shared secret — never the publishable/anon key,
// which ships to every browser.
//
// Two accepted sources, both private:
//  - CRON_SECRET environment secret (manual/external schedulers)
//  - private.cron_secrets row used by the in-database scheduler
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function providedSecret(request: Request): string {
  return (
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    ""
  );
}

export async function isAuthorizedCronRequest(request: Request): Promise<boolean> {
  const provided = providedSecret(request);
  if (!provided) return false;

  const envSecret = process.env.CRON_SECRET ?? "";
  if (envSecret && constantTimeEquals(provided, envSecret)) return true;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The `private` schema is intentionally outside the generated Data API
    // types, so reach it through a minimal structural interface.
    const privateClient = supabaseAdmin as unknown as {
      schema: (name: string) => {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (
              column: string,
              value: string,
            ) => { maybeSingle: () => Promise<{ data: { secret?: string } | null }> };
          };
        };
      };
    };
    const { data } = await privateClient
      .schema("private")
      .from("cron_secrets")
      .select("secret")
      .eq("name", "default")
      .maybeSingle();
    const dbSecret = data?.secret ?? "";
    return Boolean(dbSecret) && constantTimeEquals(provided, dbSecret);
  } catch {
    return false;
  }
}

export function cronUnauthorizedResponse(): Response {
  return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
