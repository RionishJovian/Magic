import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TAG, cleanup, dbIntegrationEnabled, resetTenant, sql, testOwner } from "./helpers/db";
import { routerCredentialPatch, commitRouterUpdate } from "@/lib/router-credentials.server";
import { loadRouterConn } from "@/lib/router-conn.server";
import { encryptSecret, decryptSecret } from "@/lib/crypto.server";

/**
 * Router Edit credential-save regression: create a router with old
 * credentials, edit with a new username/password, reload the row, then run
 * the same Test-path connection loader the app uses and assert it hands the
 * NEW credentials to RouterOS. Also covers blank-password preservation and
 * the no-updated-row (RLS-hidden / deleted) save failure.
 *
 * All secrets below are test-only values and are never logged.
 */
const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ready =
  dbIntegrationEnabled() &&
  SUPA_URL.length > 0 &&
  SUPA_SERVICE.length > 0 &&
  Boolean(process.env.APP_ROUTER_SECRET);
const describeCreds = ready ? describe : describe.skip;

const OLD_USER = "zz-old-api-user";
const OLD_PASS = "zz-old-pass-TESTONLY";
const NEW_USER = "zz-new-api-user";
const NEW_PASS = "zz-new-pass-TESTONLY";

function serviceClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPA_URL, SUPA_SERVICE, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function insertRouter(owner: string, suffix: string): Promise<string> {
  const id = (
    await sql(`insert into public.router_connections
      (owner_id, name, host, port, username, password_ciphertext, use_tls, connection_mode)
      values ('${owner}', '${TAG}-${suffix}', '192.0.2.10', 443,
              '${OLD_USER}', '${encryptSecret(OLD_PASS)}', true, 'direct')
      returning id`)
  ).trim();
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

describeCreds("router edit credential save regression", () => {
  let owner = "";
  let svc: SupabaseClient<Database>;

  beforeAll(async () => {
    svc = serviceClient();
    owner = await testOwner();
    await resetTenant(3, 1, 1);
  });
  afterAll(() => cleanup());

  it("edit with new username/password is what the Test path loads afterwards", async () => {
    const id = await insertRouter(owner, "edit-creds");

    // Save: the update branch of saveRouter.
    const patch = routerCredentialPatch({ username: NEW_USER, password: NEW_PASS });
    expect(patch.password_ciphertext).toBeTruthy();
    const committedId = await commitRouterUpdate(svc, id, { ...patch, port: 443 });
    expect(committedId).toBe(id);

    // Reload row straight from the DB: ciphertext rotated, never plaintext.
    const row = (
      await sql(
        `select username || '|' || password_ciphertext from public.router_connections where id = '${id}'`,
      )
    ).split("|");
    expect(row[0]).toBe(NEW_USER);
    expect(row[1]).not.toContain(NEW_PASS);
    expect(row[1]).not.toContain(OLD_PASS);
    expect(decryptSecret(row[1])).toBe(NEW_PASS);

    // The Test path (loadRouterConn) must hand RouterOS the new credentials.
    const conn = await loadRouterConn(svc, id);
    expect(conn.username).toBe(NEW_USER);
    expect(conn.password).toBe(NEW_PASS);
  });

  it("blank edit password preserves the stored ciphertext", async () => {
    const id = await insertRouter(owner, "edit-blank");

    const patch = routerCredentialPatch({ username: NEW_USER, password: "" });
    expect(patch).not.toHaveProperty("password_ciphertext");
    await commitRouterUpdate(svc, id, patch);

    const conn = await loadRouterConn(svc, id);
    expect(conn.username).toBe(NEW_USER);
    expect(conn.password).toBe(OLD_PASS); // preserved secret, unchanged ciphertext
  });

  it("fails the save clearly when no RLS-visible row is updated", async () => {
    await expect(commitRouterUpdate(svc, randomUUID(), { username: "zz-nobody" })).rejects.toThrow(
      /could not be updated/i,
    );
  });

  it("saveRouter source proves the update row via select().single()", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/routers.functions.ts", "utf8");
    expect(src).toContain("commitRouterUpdate");
    const helper = readFileSync("src/lib/router-credentials.server.ts", "utf8");
    expect(helper).toMatch(
      /\.update\(patch\)[\s\S]*\.eq\("id", id\)[\s\S]*\.select\("id"\)[\s\S]*\.single\(\)/,
    );
  });
});
