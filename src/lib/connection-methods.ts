import { isPrivilegedAccount } from "./app-role";

/**
 * Single source of truth for how operators reach a board.
 * Platform users (Client / Agent): Magic Hub + Local Connector.
 * Owner: also Public IP / DDNS (inbound HTTPS).
 *
 * RemoteAccessChooser and the Routers "Connection method" fieldset MUST
 * derive from this list so the same page never shows two different counts.
 */

export type ConnMethodId = "hub" | "connector" | "remote";

export type ConnectionMethodDef = {
  id: ConnMethodId;
  title: string;
  /** Short body for the Add-router fieldset and chooser cards. */
  body: string;
  badge: string;
  tint: string;
  featured?: boolean;
  /** Primary tenant user only — never shown to standard Users or MikroMagic Agents. */
  staffOnly?: boolean;
  /** Chooser navigation target. */
  to: string;
  search?: Record<string, string>;
};

export const CONNECTION_METHODS: ConnectionMethodDef[] = [
  {
    id: "hub",
    title: "Magic Hub",
    body: "Cloud Remote for Starlink / CGNAT. After Add router a paste-script window opens.",
    badge: "Cloud Remote",
    tint: "radial-gradient(circle at 30% 30%, #fbbf24, #f97316 60%, transparent)",
    featured: true,
    to: "/app/routers",
    search: { method: "hub" },
  },
  {
    id: "connector",
    title: "Local Connector",
    body: "A paired agent on the site reaches the router's LAN IP. Works behind CGNAT (Starlink, mobile ISPs) with no port forwarding.",
    badge: "LAN bridge",
    tint: "radial-gradient(circle at 30% 30%, #34d399, #0ea5e9 60%, transparent)",
    to: "/app/connectors",
  },
  {
    id: "remote",
    title: "Public IP / DDNS",
    body: "Manage the router from anywhere over MikroTik's free xxxx.sn.mynetname.net hostname. Needs a public IP on the WAN line.",
    badge: "Inbound HTTPS",
    tint: "radial-gradient(circle at 30% 30%, #22d3ee, #6366f1 60%, transparent)",
    staffOnly: true,
    to: "/app/quick-setup",
    search: { intro: "1" },
  },
];

export function connectionMethodsForRole(isStaff: boolean): ConnectionMethodDef[] {
  return CONNECTION_METHODS.filter((m) => !m.staffOnly || isStaff);
}

/** Primary café owner or platform Developer — staff remote methods (Public IP / DDNS). */
export function isStaffRoles(roles: string[] | undefined | null, isPlatformAdmin = false): boolean {
  return isPrivilegedAccount(roles, isPlatformAdmin);
}
