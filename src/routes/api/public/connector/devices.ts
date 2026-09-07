import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * The local connector registers (or updates) a router it discovered and, when
 * bootstrap succeeded, the dedicated magic-api credential it created.
 *
 * Tenancy comes exclusively from the bearer token. The router admin password
 * is never accepted here and never stored.
 */
const schema = z.object({
  fingerprint: z.string().min(3).max(200),
  identity: z.string().max(120).nullish(),
  model: z.string().max(120).nullish(),
  platform: z.string().max(120).nullish(),
  os_version: z.string().max(60).nullish(),
  ip: z.string().max(45).nullish(),
  mac: z.string().max(23).nullish(),
  serial: z.string().max(80).nullish(),
  state: z
    .enum(["discovered", "authenticating", "configuring", "connected", "offline", "error"])
    .default("discovered"),
  last_error: z.string().max(300).nullish(),
  backup_name: z.string().max(160).nullish(),
  rollback_script: z.string().max(20_000).nullish(),
  rollback_scope: z.string().max(2000).nullish(),
  tls_fingerprint: z
    .string()
    .regex(/^[0-9A-Fa-f:]{47,}$/)
    .max(200)
    .nullish(),
  api_username: z.string().max(60).nullish(),
  api_password: z.string().max(200).nullish(),
});

const MAX_BODY_BYTES = 64_000;

export const Route = createFileRoute("/api/public/connector/devices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateConnector } = await import("@/lib/connector-auth.server");
        const { connector, error: authError } = await authenticateConnector(request);
        if (!connector) return Response.json({ error: authError }, { status: 401 });

        const { rateLimit, auditConnector } = await import("@/lib/connector-guard.server");
        const allowed = await rateLimit(`devices:${connector.id}`, 60, 60);
        if (!allowed) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });

        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid device payload" }, { status: 400 });
        }
        const d = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();

        let encrypted: string | null = null;
        if (d.api_password) {
          const { encryptSecret } = await import("@/lib/crypto.server");
          encrypted = encryptSecret(d.api_password);
        }

        // Duplicate prevention: one row per (owner, fingerprint). Never merged
        // across tenants, because owner_id comes from the token.
        const { data: existing } = await supabaseAdmin
          .from("connector_discovered_routers")
          .select("id")
          .eq("owner_id", connector.owner_id)
          .eq("fingerprint", d.fingerprint)
          .maybeSingle();

        const row = {
          owner_id: connector.owner_id,
          connector_id: connector.id,
          fingerprint: d.fingerprint,
          identity: d.identity ?? null,
          model: d.model ?? null,
          platform: d.platform ?? null,
          os_version: d.os_version ?? null,
          ip: d.ip ?? null,
          mac: d.mac ?? null,
          serial: d.serial ?? null,
          state: d.state,
          last_error: d.last_error ?? null,
          last_seen_at: now,
          backup_name: d.backup_name ?? null,
          rollback_script: d.rollback_script ?? null,
          rollback_meta: d.rollback_scope
            ? { scope: d.rollback_scope, backup_name: d.backup_name ?? null }
            : {},
          tls_fingerprint: d.tls_fingerprint ?? null,
          ...(d.api_username ? { api_username: d.api_username } : {}),
          ...(encrypted ? { api_password_encrypted: encrypted } : {}),
        };

        const result = existing
          ? await supabaseAdmin
              .from("connector_discovered_routers")
              .update(row)
              .eq("id", existing.id)
              .eq("owner_id", connector.owner_id)
              .select("id")
              .single()
          : await supabaseAdmin
              .from("connector_discovered_routers")
              .insert(row)
              .select("id")
              .single();

        if (result.error || !result.data) {
          return Response.json({ error: "Could not store the device" }, { status: 500 });
        }

        await auditConnector({
          connectorId: connector.id,
          ownerId: connector.owner_id,
          action: existing ? "device.update" : "device.register",
          discoveredRouterId: result.data.id,
          detail: {
            fingerprint: d.fingerprint,
            identity: d.identity ?? "unknown",
            model: d.model ?? "unknown",
            os_version: d.os_version ?? "unknown",
            state: d.state,
            backup_name: d.backup_name ?? null,
          },
        });

        await supabaseAdmin
          .from("connectors")
          .update({ last_seen_at: now, status: "online" })
          .eq("id", connector.id);

        return Response.json({ ok: true, id: result.data.id, state: d.state });
      },
    },
  },
});
