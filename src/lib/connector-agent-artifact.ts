import AGENT from "@/agent/connector-agent.mjs?raw";
import TOKEN_STORE from "@/agent/lib/token-store.mjs?raw";
import { buildSetupBundle } from "@/lib/connector-bundle";

/**
 * The connector agent imports ./lib/token-store.mjs, but installers and the
 * self-updater fetch a single file. Serving the raw entrypoint therefore fails
 * on a fresh machine with ERR_MODULE_NOT_FOUND. We inline every relative
 * dependency with the same bundler used for the local setup tool, so the
 * downloaded artifact is self-contained.
 *
 * /download serves exactly these bytes and /version hashes exactly these bytes,
 * so the signed manifest SHA always pins the runnable artifact.
 */
export const AGENT_MODULES = [TOKEN_STORE, AGENT];

export const AGENT_BUNDLE = buildSetupBundle(AGENT_MODULES, [
  "// MikroMagic Connector Agent (generated self-contained bundle).",
  "// Dependencies are inlined; this file runs on a bare Node.js 18+ install.",
]);
