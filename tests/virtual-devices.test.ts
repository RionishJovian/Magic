import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TAG, cleanup, describeDb, resetTenant, sql, testOwner, trySql } from "./helpers/db";
import { resolvePaths } from "@/lib/router-conn.server";
import {
  isConnectorOnline,
  connectorIdOf,
  CONNECTOR_ONLINE_WINDOW_MS,
} from "@/lib/connector.server";
import { driverFor } from "@/lib/ap/registry.server";

/**
 * End-to-end audit of the three device paths the app supports, using virtual
 * hardware rows so nothing real is dialled:
 *   - MikroTik RB5009  → cloud / direct connect
 *   - MikroTik CCR2116 → local connector (bridge) transport
 *   - Ruijie outdoor AP → access-point controller driver
 */
describeDb("virtual device audit", () => {
  let owner = "";
  let rb5009 = "";
  let ccr2116 = "";
  let connectorId = "";
  let ruijieId = "";

  beforeAll(async () => {
    owner = await testOwner();
    await resetTenant(2, 1, 1);
  });
  afterAll(() => cleanup());

  it("adds a virtual RB5009 over cloud connect", async () => {
    // Insert and read back in one round trip.
    const row = (
      await sql(`with ins as (
        insert into public.router_connections
          (owner_id, name, host, port, username, password_ciphertext, use_tls, is_virtual, connection_mode)
        values ('${owner}', '${TAG}-RB5009', 'zztest-rb5009.sn.mynetname.net', 443,
                'api', 'ZZ-ciphertext', true, true, 'direct')
        returning id, connection_mode, connector_id, use_tls, is_virtual
      )
      select id::text, connection_mode, coalesce(connector_id::text,'-'), use_tls, is_virtual from ins`)
    ).split("|");

    rb5009 = row[0];
    expect(rb5009).toMatch(/^[0-9a-f-]{36}$/);
    expect(row[1]).toBe("direct");
    expect(row[2]).toBe("-"); // no connector: dialled from the cloud
    expect(row[3]).toBe("t");
    expect(row[4]).toBe("t");

    // Cloud/direct routers must resolve to their own REST base, no overrides.
    const direct = "https://zztest-rb5009.sn.mynetname.net:443/rest";
    expect(resolvePaths("auto", direct, undefined)).toEqual({});
    expect(connectorIdOf({ connector_id: null })).toBeNull();
  });

  it("adds a virtual CCR2116 bound to a local connector", async () => {
    // Both inserts plus the read-back share a single round trip.
    const out = await sql(`with c as (
        insert into public.connectors (owner_id, name, public_id, enabled, status)
        values ('${owner}', '${TAG}-shop-connector', 'cn_zztest0001', true, 'offline')
        returning id
      ), r as (
        insert into public.router_connections
          (owner_id, name, host, port, username, password_ciphertext, use_tls, is_virtual,
           connection_mode, connector_id)
        select '${owner}', '${TAG}-CCR2116', '192.168.88.1', 443, 'api', 'ZZ-ciphertext',
               true, true, 'direct', c.id from c
        returning id, connector_id
      )
      select r.id::text, r.connector_id::text from r`);
    const [routerId, bound] = out.split("|");

    ccr2116 = routerId;
    connectorId = bound;
    expect(bound).toMatch(/^[0-9a-f-]{36}$/);
    expect(connectorIdOf({ connector_id: bound })).toBe(connectorId);

    // The connector has never heart-beaten, so the device must fail fast.
    expect(isConnectorOnline({ enabled: true, status: "offline", last_seen_at: null })).toBe(false);
    // A stale heartbeat is offline too.
    const stale = new Date(Date.now() - CONNECTOR_ONLINE_WINDOW_MS - 1000).toISOString();
    expect(isConnectorOnline({ enabled: true, status: "online", last_seen_at: stale })).toBe(false);
    // A live, enabled connector is online.
    expect(
      isConnectorOnline({
        enabled: true,
        status: "online",
        last_seen_at: new Date().toISOString(),
      }),
    ).toBe(true);
    // Disabled connectors never dispatch, even while heart-beating.
    expect(
      isConnectorOnline({
        enabled: false,
        status: "online",
        last_seen_at: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it("rejects a third router once the 2-device allowance is used", async () => {
    const third = await trySql(`insert into public.router_connections
      (owner_id, name, host, port, username, password_ciphertext, use_tls)
      values ('${owner}', '${TAG}-hEX', '10.99.0.1', 443, 'api', 'ZZ-ciphertext', true)
      returning id`);
    expect(third.ok).toBe(false);
    expect(third.err).toMatch(/DEVICE_QUOTA_EXCEEDED/);
  });

  it("adds a virtual Ruijie outdoor AP controller and picks the Ruijie driver", async () => {
    const row = (
      await sql(`with ins as (
        insert into public.unifi_controllers
          (owner_id, name, host, port, unifi_site, username, password_ciphertext, brand, api_base_path)
        values ('${owner}', '${TAG}-Ruijie-Outdoor', '192.168.110.1', 443, 'default',
                'admin', 'ZZ-ciphertext', 'ruijie', '/api')
        returning id, brand, api_base_path
      )
      select id::text, brand, api_base_path from ins`)
    ).split("|");

    ruijieId = row[0];
    expect(row[1]).toBe("ruijie");
    expect(row[2]).toBe("/api");

    const driver = driverFor("ruijie");
    expect(driver).toBeTruthy();
    expect(driver).not.toBe(driverFor("unifi"));
    // Unknown brands must fall back to the generic driver rather than crash.
    expect(driverFor("totally-unknown")).toBe(driverFor("generic"));
  });

  it("leaves the tenant with exactly the audited devices", async () => {
    const out = await sql(
      `select string_agg(name, ',' order by name) from public.router_connections
         where owner_id = '${owner}' and name like '${TAG}%';
       select count(*) from public.unifi_controllers where id = '${ruijieId}';`,
    );
    const [names, ctrlCount] = out.split("\n");
    expect(names).toBe(`${TAG}-CCR2116,${TAG}-RB5009`);
    expect(Number(ctrlCount)).toBe(1);
    expect(ccr2116).toMatch(/^[0-9a-f-]{36}$/);
  });
});
