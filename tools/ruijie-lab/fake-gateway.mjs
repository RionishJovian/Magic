#!/usr/bin/env node

/**
 * Generic local gateway double for the Ruijie capability lab.
 * This is intentionally not a Ruijie protocol implementation.
 */
import http from "node:http";

const forbiddenProductionNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "VPS_ROUTER_API_KEY_ID",
  "VPS_ROUTER_API_SIGNING_SECRET",
  "LOVABLE_API_KEY",
  "RUIJIE_API_KEY",
  "RUIJIE_PASSWORD",
];

for (const name of forbiddenProductionNames) {
  if (process.env[name]) {
    console.error(`Refusing Ruijie lab startup: ${name} is set.`);
    process.exit(78);
  }
}

const host = process.env.LAB_BIND_HOST ?? "0.0.0.0";
const port = Number(process.env.LAB_PORT ?? 18080);
const gatewayId = process.env.LAB_GATEWAY_ID ?? "fake-rg-eg310gh-pe";
const sessions = new Map();
const requests = new Map();
let mode = process.env.LAB_GATEWAY_MODE ?? "reachable";

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 32_768) reject(new Error("request too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function requireFields(body, fields) {
  return fields.every((field) => typeof body[field] === "string" && body[field].length > 0);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, gatewayId, mode, sessions: sessions.size });
  }
  if (req.method === "GET" && url.pathname === "/v1/sessions") {
    return json(res, 200, { gatewayId, mode, sessions: [...sessions.values()] });
  }
  if (req.method === "POST" && url.pathname === "/v1/mode") {
    try {
      const body = await readBody(req);
      if (!["reachable", "unreachable"].includes(body.mode)) return json(res, 400, { error: "invalid mode" });
      mode = body.mode;
      return json(res, 200, { ok: true, mode });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }
  if (mode === "unreachable") return json(res, 503, { error: "gateway unavailable" });

  if (req.method === "POST" && url.pathname === "/v1/portal/redirect") {
    try {
      const body = await readBody(req);
      if (!requireFields(body, ["requestId", "tenantId", "clientId"])) {
        return json(res, 400, { error: "invalid portal context" });
      }
      return json(res, 200, {
        gatewayId,
        requestId: body.requestId,
        portalUrl: `http://magic-lab.local/portal?request=${encodeURIComponent(body.requestId)}`,
        client: { tenantId: body.tenantId, clientId: body.clientId, networkId: body.networkId ?? null },
      });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/authorize") {
    try {
      const body = await readBody(req);
      if (!requireFields(body, ["requestId", "tenantId", "clientId", "sessionId"])) {
        return json(res, 400, { error: "invalid authorization context" });
      }
      if (requests.has(body.requestId)) return json(res, 200, requests.get(body.requestId));
      const result = {
        ok: true,
        state: "ACTIVE",
        gatewayId,
        requestId: body.requestId,
        sessionId: body.sessionId,
        clientId: body.clientId,
        tenantId: body.tenantId,
      };
      requests.set(body.requestId, result);
      sessions.set(body.sessionId, { ...result, state: "AUTHORIZED" });
      return json(res, 200, result);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/disconnect") {
    try {
      const body = await readBody(req);
      if (!requireFields(body, ["sessionId", "tenantId"])) return json(res, 400, { error: "invalid disconnect context" });
      const session = sessions.get(body.sessionId);
      if (!session || session.tenantId !== body.tenantId) {
        return json(res, 404, { ok: true, state: "DISCONNECTED", sessionId: body.sessionId });
      }
      sessions.delete(body.sessionId);
      return json(res, 200, { ok: true, state: "DISCONNECTED", sessionId: body.sessionId });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  return json(res, 404, { error: "not found" });
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ ok: true, service: "fake-gateway", gatewayId, host, port, mode }));
});
