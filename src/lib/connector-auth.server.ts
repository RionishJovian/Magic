// Bearer-token authentication for the on-site connector endpoints.
export async function authenticateConnector(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return { connector: null as null, error: "Missing bearer token" };

  const { hashToken } = await import("./connector.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("connectors")
    .select("id, owner_id, name, enabled")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!data) return { connector: null as null, error: "Invalid connector token" };
  if (!data.enabled) return { connector: null as null, error: "Connector disabled" };
  return { connector: data, error: null as null };
}
