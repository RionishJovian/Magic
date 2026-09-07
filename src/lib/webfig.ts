/**
 * WebFig launch URLs.
 *
 * Direct / Cloud Remote: the operator's browser opens www-ssl on the public
 * host. Magic Hub: the browser must NOT use that host (CGNAT / Starlink /
 * WAN closed). Those rows open through the hub proxy instead, where RouterOS
 * WebFig still lives at /webfig/ on the same www-ssl port the REST API uses.
 */

export type WebfigVia = "hub" | "direct" | "connector" | "unavailable";

export type WebfigLauncher = {
  url: string | null;
  via: WebfigVia;
  username: string;
  reason?: string;
  /** Product access lock. Locked launchers intentionally never carry a URL. */
  locked?: boolean;
};

export type WebfigRow = {
  id: string;
  host: string;
  port: number;
  username: string;
  use_tls: boolean;
  connection_mode?: string | null;
  cloud_peer_id?: string | null;
  connector_id?: string | null;
};

/** Bracket IPv6 literals so https://2001:db8::1/webfig/ is not a malformed URL. */
export function hostForWebfigUrl(host: string): string {
  const h = host.trim();
  if (!h) return h;
  if (h.startsWith("[") && h.endsWith("]")) return h;
  if (h.includes(":") && /^[0-9a-fA-F:]+$/.test(h)) return `[${h}]`;
  return h;
}

export function directWebfigUrl(opts: { host: string; port: number; useTls: boolean }): string {
  const host = hostForWebfigUrl(opts.host);
  const scheme = opts.useTls ? "https" : "http";
  const omitPort = (opts.useTls && opts.port === 443) || (!opts.useTls && opts.port === 80);
  return `${scheme}://${host}${omitPort ? "" : `:${opts.port}`}/webfig/`;
}

/** Hub bounce that sets a peer cookie then 302s to /webfig/ (see hubWebfigNginxSnippet). */
export function hubWebfigLaunchUrl(
  hubOrigin: string,
  peerId: string,
  auth?: { expires: string; signature: string },
): string {
  const origin = hubOrigin.replace(/\/+$/, "").replace(/\/internal\/provisioner$/i, "");
  const url = new URL(`${origin}/peers/${encodeURIComponent(peerId)}/open-webfig`);
  if (auth) {
    url.searchParams.set("expires", auth.expires);
    url.searchParams.set("signature", auth.signature);
  }
  return url.toString();
}

export function buildWebfigLauncher(
  row: WebfigRow,
  ctx: { hubOrigin?: string | null },
): WebfigLauncher | null {
  if (row.connection_mode === "sandbox") return null;

  const username = row.username;
  const direct = (): WebfigLauncher => ({
    url: directWebfigUrl({ host: row.host, port: row.port, useTls: row.use_tls }),
    via: row.connector_id ? "connector" : "direct",
    username,
    ...(row.connector_id
      ? {
          reason:
            "Opens the LAN address. Use this from a browser on the same site as the Local Connector.",
        }
      : {}),
  });

  const hub = row.connection_mode === "hub" || row.connection_mode === "cloud";
  if (hub) {
    if (!row.cloud_peer_id) {
      return {
        url: null,
        via: "unavailable",
        username,
        reason: "Connect via Hub first — WebFig cannot use a CGNAT hostname.",
      };
    }
    const origin = ctx.hubOrigin?.trim() ?? "";
    if (!origin) {
      return {
        url: null,
        via: "unavailable",
        username,
        reason: "WebFig through Magic Hub needs the hub origin configured (VPS_ROUTER_API_URL).",
      };
    }
    return {
      url: hubWebfigLaunchUrl(origin, row.cloud_peer_id),
      via: "hub",
      username,
      reason: "Opens WebFig through Magic Hub. Sign in with the router's WebFig user.",
    };
  }

  return direct();
}
