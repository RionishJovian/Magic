// Small psql helper used by the integration tests. The sandbox already has the
// PG* environment variables pointed at the project database.
//
// Connecting to the Supabase pooler costs ~2.5s, so spawning one `psql -c` per
// statement dominates the runtime of the database suites. Instead we keep a
// single long-lived `psql` session open and stream statements into it, framing
// each one with a sentinel on stdout (\echo) and stderr (\warn). Only the
// concurrency assertions still use one-off connections, because they need real
// parallel backends.
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { describe } from "vitest";

const execFileAsync = promisify(execFile);

const SENTINEL = "__ZZTEST_DONE__";

/** True when PG* env points at a real database (Supabase pooler in CI/dev). */
export function dbIntegrationEnabled(): boolean {
  return Boolean(process.env.PGHOST || process.env.PGDATABASE || process.env.DATABASE_URL);
}

/** Vitest describe that skips when no live Postgres is configured. */
export const describeDb = dbIntegrationEnabled() ? describe : describe.skip;

type Session = {
  proc: ChildProcessWithoutNullStreams;
  out: string;
  err: string;
  waiters: Array<() => void>;
};

let session: Session | null = null;

function getSession(): Session {
  if (session) return session;
  const proc = spawn("psql", ["-At", "-q", "--no-psqlrc"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  const s: Session = { proc, out: "", err: "", waiters: [] };
  const notify = () => {
    for (const w of s.waiters.splice(0)) w();
  };
  proc.stdout.on("data", (chunk: string) => {
    s.out += chunk;
    notify();
  });
  proc.stderr.on("data", (chunk: string) => {
    s.err += chunk;
    notify();
  });
  proc.on("exit", notify);
  proc.unref();
  session = s;
  return s;
}

export function closeSession(): void {
  if (!session) return;
  session.proc.stdin.end();
  session.proc.kill();
  session = null;
}

process.once("exit", closeSession);

/** Serialises statements onto the shared session. */
let queue: Promise<unknown> = Promise.resolve();

function runOnSession(query: string): Promise<SqlResult> {
  const task = async (): Promise<SqlResult> => {
    const s = getSession();
    s.out = "";
    s.err = "";
    s.proc.stdin.write(
      `${query.trim().replace(/;\s*$/, "")};\n\\echo ${SENTINEL}\n\\warn ${SENTINEL}\n`,
    );

    await new Promise<void>((resolve, reject) => {
      const check = () => {
        if (s.out.includes(SENTINEL) && s.err.includes(SENTINEL)) return resolve();
        if (s.proc.exitCode !== null) return reject(new Error(`psql session exited: ${s.err}`));
        s.waiters.push(check);
      };
      check();
    });

    const out = s.out.slice(0, s.out.indexOf(SENTINEL)).trim();
    const err = s.err.slice(0, s.err.indexOf(SENTINEL)).trim();
    return { ok: err === "", out, err };
  };

  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export type SqlResult = { ok: boolean; out: string; err: string };

/** Runs a statement on the shared session and throws on error. */
export async function sql(query: string): Promise<string> {
  const res = await runOnSession(query);
  if (!res.ok) throw new Error(res.err);
  return res.out;
}

/**
 * Runs a statement without throwing, so tests can assert on the error text.
 * Uses its own connection so concurrent callers hit genuinely parallel
 * backends (the shared session is serialised by design).
 */
export async function trySql(query: string): Promise<SqlResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "psql",
      ["-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", query],
      { encoding: "utf8" },
    );
    return { ok: true, out: stdout.trim(), err: stderr.trim() };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, out: (err.stdout ?? "").trim(), err: (err.stderr ?? "").trim() };
  }
}

/**
 * An existing non-privileged account used as the tenant under test. Resolved
 * once per run rather than hardcoded: a hardcoded UUID goes stale as soon as
 * that account is removed, and every insert then fails the owner_id foreign
 * key. We pick a client-role account that currently owns no devices, sites,
 * connectors or allowance row, so the suites never disturb real tenant data.
 */
let ownerPromise: Promise<string> | null = null;

export function testOwner(): Promise<string> {
  if (!ownerPromise) {
    ownerPromise = sql(`
      select user_id from (
        select ur.user_id,
          (select count(*) from public.router_connections r where r.owner_id = ur.user_id) rc,
          (select count(*) from public.unifi_controllers u where u.owner_id = ur.user_id) uc,
          (select count(*) from public.sites s where s.owner_id = ur.user_id) sc,
          (select count(*) from public.device_allowances d where d.owner_id = ur.user_id) da,
          (select count(*) from public.connectors c where c.owner_id = ur.user_id) cc
        from public.user_roles ur
        where ur.role = 'client'
      ) t
      where rc + uc + sc + da + cc = 0
      order by user_id
      limit 1`).then((found) => {
      const id = found.split("\n")[0];
      if (!id) throw new Error("No unused client account available for database tests.");
      return id;
    });
  }
  return ownerPromise;
}

export const TAG = "ZZTEST";

function cleanupSql(owner: string): string {
  return `
    delete from public.unifi_controllers where owner_id = '${owner}' and name like '${TAG}%';
    delete from public.router_connections where owner_id = '${owner}' and name like '${TAG}%';
    delete from public.sites where owner_id = '${owner}' and name like '${TAG}%';
    delete from public.connectors where owner_id = '${owner}' and name like '${TAG}%';
    delete from public.device_allowances where owner_id = '${owner}';`;
}

function allowanceSql(routers: number, controllers: number, sites: number, owner: string): string {
  // The test role intentionally has no UPDATE privilege, so replace the row
  // rather than upserting it.
  return `
    delete from public.device_allowances where owner_id = '${owner}';
    insert into public.device_allowances (owner_id, routers, controllers, sites)
    values ('${owner}', ${routers}, ${controllers}, ${sites});`;
}

export async function cleanup(owner?: string): Promise<void> {
  await sql(cleanupSql(owner ?? (await testOwner())));
}

export async function setAllowance(
  routers: number,
  controllers: number,
  sites: number,
  owner?: string,
): Promise<void> {
  await sql(allowanceSql(routers, controllers, sites, owner ?? (await testOwner())));
}

/** Cleanup + allowance in a single round trip — the usual beforeAll pairing. */
export async function resetTenant(
  routers: number,
  controllers: number,
  sites: number,
  owner?: string,
): Promise<void> {
  const o = owner ?? (await testOwner());
  await sql(`${cleanupSql(o)}${allowanceSql(routers, controllers, sites, o)}`);
}

export async function count(table: string, owner?: string): Promise<number> {
  const o = owner ?? (await testOwner());
  return Number(await sql(`select count(*) from public.${table} where owner_id = '${o}'`));
}

/** Counts the tagged rows of a table and purges them in one round trip. */
export async function countAndPurge(table: string, owner?: string): Promise<number> {
  const o = owner ?? (await testOwner());
  const out = await sql(
    `select count(*) from public.${table} where owner_id = '${o}';
     delete from public.${table} where owner_id = '${o}' and name like '${TAG}%';`,
  );
  return Number(out.split("\n")[0]);
}

export function insertRouterSql(name: string, host: string, owner: string): string {
  return `insert into public.router_connections
    (owner_id, name, host, port, username, password_ciphertext, use_tls)
    values ('${owner}', '${name}', '${host}', 443, 'api', 'ZZ-ciphertext', true)
    returning id`;
}
