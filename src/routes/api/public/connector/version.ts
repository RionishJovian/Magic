import { createFileRoute } from "@tanstack/react-router";
import { AGENT_BUNDLE } from "@/lib/connector-agent-artifact";
import { SETUP_BUNDLE } from "@/lib/connector-setup-artifact";

const VERSION_RE = /AGENT_VERSION\s*=\s*"([\d.]+)"/;

/**
 * Signed update manifest for the desktop connector agent.
 *
 * The manifest is signed with an Ed25519 key held only on the server; the
 * agent ships with the matching public key, so an attacker who can serve
 * traffic still cannot push a modified agent. The SHA-256 fields pin the exact
 * bytes served by /download and /setup-tool — the self-contained bundles, not
 * the raw sources — so installers can verify first-time downloads too.
 */
export const Route = createFileRoute("/api/public/connector/version")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { createHash, createPrivateKey, sign } = await import("node:crypto");

        const version = VERSION_RE.exec(AGENT_BUNDLE)?.[1] ?? "1.0.0";
        const sha256 = createHash("sha256").update(AGENT_BUNDLE, "utf8").digest("hex");
        const setupSha256 = createHash("sha256").update(SETUP_BUNDLE, "utf8").digest("hex");
        const origin = new URL(request.url).origin;

        const manifest = {
          version,
          sha256,
          url: `${origin}/api/public/connector/download`,
          setupSha256,
          setupUrl: `${origin}/api/public/connector/setup-tool`,
          algorithm: "ed25519",
        };

        const privateKeyB64 = process.env["CONNECTOR_UPDATE_PRIVATE_KEY"];
        if (!privateKeyB64) {
          return Response.json({ error: "Update signing key is not configured" }, { status: 503 });
        }

        const key = createPrivateKey({
          key: Buffer.from(privateKeyB64, "base64"),
          format: "der",
          type: "pkcs8",
        });
        const signature = sign(null, Buffer.from(JSON.stringify(manifest)), key).toString("base64");

        return Response.json({ manifest, signature }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
