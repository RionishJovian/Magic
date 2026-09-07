# Local Connector / Bridge (transport layer)

- Add a new **Connector** capability so any Router or Access Point/Controller can be reached either the way it is today (Cloud / Direct) or through a small MikroTik Magic Connector running inside the customer's LAN. Nothing existing is redesigned, restyled or replaced — Cloud/Direct devices keep working exactly as before.

```text
Cloud MikroTik Magic
   |  outbound HTTPS / WSS (started by the connector)
Local MikroTik Magic Connector
   |  LAN
Router / AP / Controller
```

The connector always dials out, so no port forwarding and no public IP is required on site.

## What gets built

**1. Connectors page (new tab, existing UI style)**

- List of connectors: name, connector ID, Online/Offline status, last seen, version, reported local network/IP.
- Create connector, generate/reveal a one-time pairing code, unpair, enable/disable, delete.
- "Test connection" action per connector.
- Devices currently bound to that connector, with their reachability.

**2. Connection method selector**

- Small "Connection method" field added to the existing Add/Edit Router form and Add/Edit Access Point/Controller form: `Cloud / Direct` (default, unchanged behaviour) or `Local Connector` + connector picker.
- No other change to those forms.

**3. Routing layer**

- One place decides transport: Cloud/Direct → today's code path untouched; Local Connector → request is dispatched to the connector over its live outbound channel.
- If the connector is not paired, disabled, or offline, every device call fails fast with a clear **"Connector offline"** state. No faked success, no silent fallback.
- Vendor protocols stay where they are — the connector is a generic transport, ready for future MikroTik / UniFi / Ruijie / Huawei adapters.

## Technical notes

- New tables: `connectors` (owner-scoped: name, public connector id, status, last_seen_at, version, local_ip/subnet, enabled, hashed pairing code + expiry, hashed auth token) and `connector_jobs` (queued request, response, status, expiry) for request/response over the outbound channel. Both get GRANTs + RLS scoped to `effective_owner(auth.uid())`, matching existing tables.
- Additive columns only: `router_connections.connector_id` and `unifi_controllers.connector_id`, both nullable; existing `connection_mode` / `connection_preference` semantics untouched. `connection_method` is derived — a row with a `connector_id` is `local_connector`, otherwise `cloud`.
- Connector endpoints live under `src/routes/api/public/connector/*` (pair, poll/claim job, post result, heartbeat) and authenticate with the connector's bearer token; pairing codes are one-time and short-lived. Tokens and codes are stored hashed/encrypted, never returned to the browser after the initial reveal.
- Device credentials are never sent to the browser; the cloud continues to hold them and only the intended request payload crosses to the connector.
- Server functions in `src/lib/connectors.functions.ts`; transport dispatch in a server-only helper so `src/lib/mikrotik.server.ts` and `src/lib/ap/*` keep their current shape.
- Roles/permissions reuse the existing owner/admin/client/expired guards and device-limit rules.

## Out of scope for this step

Vendor-specific adapters inside the connector, changes to the RouterOS REST client, the WireGuard tunnel feature, and any UI restyling.
