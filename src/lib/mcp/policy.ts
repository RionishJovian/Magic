// Single source of truth for what the MCP server exposes.
//
// This mirrors `src/lib/mcp/index.ts` and the generated manifest. It is pure
// data so the in-app documentation and the tests can assert the same list
// without importing the MCP runtime.

export type McpToolDoc = {
  name: string;
  title: string;
  description: string;
  reads: string;
};

/** Registered, read-only tools. Keep in sync with `src/lib/mcp/index.ts`. */
export const MCP_READ_ONLY_TOOLS: ReadonlyArray<McpToolDoc> = [
  {
    name: "list_routers",
    title: "List routers",
    description: "Lists the routers registered by the signed-in account.",
    reads: "Router name, host and environment from your own tenant only.",
  },
  {
    name: "list_active_hotspot_users",
    title: "List active hotspot users",
    description: "Reads the live hotspot session table from one router.",
    reads: "IP, MAC, username, uptime and byte counters. No passwords.",
  },
  {
    name: "list_vouchers",
    title: "List hotspot vouchers",
    description: "Lists hotspot users (vouchers) configured on one router.",
    reads: "Voucher name, profile and limits. It never creates a voucher.",
  },
  {
    name: "get_portal_settings",
    title: "Get captive portal settings",
    description: "Reads your captive portal branding and copy.",
    reads: "Portal text, colours and image URLs for your tenant.",
  },
  {
    name: "get_router_reachability",
    title: "Get router reachability",
    description: "Pings your physical routers and returns aggregate counts only.",
    reads:
      "Total, reachable, unreachable counts and an overall status. No router IDs, names, hosts or errors.",
  },
];

/** Deliberately NOT registered. Present in source, unreachable over MCP. */
export const MCP_DISABLED_WRITE_TOOLS: ReadonlyArray<{ name: string; why: string }> = [
  { name: "create_voucher", why: "Creates sellable credit on a live router." },
  { name: "kick_user", why: "Disconnects a paying guest mid-session." },
  { name: "ban_mac", why: "Blocks a device at the router until manually undone." },
];

export const MCP_AUTH_NOTES: ReadonlyArray<string> = [
  "The MCP endpoint is OAuth-protected: a client must present a token issued by this app's identity provider.",
  "Every tool runs as the signed-in account, so the same tenant isolation and row-level security that guards the web UI also guards MCP.",
  "Tokens are never shared between accounts, and no tool can read another tenant's routers, sessions or vouchers.",
];

export const MCP_WRITE_PREREQUISITES: ReadonlyArray<string> = [
  "A written review of each write tool's blast radius, signed off by the app owner.",
  "A typed confirmation and single-target limit in the tool itself, matching the web UI's staged-rollout gates.",
  "An operations audit record for every invocation, including actor, router, environment and outcome.",
  "A successful staged trial on an isolated test router before any production tenant is enabled.",
];

/** True when the deployed tool list matches the read-only policy exactly. */
export function isReadOnlyToolSet(names: readonly string[]): boolean {
  const allowed = new Set(MCP_READ_ONLY_TOOLS.map((t) => t.name));
  return names.length > 0 && names.every((n) => allowed.has(n));
}
