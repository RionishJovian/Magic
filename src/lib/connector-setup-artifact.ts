import CLI from "@/agent/setup-cli.mjs?raw";
import REDACT from "@/agent/lib/redact.mjs?raw";
import RETRY from "@/agent/lib/retry.mjs?raw";
import NET from "@/agent/lib/net.mjs?raw";
import MNDP from "@/agent/lib/mndp.mjs?raw";
import STATE from "@/agent/lib/state.mjs?raw";
import TOKEN_STORE from "@/agent/lib/token-store.mjs?raw";
import ROUTEROS from "@/agent/lib/routeros.mjs?raw";
import BOOTSTRAP from "@/agent/lib/bootstrap.mjs?raw";
import DISCOVERY from "@/agent/lib/discovery.mjs?raw";
import { buildSetupBundle } from "@/lib/connector-bundle";

/**
 * The LOCAL setup tool as one zero-dependency file that runs on a bare Node 18+
 * install. Module order below is dependency order.
 *
 * Lives in lib (not in the route) so the signed /version manifest can hash
 * exactly the bytes served by /setup-tool without importing another route.
 */
export const SETUP_MODULES = [
  REDACT,
  RETRY,
  NET,
  MNDP,
  STATE,
  TOKEN_STORE,
  ROUTEROS,
  BOOTSTRAP,
  DISCOVERY,
  CLI,
];

export const SETUP_BUNDLE = buildSetupBundle(SETUP_MODULES);
