// Pure hotspot session accounting / reconciliation.
//
// Routers are unreliable: they go offline, reboot, and re-report sessions with
// a new id. The rules here make that visible instead of silently dropping data.

export type ReconcileStatus = "open" | "closed" | "stale" | "queued";

export interface StoredSession {
  id: string;
  external_session_id: string | null;
  device_mac: string | null;
  code: string | null;
  started_at: string;
  ended_at: string | null;
  bytes_in: number;
  bytes_out: number;
  duration_seconds: number;
  reconcile_status: ReconcileStatus;
  source_seen_at: string | null;
  termination_reason: string | null;
}

/** One active session as reported by a router poll. */
export interface SessionSample {
  external_session_id: string;
  device_mac: string | null;
  device_ip: string | null;
  username: string | null;
  code: string | null;
  bytes_in: number;
  bytes_out: number;
  duration_seconds: number;
}

export interface SessionPatch {
  id: string;
  bytes_in?: number;
  bytes_out?: number;
  duration_seconds?: number;
  ended_at?: string | null;
  reconcile_status?: ReconcileStatus;
  termination_reason?: string | null;
  source_seen_at?: string;
  reconcile_note?: string | null;
}

export interface ReconcileResult {
  inserts: Array<SessionSample & { source_seen_at: string; reconcile_status: ReconcileStatus }>;
  updates: SessionPatch[];
}

/** Counters only ever grow; a smaller value means the router restarted. */
function mergeCounter(previous: number, next: number): number {
  return next >= previous ? next : previous + next;
}

/**
 * Reconciles a router poll against what we already stored.
 *
 * - `reachable: false` → nothing is closed. Open sessions become `stale` so the
 *   operator can see the numbers are not current.
 * - a stored open session missing from a successful poll is closed with
 *   `router-report` and keeps its last known counters.
 * - a stale session that reappears goes back to `open` (reconnect).
 */
export function reconcileSessions(input: {
  stored: StoredSession[];
  samples: SessionSample[];
  reachable: boolean;
  now?: number;
}): ReconcileResult {
  const nowIso = new Date(input.now ?? Date.now()).toISOString();
  const inserts: ReconcileResult["inserts"] = [];
  const updates: SessionPatch[] = [];

  if (!input.reachable) {
    for (const s of input.stored) {
      if (s.reconcile_status === "open") {
        updates.push({
          id: s.id,
          reconcile_status: "stale",
          reconcile_note: "Router unreachable — usage figures may be out of date.",
        });
      }
    }
    return { inserts, updates };
  }

  const byKey = new Map<string, StoredSession>();
  for (const s of input.stored) {
    if (s.external_session_id) byKey.set(s.external_session_id, s);
  }

  const seen = new Set<string>();
  for (const sample of input.samples) {
    seen.add(sample.external_session_id);
    const existing = byKey.get(sample.external_session_id);
    if (!existing) {
      inserts.push({ ...sample, source_seen_at: nowIso, reconcile_status: "open" });
      continue;
    }
    updates.push({
      id: existing.id,
      bytes_in: mergeCounter(existing.bytes_in, sample.bytes_in),
      bytes_out: mergeCounter(existing.bytes_out, sample.bytes_out),
      duration_seconds: Math.max(existing.duration_seconds, sample.duration_seconds),
      source_seen_at: nowIso,
      reconcile_status: "open",
      ended_at: null,
      reconcile_note: null,
    });
  }

  for (const s of input.stored) {
    if (s.ended_at) continue;
    if (s.external_session_id && seen.has(s.external_session_id)) continue;
    updates.push({
      id: s.id,
      ended_at: nowIso,
      reconcile_status: "closed",
      termination_reason: s.termination_reason ?? "router-report",
      source_seen_at: nowIso,
    });
  }

  return { inserts, updates };
}

/** Total bytes for a set of sessions, ignoring stale rows unless asked. */
export function usageTotals(sessions: StoredSession[], includeStale = true) {
  let bytes_in = 0;
  let bytes_out = 0;
  let seconds = 0;
  let stale = 0;
  for (const s of sessions) {
    if (s.reconcile_status === "stale") {
      stale += 1;
      if (!includeStale) continue;
    }
    bytes_in += s.bytes_in;
    bytes_out += s.bytes_out;
    seconds += s.duration_seconds;
  }
  return { bytes_in, bytes_out, seconds, stale };
}
