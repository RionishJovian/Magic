import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listRouters from "./tools/list-routers";
import listActiveUsers from "./tools/list-active-users";
import listVouchers from "./tools/list-vouchers";
import getPortalSettings from "./tools/get-portal-settings";
import getRouterReachability from "./tools/get-router-reachability";
// Write/destructive tools (kick-user, ban-mac, create-voucher) stay unregistered
// until explicitly approved. Import them here to re-enable.

// The direct supabase.co issuer survives publish (unlike the .lovable.cloud proxy),
// and Vite inlines VITE_SUPABASE_PROJECT_ID at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "mikrotik-hotspot-admin-mcp",
  title: "MikroTik Hotspot Admin",
  version: "0.1.0",
  instructions:
    "Tools to manage MikroTik hotspot routers, live sessions, and vouchers for the signed-in user. Start with list_routers to get router IDs.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listRouters, listActiveUsers, listVouchers, getPortalSettings, getRouterReachability],
});
