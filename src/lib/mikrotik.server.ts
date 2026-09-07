// Thin MikroTik RouterOS REST client. Called only from server functions.
// The RouterOS 7.1+ REST API lives at https://<host>/rest/... with HTTP Basic auth.

import { explainRouterOsStatus } from "./error-message";

export interface RouterConn {
  host: string;
  port: number;
  username: string;
  password: string; // decrypted
  useTls: boolean;
  /**
   * Optional full REST base URL override (no trailing slash), used when the
   * router is reached through an outbound WireGuard tunnel hub instead of
   * directly over the internet.
   */
  baseUrlOverride?: string;
  /**
   * Secondary REST base URL tried automatically when the primary path is
   * unreachable (transport failure only, never on an auth/HTTP error). This is
   * what makes direct <-> tunnel failover transparent to every caller.
   */
  altBaseUrl?: string;
  /** Set by request() so callers can report which path actually answered. */
  lastPathUsed?: "primary" | "fallback";
  /**
   * When set, every REST call is routed through the customer's local connector
   * instead of being dialled directly from the cloud.
   */
  connectorId?: string | null;
  /**
   * Per-router, privileged-only exception that tolerates a self-signed
   * certificate on this device. Verified TLS is the default everywhere.
   */
  allowInsecureTls?: boolean;
  /**
   * SHA-256 certificate fingerprint pinned for this device when it is reached
   * through a local connector. Lets the connector accept the router's
   * self-signed certificate without disabling verification.
   */
  tlsFingerprint?: string | null;
  /** Internal: set once the direct endpoint has been re-validated. */
  endpointChecked?: boolean;
  /**
   * Leftover virtual-lab ids must never be dialled. `loadRouterConn` refuses
   * those rows; this is a last-line guard if a caller still sets them.
   */
  sandboxRouterId?: string;
  sandboxOwnerId?: string;
}

function directBase(c: RouterConn): string {
  const scheme = c.useTls ? "https" : "http";
  return `${scheme}://${c.host}:${c.port}/rest`;
}

function baseUrl(c: RouterConn): string {
  if (c.baseUrlOverride) return c.baseUrlOverride.replace(/\/+$/, "");
  return directBase(c);
}

function authHeader(c: RouterConn): string {
  const token = Buffer.from(`${c.username}:${c.password}`).toString("base64");
  return `Basic ${token}`;
}

export type RouterExchange = {
  status: number;
  body: string;
  /** False when the transport failed before an HTTP response (status will be 0). */
  reached: boolean;
};

/**
 * Free-form RouterOS REST exchange used by Terminal. Routes through
 * Local Connector, Magic Hub (`baseUrlOverride`), or direct — same as `request`.
 * Does not throw on HTTP 4xx/5xx; returns status + body so the UI can show them.
 * Network / transport failures return `{ status: 0, reached: false, body: … }`.
 */
export async function exchange(
  c: RouterConn,
  path: string,
  init?: RequestInit,
): Promise<RouterExchange> {
  if (c.sandboxRouterId || c.sandboxOwnerId) {
    const { SANDBOX_REMOVED_MESSAGE } = await import("./test-router");
    return { status: 0, body: SANDBOX_REMOVED_MESSAGE, reached: false };
  }

  const bases = [baseUrl(c)];
  const alt = c.altBaseUrl?.replace(/\/+$/, "");
  if (alt && alt !== bases[0]) bases.push(alt);

  const attempt = async (base: string): Promise<Response> => {
    const headers = {
      Authorization: authHeader(c),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    };

    if (c.connectorId) {
      const { connectorFetch } = await import("./connector.server");
      return connectorFetch(c.connectorId, {
        url: `${base}${path}`,
        method: init?.method ?? "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : null,
        tlsFingerprint: c.tlsFingerprint ?? null,
      });
    }

    // Re-validate the endpoint immediately before dialling out directly, so a
    // DNS record that has since been repointed at an internal address cannot
    // be used as an SSRF pivot.
    if (!c.baseUrlOverride && !c.endpointChecked) {
      const { assertSafeEndpoint } = await import("./net/endpoint.server");
      await assertSafeEndpoint(c.host, c.port);
      c.endpointChecked = true;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return await fetch(`${base}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res: Response | null = null;
  let lastErr: unknown = null;
  for (let i = 0; i < bases.length; i++) {
    try {
      res = await attempt(bases[i]!);
      c.lastPathUsed = i === 0 ? "primary" : "fallback";
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!res) {
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    const via =
      c.connectorId != null
        ? "local connector"
        : c.baseUrlOverride
          ? "Magic Hub"
          : `${c.host}:${c.port}`;
    return {
      status: 0,
      body: `Cannot reach router via ${via} (${msg}). Confirm the board is still online (Routers → Test), www-ssl is enabled, and credentials match.`,
      reached: false,
    };
  }
  return { status: res.status, body: await res.text(), reached: true };
}

/** RouterOS REST: PUT creates rows; bare POST on a menu often returns "no such command". */
async function createResource<T = unknown>(
  c: RouterConn,
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const payload = JSON.stringify(body);
  const attempts: Array<() => Promise<T>> = [
    () => request<T>(c, path, { method: "PUT", body: payload }),
    () => request<T>(c, `${path}/add`, { method: "POST", body: payload }),
    () => request<T>(c, path, { method: "POST", body: payload }),
  ];
  let last: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

function firewallFilterRuleToCli(rule: Record<string, string>): string {
  const parts = Object.entries(rule).map(([key, value]) => {
    if (key === "comment" || /[\s,]/.test(value)) return `${key}="${value}"`;
    return `${key}=${value}`;
  });
  return `/ip firewall filter add ${parts.join(" ")}`;
}

function rosCliQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;
}

function formatCliParam(key: string, value: string): string {
  if (key === "on-login" || key === "rate-limit" || /[\s,=]/.test(value) || value.includes("$")) {
    return `${key}=${rosCliQuote(value)}`;
  }
  return `${key}=${value}`;
}

/** Exported for tests — RouterOS REST often rejects profile create; CLI is the fallback. */
export function userProfileToCli(profile: Record<string, string>): string {
  const parts = Object.entries(profile)
    .filter(([key]) => key !== "comment")
    .map(([key, value]) => formatCliParam(key, value));
  return `/ip hotspot user profile add ${parts.join(" ")}`;
}

/** Idempotent add-or-set by profile name — matches trial profile fallback on hub/REST quirks. */
export function userProfileUpsertCli(profile: Record<string, string>): string {
  const name = profile.name ?? "";
  const quoteCli = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
  const parts = Object.entries(profile)
    .filter(([key]) => key !== "name" && key !== "comment")
    .map(([key, value]) => formatCliParam(key, value));
  return [
    `:if ([:len [/ip hotspot user profile find where name=${quoteCli(name)}]] > 0) do={`,
    `/ip hotspot user profile set [find where name=${quoteCli(name)}] ${parts.join(" ")}`,
    `} else={`,
    `/ip hotspot user profile add name=${quoteCli(name)} ${parts.join(" ")}`,
    `};`,
  ].join(" ");
}

/** Exported for tests — profile PATCH fallback when REST rejects on-login or other fields. */
export function userProfilePatchToCli(id: string, patch: Record<string, string>): string {
  const idPart = id.startsWith("*") ? `.id=${id}` : `numbers=${id}`;
  const parts = Object.entries(patch)
    .filter(([key]) => key !== "name" && key !== "comment")
    .map(([key, value]) => formatCliParam(key, value));
  return `/ip hotspot user profile set ${idPart} ${parts.join(" ")}`;
}

/** Exported for tests — voucher issue falls back when REST POST/PUT on /ip/hotspot/user fails. */
export function hotspotUserToCli(input: {
  name: string;
  password: string;
  profile: string;
  comment?: string;
  "limit-bytes-total"?: string;
}): string {
  const parts = [
    `name=${rosCliQuote(input.name)}`,
    `password=${rosCliQuote(input.password)}`,
    `profile=${input.profile}`,
  ];
  if (input.comment) {
    parts.push(`comment=${rosCliQuote(input.comment)}`);
  }
  if (input["limit-bytes-total"]) {
    parts.push(`limit-bytes-total=${input["limit-bytes-total"]}`);
  }
  return `/ip hotspot user add ${parts.join(" ")}`;
}

/** Strip comment= tokens — hAP ax² /execute rejects comment on many add commands. */
export function stripCommentParamsFromCli(script: string): string {
  return script.replace(/\scomment=(?:"(?:\\.|[^"])*"|[^\s]+)/g, "");
}

async function executeScript(c: RouterConn, script: string): Promise<unknown> {
  try {
    return await request(c, "/execute", {
      method: "POST",
      body: JSON.stringify({ script }),
    });
  } catch (first) {
    const msg = first instanceof Error ? first.message : String(first);
    if (/bad parameter comment/i.test(msg) && /\bcomment=/.test(script)) {
      const stripped = stripCommentParamsFromCli(script);
      if (stripped !== script) {
        return await request(c, "/execute", {
          method: "POST",
          body: JSON.stringify({ script: stripped }),
        });
      }
    }
    throw first;
  }
}

async function request<T = unknown>(c: RouterConn, path: string, init?: RequestInit): Promise<T> {
  const { status, body: text, reached } = await exchange(c, path, init);
  if (!reached) {
    throw new Error(text);
  }
  if (status < 200 || status >= 300) {
    throw new Error(
      explainRouterOsStatus(status, text, {
        host: c.baseUrlOverride ? undefined : c.host,
      }),
    );
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

import { normalizeRestList } from "./ros-rest-list";

export { normalizeRestList } from "./ros-rest-list";

async function requestList<T extends Record<string, unknown>>(
  c: RouterConn,
  path: string,
): Promise<T[]> {
  return normalizeRestList<T>(await request<unknown>(c, path));
}

export const routerAPI = {
  ping: (c: RouterConn) => request<{ version?: string }>(c, "/system/resource"),

  cloud: (c: RouterConn) =>
    request<{
      "dns-name"?: string;
      "ddns-enabled"?: string;
      status?: string;
      "public-address"?: string;
    }>(c, "/ip/cloud"),

  /** All configured IP addresses — used to compare the WAN address with the
   *  public address MikroTik Cloud reports (CGNAT detection). */
  addresses: (c: RouterConn) => requestList<Record<string, string>>(c, "/ip/address"),

  /** Default route(s): tells us which interface is the WAN. */
  routes: (c: RouterConn) => requestList<Record<string, string>>(c, "/ip/route"),

  activeUsers: (c: RouterConn) => requestList<Record<string, string>>(c, "/ip/hotspot/active"),

  hosts: (c: RouterConn) => requestList<Record<string, string>>(c, "/ip/hotspot/host"),

  users: (c: RouterConn) => requestList<Record<string, string>>(c, "/ip/hotspot/user"),

  profiles: (c: RouterConn) => requestList<Record<string, string>>(c, "/ip/hotspot/user/profile"),

  cookies: (c: RouterConn) => requestList<Record<string, string>>(c, "/ip/hotspot/cookie"),

  // Kick a currently-connected user by their active-list id (.id).
  removeActive: (c: RouterConn, id: string) =>
    request(c, `/ip/hotspot/active/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Ban a MAC (bypassed=no, blocked=yes) via ip-binding.
  banMac: (c: RouterConn, mac: string, comment = "banned via admin") =>
    request(c, `/ip/hotspot/ip-binding`, {
      method: "POST",
      body: JSON.stringify({ "mac-address": mac, type: "blocked", comment }),
    }),

  listBindings: (c: RouterConn) => requestList<Record<string, string>>(c, "/ip/hotspot/ip-binding"),

  removeBinding: (c: RouterConn, id: string) =>
    request(c, `/ip/hotspot/ip-binding/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  addUser: async (
    c: RouterConn,
    input: {
      name: string;
      password: string;
      profile: string;
      comment?: string;
      "limit-bytes-total"?: string;
    },
  ) => {
    const body = {
      name: input.name,
      password: input.password,
      profile: input.profile,
      ...(input.comment ? { comment: input.comment } : {}),
      ...(input["limit-bytes-total"] ? { "limit-bytes-total": input["limit-bytes-total"] } : {}),
    };
    try {
      return await createResource(c, "/ip/hotspot/user", body);
    } catch (first) {
      const msg = first instanceof Error ? first.message : String(first);
      if (!/400|406|no such command|bad request/i.test(msg)) throw first;
      return await executeScript(c, hotspotUserToCli(input));
    }
  },

  deleteUser: (c: RouterConn, id: string) =>
    request(c, `/ip/hotspot/user/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Adjust a user's rate limit inline (overrides profile).
  setUserRate: (c: RouterConn, id: string, rate: string) =>
    request(c, `/ip/hotspot/user/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ "limit-uptime": undefined, comment: `rate:${rate}` }),
    }),

  patchUser: (c: RouterConn, id: string, patch: Record<string, string | number | undefined>) =>
    request(c, `/ip/hotspot/user/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  // ---- File / portal deploy helpers ----
  listFiles: (c: RouterConn) => requestList<{ ".id": string; name?: string }>(c, "/file"),

  findFileId: async (c: RouterConn, name: string): Promise<string | null> => {
    try {
      const rows = normalizeRestList<{ ".id": string; name?: string }>(
        await request(c, `/file?name=${encodeURIComponent(name)}`),
      );
      const hit = rows.find((r) => !r.name || r.name === name) ?? rows[0];
      if (hit?.[".id"]) return hit[".id"];
    } catch {
      // Some RouterOS builds ignore ?name= for nested paths — scan the list.
    }
    const all = await requestList<{ ".id": string; name?: string }>(c, "/file").catch(
      () => [] as Array<{ ".id": string; name?: string }>,
    );
    return all.find((r) => r.name === name)?.[".id"] ?? null;
  },

  readFile: async (c: RouterConn, name: string): Promise<string | null> => {
    const rows = normalizeRestList<{ name?: string; contents?: string }>(
      await request(c, `/file?name=${encodeURIComponent(name)}`),
    );
    const hit = rows.find((row) => row.name === name) ?? rows[0];
    return hit?.contents ?? null;
  },

  removeFile: (c: RouterConn, id: string) =>
    request(c, `/file/${encodeURIComponent(id)}`, { method: "DELETE" }),

  addFile: async (c: RouterConn, name: string, contents: string) => {
    const payload = JSON.stringify({ name, contents });
    const attempts: Array<() => Promise<unknown>> = [
      () => request(c, "/file/add", { method: "POST", body: payload }),
      () => request(c, "/file", { method: "PUT", body: payload }),
      () => request(c, "/file", { method: "POST", body: payload }),
    ];
    let last: unknown;
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (e) {
        last = e;
      }
    }
    throw last instanceof Error ? last : new Error(String(last));
  },

  // Router downloads a remote URL directly onto its filesystem.
  // Best for binary assets (logo/hero images) that can't ride inline text.
  fetchToPath: (
    c: RouterConn,
    url: string,
    dstPath: string,
    options?: { checkCertificate?: boolean },
  ) =>
    request(c, "/tool/fetch", {
      method: "POST",
      body: JSON.stringify({
        url,
        "dst-path": dstPath,
        mode: url.startsWith("https") ? "https" : "http",
        // This controls the router's outbound download, not the app-to-router
        // TLS exception stored on RouterConn. Portal deploys opt out only for
        // one signed text URL and verify the exact downloaded contents.
        "check-certificate": options?.checkCertificate === false ? "no" : "yes",
      }),
    }),

  // One-shot RouterOS script execution.
  execScript: (c: RouterConn, script: string) => executeScript(c, script),

  // Hotspot *server* profiles — these carry html-directory.
  hotspotProfiles: (c: RouterConn) => requestList<Record<string, string>>(c, "/ip/hotspot/profile"),

  setProfileHtmlDir: (c: RouterConn, id: string, dir: string) =>
    request(c, `/ip/hotspot/profile/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ "html-directory": dir }),
    }),

  patchHotspotProfile: (c: RouterConn, id: string, patch: Record<string, string>) =>
    request(c, `/ip/hotspot/profile/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  /** @deprecated changes every profile globally; use setProfileHtmlDir per target. */
  setHotspotHtmlDir: (c: RouterConn, dir: string) =>
    executeScript(c, `/ip hotspot profile set [find] html-directory=${dir}`),

  // ---- Firewall (used by the Login Bypass Shield) ----
  listFirewallFilter: (c: RouterConn) =>
    requestList<Record<string, string>>(c, "/ip/firewall/filter"),

  addFirewallFilter: async (c: RouterConn, rule: Record<string, string>) => {
    try {
      return await createResource(c, "/ip/firewall/filter", rule);
    } catch (first) {
      const msg = first instanceof Error ? first.message : String(first);
      if (!/400|406|no such command/i.test(msg)) throw first;
      return await executeScript(c, firewallFilterRuleToCli(rule));
    }
  },

  removeFirewallFilter: (c: RouterConn, id: string) =>
    request(c, `/ip/firewall/filter/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // ---- Hotspot user profiles (voucher plan templates) ----
  addUserProfile: async (c: RouterConn, profile: Record<string, string>) => {
    const { comment: _c, ...withoutComment } = profile;
    for (const body of [profile, withoutComment]) {
      try {
        return await createResource(c, "/ip/hotspot/user/profile", body);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/400|406|no such command|already have|exists|invalid/i.test(msg)) throw e;
      }
    }
    try {
      return await executeScript(c, userProfileToCli(profile));
    } catch {
      if (profile["on-login"]) {
        try {
          const { "on-login": _script, ...rest } = profile;
          return await executeScript(c, userProfileUpsertCli(rest));
        } catch {
          // Fall through to full upsert below.
        }
      }
      return await executeScript(c, userProfileUpsertCli(profile));
    }
  },

  patchUserProfile: async (c: RouterConn, id: string, patch: Record<string, string>) => {
    try {
      return await request(c, `/ip/hotspot/user/profile/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    } catch (first) {
      const msg = first instanceof Error ? first.message : String(first);
      if (!/400|406|no such command|invalid/i.test(msg)) {
        if (patch["on-login"]) {
          const { "on-login": _script, ...rest } = patch;
          return request(c, `/ip/hotspot/user/profile/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify(rest),
          });
        }
        throw first;
      }
      try {
        return await executeScript(c, userProfilePatchToCli(id, patch));
      } catch {
        if (patch["on-login"]) {
          const { "on-login": _script, ...rest } = patch;
          try {
            return await executeScript(c, userProfilePatchToCli(id, rest));
          } catch {
            if (patch.name) {
              return await executeScript(c, userProfileUpsertCli(patch));
            }
            return request(c, `/ip/hotspot/user/profile/${encodeURIComponent(id)}`, {
              method: "PATCH",
              body: JSON.stringify(rest),
            });
          }
        }
        if (patch.name) {
          return await executeScript(c, userProfileUpsertCli(patch));
        }
        throw first;
      }
    }
  },

  removeUserProfile: (c: RouterConn, id: string) =>
    request(c, `/ip/hotspot/user/profile/${encodeURIComponent(id)}`, { method: "DELETE" }),

  setSystemTimezone: (c: RouterConn, tz: string) =>
    request(c, "/system/clock", {
      method: "PATCH",
      body: JSON.stringify({ "time-zone-autodetect": "no", "time-zone-name": tz }),
    }),

  // Escape hatch for read-only endpoints without a dedicated helper.
  raw: <T = unknown>(c: RouterConn, path: string, init?: RequestInit) => request<T>(c, path, init),

  /** Terminal / diagnostics: status + body without throwing on HTTP errors. */
  exchange,
};
