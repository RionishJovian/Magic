import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildSyslogShipperScript,
  coerceSeverity,
  extractPresentedToken,
  inferSeverityFromLine,
  ingestFailedBody,
  ingestUnauthorizedBody,
  parseIngestBody,
  stampIngestRows,
  syslogIngestUrl,
  tokenLooksPlausible,
  wouldExceedMinuteQuota,
  SYSLOG_INGEST_PATH,
  SYSLOG_MAX_BODY_BYTES,
  SYSLOG_TOKEN_PREFIX,
} from "@/lib/syslog-ingest";
import {
  hashSyslogToken,
  ingestSyslogPost,
  newSyslogToken,
  type SyslogIngestDb,
} from "@/lib/syslog-ingest.server";
import { CONNECTOR_PRODUCTION_ORIGIN } from "@/lib/connector-install-origin";

const PAGE = readFileSync("src/routes/_authenticated/app.syslog.tsx", "utf8");
const ROUTE = readFileSync("src/routes/api/public/hooks/syslog/$token.ts", "utf8");
const FNS = readFileSync("src/lib/syslog.functions.ts", "utf8");
const SCRIPTS = readFileSync("src/data/scripts.ts", "utf8");

function memoryDb(seed?: {
  token: string;
  owner_id?: string;
  router_id?: string | null;
  site_id?: string | null;
}): SyslogIngestDb & { rows: unknown[]; touches: number } {
  const hash = seed ? hashSyslogToken(seed.token) : "";
  const bound = seed
    ? {
        id: "tok-1",
        owner_id: seed.owner_id ?? "owner-1",
        router_id: seed.router_id ?? "router-1",
        site_id: seed.site_id ?? "site-1",
      }
    : null;
  const rows: unknown[] = [];
  return {
    rows,
    touches: 0,
    async findTokenByHash(h) {
      return bound && h === hash ? bound : null;
    },
    async countRecentEvents() {
      return rows.length;
    },
    async insertEvents(incoming) {
      rows.push(...incoming);
    },
    async touchToken() {
      this.touches += 1;
    },
  };
}

describe("syslog token minting", () => {
  it("mints mmsys_ secrets and hashes them", () => {
    const minted = newSyslogToken();
    expect(minted.token.startsWith(SYSLOG_TOKEN_PREFIX)).toBe(true);
    expect(tokenLooksPlausible(minted.token)).toBe(true);
    expect(minted.hash).toBe(hashSyslogToken(minted.token));
    expect(minted.hash).toHaveLength(64);
    expect(minted.prefix).toBe(minted.token.slice(0, 12));
    expect(minted.hash).not.toContain(minted.token.slice(12));
  });
});

describe("presented token", () => {
  it("accepts path or bearer, rejects a mismatch", () => {
    expect(extractPresentedToken("abc", null)).toBe("abc");
    expect(extractPresentedToken("", "Bearer abc")).toBe("abc");
    expect(extractPresentedToken("abc", "Bearer abc")).toBe("abc");
    expect(extractPresentedToken("abc", "Bearer xyz")).toBe("");
  });
});

describe("severity and body parse", () => {
  it("maps syslog names and infers from a RouterOS line", () => {
    expect(coerceSeverity("err")).toBe("critical");
    expect(coerceSeverity("notice")).toBe("warning");
    expect(coerceSeverity("debug")).toBe("info");
    expect(inferSeverityFromLine("12:01:02 firewall,error drop from 1.2.3.4")).toBe("critical");
    expect(inferSeverityFromLine("12:01:02 system,warning ntp")).toBe("warning");
  });

  it("parses JSON batches and newline text", () => {
    const json = parseIngestBody(
      JSON.stringify({ events: [{ message: "hello", severity: "warning" }] }),
      "application/json",
    );
    expect(json).toEqual([{ message: "hello", severity: "warning" }]);
    const text = parseIngestBody("a\nb\n", "text/plain");
    expect(text.map((e) => e.message)).toEqual(["a", "b"]);
  });
});

describe("stampIngestRows ignores client ids", () => {
  it("uses the token binding, not the payload", () => {
    const rows = stampIngestRows(
      [
        {
          message: "x",
          router_id: "attacker-router",
          site_id: "attacker-site",
          source_ip: "9.9.9.9",
        },
      ],
      { id: "tok-1", owner_id: "owner-1", router_id: "r-bound", site_id: "s-bound" },
      "1.2.3.4",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.router_id).toBe("r-bound");
    expect(rows[0]?.site_id).toBe("s-bound");
    expect(rows[0]?.owner_id).toBe("owner-1");
    expect(rows[0]?.source_ip).toBe("1.2.3.4");
    expect(rows[0]?.token_id).toBe("tok-1");
  });
});

describe("ingestSyslogPost", () => {
  const secret = `${SYSLOG_TOKEN_PREFIX}${"ab".repeat(32)}`;

  it("returns the same unauthorized body for missing and unknown tokens", async () => {
    const db = memoryDb({ token: secret });
    const missing = await ingestSyslogPost({
      pathToken: "",
      authorization: null,
      rawText: "hello",
      contentType: "text/plain",
      clientIp: null,
      db,
    });
    const unknown = await ingestSyslogPost({
      pathToken: `${SYSLOG_TOKEN_PREFIX}${"cd".repeat(32)}`,
      authorization: null,
      rawText: "hello",
      contentType: "text/plain",
      clientIp: null,
      db,
    });
    expect(missing).toEqual({ status: 401, body: ingestUnauthorizedBody() });
    expect(unknown.body).toEqual(ingestUnauthorizedBody());
    expect(unknown.status).toBe(401);
  });

  it("ingests plaintext lines against a hashed token", async () => {
    const db = memoryDb({ token: secret });
    const ok = await ingestSyslogPost({
      pathToken: secret,
      authorization: null,
      rawText: "12:00:00 system,info hello\n12:00:01 firewall,error drop",
      contentType: "text/plain",
      clientIp: "10.1.1.1",
      db,
    });
    expect(ok).toEqual({ status: 200, body: { ok: true, ingested: 2 } });
    expect(db.rows).toHaveLength(2);
    expect(db.touches).toBe(1);
    expect((db.rows[1] as { severity: string }).severity).toBe("critical");
  });

  it("rejects oversized bodies and rate-limit bursts", async () => {
    const db = memoryDb({ token: secret });
    const huge = await ingestSyslogPost({
      pathToken: secret,
      authorization: null,
      rawText: "x".repeat(SYSLOG_MAX_BODY_BYTES + 1),
      contentType: "text/plain",
      clientIp: null,
      db,
    });
    expect(huge.status).toBe(413);

    for (let i = 0; i < 120; i++) db.rows.push({ message: String(i) });
    const limited = await ingestSyslogPost({
      pathToken: secret,
      authorization: null,
      rawText: "one more",
      contentType: "text/plain",
      clientIp: null,
      db,
    });
    expect(limited.status).toBe(429);
    expect(wouldExceedMinuteQuota(120, 1)).toBe(true);
  });

  it("never returns internal insert errors to the client", async () => {
    const db = memoryDb({ token: secret });
    db.insertEvents = async () => {
      throw new Error("column syslog_tokens.token does not exist");
    };
    const res = await ingestSyslogPost({
      pathToken: secret,
      authorization: null,
      rawText: "hello",
      contentType: "text/plain",
      clientIp: null,
      db,
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual(ingestFailedBody());
    expect(JSON.stringify(res.body)).not.toMatch(/column|token does not exist/i);
  });
});

describe("HTTPS shipper and production origin", () => {
  it("builds a fetch-based shipper, not UDP remote logging", () => {
    const url = syslogIngestUrl(CONNECTOR_PRODUCTION_ORIGIN, "PASTE_TOKEN");
    expect(url).toBe(`${CONNECTOR_PRODUCTION_ORIGIN}${SYSLOG_INGEST_PATH}/PASTE_TOKEN`);
    const script = buildSyslogShipperScript(url);
    expect(script).toContain("/tool fetch");
    expect(script).toContain("text/plain");
    expect(script).toContain("mm-syslog-ship");
    expect(script).not.toMatch(/target=remote/);
    expect(script).toContain("mikromagic.app");
    expect(script).not.toContain("lovable.app");
  });
});

describe("Syslog AI UI and server wiring", () => {
  it("pins ingest to connectorInstallOrigin, not the Lovable preview host", () => {
    expect(PAGE).toContain("connectorInstallOrigin");
    expect(PAGE).not.toContain("mikrotikmagic.lovable.app");
    expect(PAGE).toContain("Copy now");
    expect(PAGE).not.toMatch(/select\("id, token/);
  });

  it("lists tokens without the secret column", () => {
    expect(FNS).toContain("token_hash");
    expect(FNS).toContain("token_prefix");
    expect(FNS).not.toMatch(/select\("id, token,/);
  });

  it("rejects GET on the public ingest URL", () => {
    expect(ROUTE).toContain("status: 405");
    expect(ROUTE).toContain("ingestSyslogPost");
  });

  it("keeps the Scripts library shipper as a placeholder, not a live secret", () => {
    expect(SCRIPTS).toContain("syslog-ai-https-shipper");
    expect(SCRIPTS).toContain("PASTE_TOKEN");
    expect(SCRIPTS).toContain("buildSyslogShipperScript");
  });
});
