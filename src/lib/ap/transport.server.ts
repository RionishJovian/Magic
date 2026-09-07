// One place decides how an access point request travels: straight out from the
// cloud (unchanged behaviour) or through the customer's local connector.
import type { ApConn } from "./types";

function headerRecord(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  const h = new Headers(init?.headers);
  h.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export async function apFetch(c: ApConn, url: string, init: RequestInit = {}): Promise<Response> {
  if (!c.connectorId) return fetch(url, init);
  const { connectorFetch } = await import("../connector.server");
  return connectorFetch(c.connectorId, {
    url,
    method: init.method ?? "GET",
    headers: headerRecord(init),
    body: typeof init.body === "string" ? init.body : null,
    tlsFingerprint: c.tlsFingerprint ?? null,
  });
}
