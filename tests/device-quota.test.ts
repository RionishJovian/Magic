import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  TAG,
  cleanup,
  countAndPurge,
  describeDb,
  insertRouterSql,
  resetTenant,
  setAllowance,
  testOwner,
  trySql,
} from "./helpers/db";

const QUOTA_ERR = /DEVICE_QUOTA_EXCEEDED/;

describeDb("device quota trigger", () => {
  let owner = "";

  beforeAll(async () => {
    owner = await testOwner();
    await resetTenant(1, 1, 1);
  });
  afterAll(() => cleanup());

  it("accepts the first router and rejects the double-click duplicate", async () => {
    const first = await trySql(insertRouterSql(`${TAG}-dbl-1`, "10.10.0.1", owner));
    expect(first.ok).toBe(true);

    // Second click of the same button, a few ms later.
    const second = await trySql(insertRouterSql(`${TAG}-dbl-2`, "10.10.0.2", owner));
    expect(second.ok).toBe(false);
    expect(second.err).toMatch(QUOTA_ERR);

    expect(await countAndPurge("router_connections")).toBe(1);
  });

  it("lets exactly one of 8 concurrent router inserts through", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        trySql(insertRouterSql(`${TAG}-race-${i}`, `10.20.0.${i + 1}`, owner)),
      ),
    );
    const ok = results.filter((r) => r.ok);
    const rejected = results.filter((r) => !r.ok);

    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(7);
    for (const r of rejected) expect(r.err).toMatch(QUOTA_ERR);
    expect(await countAndPurge("router_connections")).toBe(1);
  });

  it("enforces the same limit for AP controllers under concurrency", async () => {
    const stmt = (i: number) => `insert into public.unifi_controllers
      (owner_id, name, host, port, unifi_site, username, password_ciphertext, brand)
      values ('${owner}', '${TAG}-ctrl-${i}', '10.30.0.${i + 1}', 8443, 'default', 'api', 'ZZ-ciphertext', 'unifi')
      returning id`;
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => trySql(stmt(i))));

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await countAndPurge("unifi_controllers")).toBe(1);
  });

  it("enforces the same limit for sites under concurrency", async () => {
    const stmt = (i: number) =>
      `insert into public.sites (owner_id, name) values ('${owner}', '${TAG}-site-${i}') returning id`;
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => trySql(stmt(i))));

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await countAndPurge("sites")).toBe(1);
  });

  it("honours a raised Plus-tier allowance", async () => {
    await setAllowance(3, 1, 1);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        trySql(insertRouterSql(`${TAG}-plus-${i}`, `10.40.0.${i + 1}`, owner)),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(await countAndPurge("router_connections")).toBe(3);

    await setAllowance(1, 1, 1);
  });
});
