import { createHash, randomBytes } from "node:crypto";
import {
  extractPresentedToken,
  ingestFailedBody,
  ingestUnauthorizedBody,
  parseIngestBody,
  stampIngestRows,
  tokenLooksPlausible,
  wouldExceedMinuteQuota,
  SYSLOG_MAX_BODY_BYTES,
  SYSLOG_MAX_EVENTS_PER_MINUTE,
  SYSLOG_RETENTION_DAYS,
  SYSLOG_TOKEN_PREFIX,
  type BoundToken,
} from "./syslog-ingest";

export function hashSyslogToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newSyslogToken(): { token: string; hash: string; prefix: string } {
  const token = `${SYSLOG_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
  return { token, hash: hashSyslogToken(token), prefix: token.slice(0, 12) };
}

type AdminClient = {
  from: (table: string) => {
    select: (cols: string, opts?: { count?: "exact"; head?: boolean }) => Query;
    insert: (rows: unknown) => PromiseLike<{ error: { message: string } | null }>;
    update: (patch: unknown) => Query;
    delete: () => Query;
  };
};

type Query = {
  eq: (col: string, val: string) => Query;
  gte: (col: string, val: string) => Query;
  lt: (col: string, val: string) => Query;
  maybeSingle: () => PromiseLike<{ data: BoundToken | null; error: { message: string } | null }>;
  then: PromiseLike<{ count?: number | null; error: { message: string } | null }>["then"];
};

export type SyslogIngestDb = {
  findTokenByHash: (hash: string) => Promise<BoundToken | null>;
  countRecentEvents: (tokenId: string, sinceIso: string) => Promise<number>;
  insertEvents: (rows: ReturnType<typeof stampIngestRows>) => Promise<void>;
  touchToken: (id: string, atIso: string) => Promise<void>;
};

export type IngestResult = {
  status: number;
  body: { ok: boolean; ingested?: number; error?: string };
};

export async function ingestSyslogPost(opts: {
  pathToken: string;
  authorization: string | null | undefined;
  rawText: string;
  contentType: string;
  clientIp: string | null;
  now?: Date;
  db: SyslogIngestDb;
}): Promise<IngestResult> {
  const presented = extractPresentedToken(opts.pathToken, opts.authorization);
  if (!tokenLooksPlausible(presented)) {
    return { status: 401, body: ingestUnauthorizedBody() };
  }
  if (opts.rawText.length > SYSLOG_MAX_BODY_BYTES) {
    return { status: 413, body: { ok: false, error: "payload too large" } };
  }

  let token: BoundToken | null;
  try {
    token = await opts.db.findTokenByHash(hashSyslogToken(presented));
  } catch (err) {
    console.error("[syslog-ingest]", err instanceof Error ? err.message : "lookup failed");
    return { status: 500, body: ingestFailedBody() };
  }
  if (!token) {
    return { status: 401, body: ingestUnauthorizedBody() };
  }

  const events = parseIngestBody(opts.rawText, opts.contentType);
  const rows = stampIngestRows(events, token, opts.clientIp);
  if (!rows.length) {
    return { status: 400, body: { ok: false, error: "no events" } };
  }

  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 60_000).toISOString();
  try {
    const already = await opts.db.countRecentEvents(token.id, since);
    if (wouldExceedMinuteQuota(already, rows.length)) {
      return {
        status: 429,
        body: { ok: false, error: `rate limited (${SYSLOG_MAX_EVENTS_PER_MINUTE}/min)` },
      };
    }
    await opts.db.insertEvents(rows);
    await opts.db.touchToken(token.id, now.toISOString());
  } catch (err) {
    console.error("[syslog-ingest]", err instanceof Error ? err.message : "insert failed");
    return { status: 500, body: ingestFailedBody() };
  }

  return { status: 200, body: { ok: true, ingested: rows.length } };
}

export function syslogRetentionCutoff(now = new Date()): string {
  return new Date(now.getTime() - SYSLOG_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function createSupabaseSyslogIngestDb(admin: AdminClient): SyslogIngestDb {
  return {
    async findTokenByHash(hash) {
      const { data, error } = await admin
        .from("syslog_tokens")
        .select("id, owner_id, router_id, site_id")
        .eq("token_hash", hash)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async countRecentEvents(tokenId, sinceIso) {
      const { count, error } = await admin
        .from("syslog_events")
        .select("id", { count: "exact", head: true })
        .eq("token_id", tokenId)
        .gte("received_at", sinceIso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async insertEvents(rows) {
      const { error } = await admin.from("syslog_events").insert(rows);
      if (error) throw new Error(error.message);
    },
    async touchToken(id, atIso) {
      const { error } = await admin
        .from("syslog_tokens")
        .update({ last_used_at: atIso })
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
  };
}
