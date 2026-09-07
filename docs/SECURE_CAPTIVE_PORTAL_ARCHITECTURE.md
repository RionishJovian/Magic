# MikroMagic Secure Captive Portal — Architecture and Security Blueprint

**Status:** Architecture and local capability-lab design only. No production
Ruijie implementation is included.

**Audit date:** 2026-08-28

**Scope:** Local repository and local Docker configuration in
`/Users/aces/GitHub/mikromagic`. No production services, routers, databases,
VPS configuration, or mutation endpoints were contacted.

**Evidence rule:** `VERIFIED` below means supported by inspected repository
code, migrations, tests, or local configuration. It does not mean proven on a
live router. `UNVERIFIED` means that the repository contains no proof. A
security health UI must preserve this distinction.

## 1. Executive Summary

MikroMagic already contains a substantial MikroTik/RouterOS hotspot product:
tenant-scoped plans and voucher inventory, RouterOS user/profile provisioning,
branded portal generation and staged deployment, live hotspot reads, session
reconciliation logic, payment/order idempotency, audit records, endpoint/TLS
guards, Supabase RLS, and an OAuth-protected read-only MCP surface.

The safe direction for a Ruijie/Reyee target is additive. Keep plans,
entitlements, voucher policy, authoritative Magic sessions, expiry, quota,
revocation, and audit history in a vendor-neutral security engine. Add a
capability-gated Ruijie adapter only after the target device and firmware prove
which control plane can enforce authorization.

The security contract is:

```text
Guest
  -> gateway-controlled PRE_AUTH state (default deny)
  -> minimum portal/DHCP/DNS/captive-detection traffic only
  -> Magic validates voucher and entitlement atomically
  -> adapter requests gateway authorization
  -> gateway confirms authorization
  -> Magic session remains authoritative
  -> expiry/quota/revocation reconcile back to gateway
```

No design in this document treats a MAC address, IP address, reachability,
HTTP 200, telemetry, or a browser claim as proof of authentication. “VPN
proof”, “unhackable”, and “100% secure” are prohibited product claims.

## 2. Current Architecture Audit

### 2.1 Application and deployment shape

- TanStack Start, React 19, Vite, SSR, and Cloudflare/Lovable-oriented output.
- Bun is the canonical package manager. `package.json` exposes dev, build, test,
  lint, and i18n audit scripts.
- `src/agent/**` is a separately packaged Local Connector CLI, not part of the
  web development server.
- Supabase is the application database/auth boundary. Authenticated server
  functions use the caller JWT with the publishable key; service role is
  reserved for explicitly privileged backend work.
- Router communication is represented by `router_connections`, with direct
  RouterOS paths, Local Connector paths, and a WireGuard/Magic Hub control-plane
  path in the source tree.
- `src/server.ts` applies response security headers. The inspected policy
  includes CSP, clickjacking protection, MIME sniffing protection, referrer
  policy, Permissions-Policy, and HTTPS-only HSTS.

### 2.2 Existing domain components

| Concern | Existing repository evidence | Audit interpretation |
| --- | --- | --- |
| Portal settings/branding | `src/lib/portal.functions.ts`, `src/lib/portal-template.server.ts`, `src/lib/portal/guest-pages.server.ts` | Operator presentation is separate from router profile configuration. |
| Plans | `portal_plans`, `src/components/PlansPanel.tsx`, `src/lib/portal/plan-profile.ts` | Plan fields include duration, device limit, rate limit, price, VIP state, and stable plan identity. |
| Voucher inventory | `voucher_codes`, `src/lib/portal/voucher-codes.ts`, `app.vouchers.tsx` | App ledger is the inventory/source of truth; RouterOS state is an overlay. |
| RouterOS provisioning | `src/lib/mikrotik.server.ts`, `src/lib/mikrotik.functions.ts` | Codes are provisioned as RouterOS hotspot users; the existing workflow posts code as username and password. |
| HotSpot profiles | `src/lib/portal/plan-profile.ts`, deployment/preflight modules | A voucher is bound to a RouterOS profile and profile parameters. |
| Portal deploy | `src/lib/portal/deploy.server.ts`, `portal-probe.server.ts` | Versioned staging, preflight/probe, selected-profile switching, and rollback are present. |
| Sessions | `hotspot_sessions`, `src/lib/payments/sessions.ts` | External RouterOS session identity is tracked separately from Magic session state. |
| Payments | `payment_orders`, `payment_events`, payment modules | Idempotency key and provider-event uniqueness exist; payment is not the guest’s plan selector. |
| Reconciliation | `reconcileSessions`, voucher ledger reconciliation migration | Offline routers produce stale state rather than an invented closed state. |
| Security/audit | `router_ops_audit`, deploy audit, security runbook, endpoint guards | Several privileged actions are typed-confirmation and audit-gated. |
| MCP | `.lovable/mcp/manifest.json`, `src/lib/mcp/tools/**` | The documented surface is OAuth-protected and read-only. |

### 2.3 Existing security mechanisms found

- `requireSupabaseAuth` protects authenticated server functions and creates a
  user-scoped client with the caller’s JWT.
- Tenant scope is repeatedly resolved through `effective_owner`; router tenant
  access is checked from the stored router record rather than trusting an owner
  id supplied by the browser.
- Supabase tables inspected for portal, voucher, session, site, router, audit,
  and payment data have RLS migrations and tenant predicates. The exact live
  database state was not checked in this local-only phase.
- Portal guest-mode permissions have both server checks and a database trigger
  (`enforce_portal_guest_mode_grant`) to prevent direct PostgREST bypass.
- Voucher legacy import is service-role-only and requires a fresh server-side
  router read plus an audit reason.
- Voucher ledger reconciliation is append-only, uses row locks, restricts
  obsolete transitions to unused/unpaid codes, and records actor/reason/state
  transitions.
- Router endpoint validation rejects schemes, embedded ports, private/link-local/
  CGNAT/reserved addresses, and revalidates before dialing. Verified TLS is the
  default; self-signed TLS is a per-router, reasoned exception.
- Portal deployment captures prior text/profile state and stages a versioned
  directory. The runbook identifies binary asset restoration as a limitation.
- Operator-authored portal text is HTML-escaped and colors are constrained to
  six-digit CSS hex values. Voucher print content is escaped as well.
- Response headers include a CSP with same-origin framing restrictions and
  `script-src 'self' 'unsafe-inline'`; the inline-script allowance is an
  important future hardening consideration for the guest portal.
- Auth failures and login lookup use generic responses and a best-effort
  per-IP cooldown. The runbook explicitly calls the stateless cooldown a speed
  bump rather than a durable limiter.
- Test Lab distinguishes simulation-only sandbox activity from real-router
  actions, and real-router writes use typed confirmations and batch limits.

## 3. Existing MikroTik Flow

The existing intended flow is preserved:

```text
Operator/Admin
  -> create portal plan template
  -> generate app voucher codes
  -> bind code to plan / RouterOS HotSpot profile
  -> deploy or sync selected profile/users
  -> RouterOS ready

Guest
  -> associates to Wi-Fi
  -> RouterOS HotSpot intercepts
  -> branded login page is served from HotSpot html-directory
  -> guest enters voucher code
  -> code is submitted to RouterOS login flow
  -> RouterOS profile applies time/rate/quota policy
  -> Magic overlays and reconciles stored ledger/session state
```

The code and tests indicate that the guest does not choose a plan. The voucher
already carries its plan identity/profile binding. Portal branding, guest-mode
copy, payment method presentation, and assets remain separate from the
RouterOS profile configuration.

The RouterOS trial path is a separate temporary-access policy: RouterOS 7.1+
HotSpot trial, `login-by` including `trial`, `trial-user-profile=mm-trial`, and
the `T-$(mac-esc)` naming convention. It must not be conflated with sellable
voucher inventory.

### Existing limitations relevant to this mission

1. The inspected voucher table has `device_mac`, `first_seen_at`, and
   `expires_at`, but no demonstrated guest-facing atomic redemption endpoint in
   the repository for a vendor-neutral external portal.
2. The existing RouterOS login flow makes the board a participant in
   authentication. For Ruijie, the design must add a Magic-authoritative
   redemption transaction and then translate the decision to a gateway control
   supported by the device.
3. Existing `hotspot_sessions` RLS grants authenticated users broad row actions
   within their tenant. This is appropriate for the current operator-facing
   reconciliation model but should not be reused as an unauthenticated guest
   write path.
4. The current source contains no Ruijie/Reyee captive-portal adapter, RADIUS
   server, WISPr handler, Ruijie Cloud client, SNMP integration, or
   RG-EG310GH-P-E device fixture. Existing Ruijie access-point inventory/driver
   scaffolding is unrelated to captive-portal authorization and was not changed
   in the capability-lab phase.

## 4. Proposed Vendor-Neutral Architecture

```text
                    MIKROMAGIC SECURITY ENGINE
       +-----------------------------------------------+
       | tenant + policy + plan + voucher + entitlement |
       | atomic redemption + Magic session + audit      |
       | expiry/quota/revoke + reconciliation scheduler |
       +----------------------+------------------------+
                              |
                 canonical Authorization Decision
                              |
             +----------------+----------------+
             |                                 |
       MikroTik adapter                    Ruijie adapter
       RouterOS API /                    capability-gated
       HotSpot HTML                     portal/RADIUS/API
             |                                 |
       RouterOS gateway                 RG-EG310GH-P-E
```

The engine owns the business decision. An adapter owns only translation and
device-specific observation. Every adapter must expose explicit capabilities,
health evidence, idempotent authorization/revocation operations where the
vendor permits them, and a reconcile operation. An adapter may return
`unsupported` or `unverified`; it may not silently approximate a security
control.

Suggested conceptual records, additive to existing tables:

- `gateway_integrations`: tenant, site, vendor, model, firmware, network
  context, adapter, capability evidence, health, last successful read.
- `gateway_auth_bindings`: Magic session, gateway identity, authorization
  operation id, gateway result, observed state, timestamps, and failure reason.
- `magic_sessions`: authoritative session state, entitlement snapshot, client
  binding, usage counters, expiry, revocation, and reconciliation state.
- `voucher_redemption_attempts`: hashed/request-correlated attempt metadata,
  result class, actor/network context, and rate-limit outcome; never raw voucher
  secrets in logs.
- `security_health_checks`: control, target, evidence timestamp, expected,
  observed, status, and remediation reference.

These are design proposals only, not schema changes in this phase.

## 5. Ruijie Integration Boundary

The initial target is **Ruijie/Reyee RG-EG310GH-P-E**. No local source evidence
proves the model’s firmware, external portal parameters, WISPr behavior,
RADIUS attributes, Cloud API authorization, SNMP coverage, IPv6 enforcement,
or pre-auth firewall semantics. Therefore:

- no Ruijie mechanism is presently `VERIFIED`;
- network reachability must be tested separately from configuration
  programmability;
- the adapter must refuse to report `PROTECTED` until a device-specific test
  proves the control;
- unsupported or unverified controls must result in a warning or blocked
  rollout, according to product-owner policy.

Candidate boundary options, in decreasing order of proof required:

1. **External Portal/WISPr:** guest is redirected to Magic; the adapter must
   prove how a successful Magic decision is returned and how gateway session
   enforcement is applied.
2. **RADIUS:** evaluate whether the device can use RADIUS for captive access,
   accounting, interim updates, disconnect/revoke, and per-user limits. Do not
   infer these from the presence of a RADIUS setting.
3. **Ruijie Cloud API:** evaluate read, configuration, portal policy, client
   authorization, revoke, and event capabilities independently. Cloud reachability
   is not evidence that a desired operation exists.
4. **Private connectivity/WireGuard:** use only if the device or an approved
   local component supports it. A tunnel to the management plane does not itself
   create a data-plane authorization control.
5. **SNMP:** treat as monitoring/observation unless write and enforcement
   semantics are specifically proven. SNMP reachability is not authorization.

## 6. Trust Boundaries

```text
[Guest device]
  untrusted: user input, MAC, IP, DNS choice, browser state
        |
[Ruijie/MikroTik gateway + guest VLAN]
  untrusted until gateway policy proves PRE_AUTH isolation
        |
[External portal edge]
  public, hostile HTTP client; no tenant trust from query parameters
        |
[Magic authorization service]
  authoritative policy, transaction, session, audit
        |
[Supabase]
  RLS-scoped app client; service role only in narrowly reviewed backend paths
        |
[Adapter/control plane]
  authenticated transport, endpoint validation, idempotency, observed state
        |
[Gateway]
  enforcement authority for packets; may be stale, rebooted, misconfigured,
  or incapable of a requested control
```

The portal must not accept a tenant, plan, entitlement, or gateway identity
from an untrusted browser field without resolving and validating it against a
signed/short-lived gateway context. The browser is a presentation client, not
an authorization authority.

## 7. Authentication State Machine

| State | Meaning | Allowed transition | Internet policy |
| --- | --- | --- | --- |
| `PRE_AUTH` | Client has network presence but no Magic authorization | Validated portal request, or timeout/deny | Only explicit DHCP/DNS/portal/captive-detection exceptions |
| `CHALLENGE` | Redemption request is being rate-limited/validated | Valid voucher transaction or failure | Same as PRE_AUTH |
| `AUTHORIZED_PENDING_GATEWAY` | Magic accepted entitlement; gateway confirmation outstanding | Gateway confirms current authorization | Still restricted until confirmation |
| `ACTIVE` | Magic session exists and gateway authorization is observed | Usage/heartbeat, logout, expiry, revoke, quota exhaustion, disconnect | Entitlement policy |
| `STALE` | Observation or gateway link is outdated | Fresh reconcile, explicit revoke, or policy timeout | Product policy; never silently extend entitlement |
| `EXPIRED` | Time entitlement ended | New redemption if voucher policy allows | Deny; revoke gateway state |
| `REVOKED` | Operator/system revoked | New independent redemption only | Deny; revoke gateway state |
| `QUOTA_EXHAUSTED` | Data/time quota consumed | New entitlement only | Deny; revoke gateway state |
| `DENIED` | No valid authorization | New attempt subject to limits | Deny |

Required invariant:

```text
ACTIVE requires Magic entitlement valid
       AND gateway authorization confirmed recently
       AND no revocation/expiry/quota terminal condition
```

MAC and IP are session attributes. They may assist correlation, but neither
can cause a transition to `ACTIVE` by itself. A changed MAC/IP causes a fresh
gateway observation and policy decision; it does not prove continuity.

## 8. Threat Model

| Threat | Required design response | Claim status before device proof |
| --- | --- | --- |
| VPN bypass | PRE_AUTH default deny, explicit egress allowlist, test common VPN/protocol classes, report gateway limits | `UNVERIFIED` for Ruijie |
| DNS tunneling | Force/redirect DNS to controlled resolver where gateway proves it can; deny arbitrary UDP/TCP 53 pre-auth; inspect volume/abuse later | `UNVERIFIED` |
| HTTP Injector/injection | Deny unauthorized TCP/80/443 and alternate tunnels pre-auth; validate gateway behavior; do not rely on portal HTML alone | `UNVERIFIED` |
| ICMP tunneling | Deny pre-auth ICMP unless captive operation demonstrably requires a narrow exception | `UNVERIFIED` |
| MAC spoofing/session cloning | Magic session id plus gateway/session/client/IP observations; optional first-device binding and replacement workflow | Engine design; device enforcement `UNVERIFIED` |
| IP/MAC manipulation | Never identify by MAC alone; revalidate DHCP/gateway binding and session state | `UNVERIFIED` |
| Walled-garden leakage | Small exact destinations; no broad CDN/cloud ranges; continuous negative tests | `UNVERIFIED` |
| Auth VLAN/range escape | Bind integration to site/VLAN/subnet and test alternate VLANs, IPv4 ranges, and routing paths | `UNVERIFIED` |
| Seamless/stale login | Short authorization freshness, explicit reconnect/reconcile, revoke on terminal state | `UNVERIFIED` |
| Voucher brute force | Strict format, durable per-source/per-tenant limits, attempt budget, generic errors, audit | Partially mitigated in existing login cooldown; guest redemption not proven |
| Automated voucher scripting | Rate limits, proof-of-work/challenge only if usable, velocity/anomaly signals, one transaction per policy | `UNVERIFIED` |
| Sharing/concurrent use | Plan device limit, atomic active-binding count, optional first-device bind, explicit replacement | Existing plan device field; atomic guest path not proven |
| Replay | Single-use redemption transaction, nonce/context binding, idempotency response handling | `UNVERIFIED` for external portal |
| Simultaneous redemption | Database row lock/conditional update/unique binding and one winner | Design requirement; not implemented here |
| HTML/script injection/XSS | Strict schemas, contextual output encoding, sanitization only where required, CSP, no user data in script contexts | Existing escaping; CSP has inline-script tradeoff |
| CSRF | SameSite cookies plus origin/CSRF token for state-changing browser requests; do not use cookies for guest bearer state without review | Endpoint-specific audit required |
| Open redirect | Allowlisted local/portal completion destinations; reject arbitrary URL schemes/hosts | `UNVERIFIED` for new flow |
| Token theft | Short-lived signed gateway context, secure transport, no voucher in URLs/logs where avoidable, redaction | `UNVERIFIED` for new flow |
| Magic/gateway desync | Binding records, idempotent adapter calls, reconcile on timers/events/reconnect, fail closed for new auth | Existing RouterOS reconciliation pattern reusable |
| Magic/VPS/Ruijie failure | No new authorization; existing-session policy requires product decision | New-auth fail-closed design |
| IPv6 bypass | Disable IPv6 pre-auth or prove equivalent IPv6 guard; test RA/DHCPv6/NDP paths | `UNVERIFIED` |
| DoH/DoT | Block or policy-route known resolver ports/addresses only if gateway can enforce; cannot claim complete detection | `UNVERIFIED` |
| QUIC/UDP 443 | Deny pre-auth unless required; verify fallback behavior and authenticated policy | `UNVERIFIED` |

## 9. Pre-Auth Guard

The target policy is:

```text
PRE_AUTH = DENY
  allow DHCP required by the gateway/client
  allow controlled DNS only, if the gateway can force it
  allow exact Magic portal/auth destinations and required protocols
  allow only the minimum captive-detection destinations proven necessary
  deny all other IPv4 and IPv6 traffic
```

Each exception must record destination, owner/component, protocol/port,
purpose, expiry/review date, and security consequence. FQDN rules must resolve
and validate addresses without silently expanding to an entire CDN. Shared
hosting and cloud-provider ranges are not acceptable substitutes for exact
destinations.

Before declaring `PROTECTED`, the device test must show that an unauthenticated
client cannot obtain ordinary Internet service by using:

- an arbitrary external DNS resolver;
- TCP/80, arbitrary TCP/443, UDP/443, or alternate ports;
- ICMP, IPv6 router advertisement/DHCPv6, or another VLAN/routed range;
- a VPN, DoH, DoT, DNS tunnel, or HTTP tunnel class;
- a stale browser cookie, old IP, cloned MAC, or reconnect after gateway loss.

The gateway’s actual capabilities determine whether these are `PROTECTED`,
`MITIGATED`, `WARNING`, `UNVERIFIED`, `UNSUPPORTED`, or `FAILED`.

## 10. Voucher Security

The external portal redemption contract should be a server-authoritative
transaction, conceptually:

```text
1. Parse request under a strict voucher grammar and bounded size.
2. Resolve gateway/site context from a trusted short-lived context.
3. Apply durable rate and attempt budgets before revealing validity.
4. Lock the voucher and relevant active-device rows in one database transaction.
5. Reject inactive/expired/revoked/used/quota-exhausted codes.
6. Validate plan, tenant, gateway/site, and simultaneous-device policy.
7. Create one Magic session and immutable redemption event.
8. Commit before requesting gateway authorization, using an idempotency key.
9. Confirm gateway authorization; otherwise mark pending/failed and reconcile.
10. Return a generic failure or a minimal success result; never return secrets.
```

The concurrency invariant is mandatory: two simultaneous requests for a
single-use voucher produce at most one committed redemption. A PostgreSQL row
lock plus a conditional status/binding update and a uniqueness constraint on
the active binding are the preferred implementation mechanisms. A retry with
the same idempotency key may receive the original outcome, but a different
request cannot create a second session.

Generation should use a cryptographically secure random source, a bounded
alphabet, sufficient entropy, collision retry, and tenant-scoped uniqueness.
The raw code should be shown only at controlled operator/guest surfaces; logs,
metrics, and audit records should use a keyed hash or redacted representation.

Voucher policy must explicitly define duration, absolute expiry, data quota,
rate limit, maximum simultaneous devices, whether first-device binding is
enabled, and how a controlled device replacement is approved. The guest does
not select a plan.

## 11. Session Security

The authoritative Magic session should contain at least:

```text
session_id, tenant_id, site_id, gateway_id, vendor, voucher_id,
entitlement_snapshot, client_mac_observed, client_ip_observed,
network_vlan, authorized_at, last_observed_at, expires_at,
quota_limit, usage_in/out, gateway_binding_id, gateway_state,
revocation_state, reconcile_state, created_at, updated_at
```

Handling rules:

- MAC change: do not transfer automatically; reobserve and apply the binding
  policy. If first-device binding is enabled, require an explicit replacement
  workflow.
- IP change: allow only when gateway evidence ties the new address to the same
  current client/session; otherwise mark for reconciliation.
- Duplicate sessions: enforce plan limit in the same transaction as redemption;
  never count a client by MAC alone.
- Gateway reconnect/reboot: mark observations stale, re-read current clients,
  and reapply only still-valid sessions. Do not extend expiry because the
  gateway was offline.
- Magic restart: recover from durable state and reconcile before making new
  authorization decisions if the policy requires a healthy control plane.
- Expiry/quota/revoke: transition Magic to terminal state and issue idempotent
  gateway disconnect/revoke. If that operation is unavailable, surface a
  security failure and keep the integration in a restricted health state.

## 12. Session Reconciliation

Reconciliation is a control loop, not a reporting-only feature:

```text
Magic entitlement/session
        | desired state
        v
Adapter authorization binding
        | observed state
        v
Gateway client/session
        |
  compare -> corrective action -> audit -> next observation
```

Triggers must include session start, gateway authorization response, periodic
poll, gateway reconnect/reboot, Magic service recovery, expiry boundary, quota
threshold/exhaustion, logout, manual revoke, adapter error, and orphan detection.

Rules:

- Magic `EXPIRED`, `REVOKED`, or `QUOTA_EXHAUSTED` with gateway `AUTHENTICATED`
  is a high-severity desynchronization. Revoke immediately where supported;
  otherwise mark `FAILED`, alert the operator, and do not issue new sessions.
- Gateway client absent while Magic is active is not automatically a voucher
  failure; mark the observation closed/stale according to reachability and keep
  monotonic usage counters.
- Gateway reports an unknown active session: record an orphan, do not attach it
  to a voucher based only on MAC/IP, and investigate/revoke according to policy.
- Adapter calls must be idempotent and carry an operation id so retries after a
  timeout cannot produce duplicate authorization.
- Reconciliation must distinguish “gateway unreachable”, “gateway says
  denied”, “gateway lacks capability”, and “Magic state invalid”.

## 13. Failure / Fail-Closed Model

For new unauthenticated guests:

```text
Magic unavailable / adapter unavailable / gateway state unknown
  -> no new Magic session
  -> no new gateway authorization
  -> PRE_AUTH remains restricted
  -> operator-visible health event
```

Existing authenticated sessions are a product decision, not an accidental
side-effect. Options are:

1. **Immediate fail-closed:** revoke/expire existing access when the control
   plane cannot be trusted. Strongest security; causes visible disruption.
2. **Bounded grace:** allow an already-confirmed gateway binding for a short,
   fixed period, with no renewal or new sessions. Better continuity; requires
   gateway support and increases stale-access risk.
3. **Gateway-owned lease:** issue a short gateway lease whose expiry is
   independent of Magic availability. Operationally resilient; requires proven
   gateway lease/revocation semantics.

Product-owner approval is required before selecting one. “Allow until the
router says otherwise” is not an acceptable implicit default.

## 14. Portal Application Security

- The server resolves tenant, site, gateway, voucher, plan, and entitlement;
  browser state is advisory only.
- Use a strict Zod-like schema for every input: bounded lengths, normalized
  code grammar, no arbitrary URLs, no unbounded JSON, and no gateway identity
  taken from a hidden field.
- Encode operator and guest text for its actual output context. Never insert
  voucher/user input into HTML, CSS, JavaScript, SQL, redirects, or shell
  commands without context-specific handling.
- Keep portal assets static and versioned. If rich operator HTML is ever
  allowed, sanitize with an explicit safe subset and test it independently.
- Retain CSP; evaluate removal of `'unsafe-inline'` for the guest surface by
  using nonces/hashes or external scripts. A CSP header alone is not proof of
  XSS resistance.
- Use secure, HttpOnly, SameSite cookies when cookies are necessary. Prefer a
  short-lived signed portal context over a reusable voucher bearer in a URL.
- Add CSRF protection to cookie-authenticated state-changing operator endpoints.
  Guest redemption should use a deliberate anti-replay design and not inherit
  dashboard cookies.
- Allow only same-application completion redirects or an explicit allowlist.
- Apply durable rate limits at the edge/application/database boundary; the
  current stateless login cooldown is not sufficient for voucher abuse.
- Log authentication attempts, result class, tenant/site/gateway context,
  correlation id, and rate-limit action. Do not log voucher plaintext, tokens,
  passwords, signing secrets, or certificate material.
- Keep failure messages generic: distinguish operator diagnostics in protected
  telemetry from guest-visible “code not accepted” responses.

## 15. Walled Garden Policy

The initial allowlist should contain only:

| Destination | Purpose | Protocol | Owner | Consequence if broadened |
| --- | --- | --- | --- | --- |
| Gateway DHCP service | Address acquisition | DHCP/required gateway protocol | Gateway adapter | Client cannot reach portal if removed |
| Gateway-controlled DNS resolver | Captive name resolution | UDP/TCP 53 as proven | Gateway/network owner | Arbitrary DNS can create tunnels/leakage |
| Exact Magic portal origin/API paths | Login, context, redemption result | HTTPS 443 | Magic platform | Broad origin/CDN access may expose unrelated data |
| Minimum OS captive-detection endpoints | Device UX only, if required | Exact vendor-supported destinations | Gateway owner | Broad exceptions become unauthenticated Internet |

The list must not include `0.0.0.0/0`, a whole public cloud provider, an entire
CDN, wildcard domains without an owner and review, or arbitrary payment/analytics
origins. Every change requires a health check and negative leakage test.

## 16. UI/UX Security Model

Security should be operator-readable from the front side of MikroMagic:

```text
Secure Hotspot
  Pre-auth isolation             UNVERIFIED
  Controlled DNS                  UNVERIFIED
  HTTP/HTTPS pre-auth denial      UNVERIFIED
  ICMP pre-auth                   UNVERIFIED
  Walled garden                   UNVERIFIED
  Voucher abuse protection        MITIGATED / evidence-linked
  Replay protection               UNVERIFIED
  Session reconciliation          MITIGATED for existing RouterOS model
  IPv6 pre-auth protection        UNVERIFIED
  DoH / DoT                       UNVERIFIED
  QUIC / UDP-443                  UNVERIFIED
```

The UI must show status, evidence timestamp, target device/firmware, expected
behavior, observed behavior, limitations, and remediation. “Protected” is
allowed only when a repeatable device-specific check passed. “Reachable”,
“online”, “configured”, and “HTTP 200” must never be rendered as “Protected”.

Recommended operator surfaces:

- Secure Hotspot overview: state, last check, blockers, and next safe action.
- Pre-Auth Protection: exact allowlist, owner, protocol, review date, and
  gateway capability evidence.
- Voucher Protection: rate-limit budget, redemption outcome counts, duplicate
  attempts, and concurrent-redemption incidents without exposing codes.
- Session Protection: active/stale/orphaned/revoked counts and reconciliation
  actions with tenant-scoped audit history.
- Gateway Sync: Magic desired state versus gateway observed state, with a
  clear fail-closed banner when corrective action is unsupported.
- Security Health: evidence-backed statuses only; no marketing guarantees.

## 17. Security Health Check

The future health engine should use these statuses:

`PROTECTED`, `MITIGATED`, `WARNING`, `UNVERIFIED`, `UNSUPPORTED`, `FAILED`.

Each check stores:

```text
check_id, control, tenant/site/gateway, vendor/model/firmware,
started_at, completed_at, expected_behavior, observed_behavior,
status, evidence_reference, limitation, remediation, operator_visibility
```

Checks should be split into configuration inspection, safe positive behavior,
and safe negative behavior. A configuration read is not enough to say that a
packet was denied. An adapter must identify which checks it can run locally,
which require a lab client, and which cannot be tested without vendor support.

## 18. Ruijie Capability Matrix

This is the initial local-audit matrix. It deliberately contains no invented
Ruijie claims.

| Capability | Status | Local evidence / gap | Gate before implementation |
| --- | --- | --- | --- |
| RG-EG310GH-P-E model/firmware behavior | UNVERIFIED | No device fixture or test output in repo | Obtain exact hardware/firmware and isolated lab |
| External Portal/WISPr interception | UNVERIFIED | No Ruijie portal config or handler | Prove redirect, context, return, and failure behavior |
| Magic success callback to gateway authorization | UNVERIFIED | No adapter/control endpoint | Prove authenticated, replay-safe, idempotent operation |
| RADIUS authentication | UNVERIFIED | No RADIUS server/attributes/accounting code | Verify supported auth/accounting/CoA semantics |
| Ruijie Cloud API | UNVERIFIED | No client, credentials, or fixtures | Verify documented read/write scope in a lab tenant |
| Private connectivity/WireGuard | UNVERIFIED | Existing WireGuard is for MikroTik/control-plane paths | Prove device support and data/control-plane separation |
| SNMP monitoring | UNVERIFIED | No Ruijie SNMP integration | Verify read-only monitoring usefulness and limits |
| Pre-auth default deny | UNVERIFIED | No Ruijie policy evidence | Packet-test from isolated clients |
| Forced controlled DNS | UNVERIFIED | No Ruijie DNS enforcement evidence | Test UDP/TCP 53 and resolver escape |
| ICMP pre-auth denial | UNVERIFIED | No device test | Test IPv4 and IPv6 ICMP requirements |
| IPv6 pre-auth isolation | UNVERIFIED | No IPv6 gateway design | Test RA/DHCPv6/NDP and global IPv6 egress |
| DoH/DoT control | UNVERIFIED | No capability evidence | Test policy limitations; never overclaim |
| QUIC/UDP-443 control | UNVERIFIED | No capability evidence | Test pre-auth and authenticated behavior |
| Client/session binding | UNVERIFIED | No Ruijie session API/telemetry | Prove binding beyond MAC alone |
| Disconnect/revoke | UNVERIFIED | No CoA/API/portal revoke path | Prove terminal-state enforcement |
| Usage/quota accounting | UNVERIFIED | No Ruijie accounting integration | Prove monotonic counters and reset behavior |
| Gateway reboot reconciliation | UNVERIFIED | No adapter/reconnect path | Test reboot, reconnect, stale leases |

### 18.1 Baseline capability verification update

The local repository and generic fake gateway provide no device-specific
runtime evidence. This baseline remains deliberately `UNVERIFIED`; research
leads supplied for this phase were not promoted to runtime capabilities.
Official documentation claims are recorded separately in section 18.2.
`VERIFIED` requires a captured result from the exact RG-EG310GH-P-E model and
recorded ReyeeOS firmware. `UNSUPPORTED` is reserved for a documented device
limitation, not an untested feature.

| Target capability | Status | Evidence required |
| --- | --- | --- |
| External captive portal support | UNVERIFIED | Device configuration and isolated redirect test |
| Third-party authentication | UNVERIFIED | Exact firmware documentation plus lab transaction |
| WISPr interoperability | UNVERIFIED | Captured request/return fields and failure behavior |
| RADIUS guest authorization | UNVERIFIED | Auth, accounting, interim, and failure tests |
| Client MAC/IP/gateway/SSID parameters | UNVERIFIED | Redacted portal request capture and binding test |
| Successful-auth callback | UNVERIFIED | Authenticated, replay-safe gateway authorization proof |
| Explicit disconnect/revoke | UNVERIFIED | Active-session revoke and reconnect test |
| Accounting start/stop/interim | UNVERIFIED | Correlated records with monotonic counters |
| Session timeout | UNVERIFIED | Timer-expiry packet and session evidence |
| Data quota | UNVERIFIED | Exact byte-limit and post-limit reauth test |
| Bandwidth/rate enforcement | UNVERIFIED | Per-client rate test under controlled traffic |
| Authentication VLAN/IP-range scope | UNVERIFIED | Alternate VLAN/subnet escape tests |
| Pre-auth allowlist/walled garden | UNVERIFIED | Positive allowlist and negative leakage tests |
| Authentication-free exceptions | UNVERIFIED | Exception scope, persistence, and bypass tests |
| Seamless Online behavior | UNVERIFIED | Expiry/revoke/reconnect stale-trust test |
| HTTP injection prevention | UNVERIFIED | Defensive HTTP tunnel-class denial test |
| DNS enforcement | UNVERIFIED | UDP/TCP 53 external-resolver denial test |
| ICMP pre-auth control | UNVERIFIED | IPv4/IPv6 ICMP pre-auth test |
| IPv6 pre-auth enforcement | UNVERIFIED | RA/DHCPv6/global-egress test |
| DoH behavior | UNVERIFIED | HTTPS resolver policy test and limitation record |
| DoT behavior | UNVERIFIED | TCP 853 policy test and limitation record |
| QUIC/UDP-443 behavior | UNVERIFIED | Pre-auth UDP/443 denial test |
| VPN/tunneling behavior | UNVERIFIED | Representative handshake-class tests; no brand claims |
| SNMP monitoring | UNVERIFIED | Read-only OID inventory and freshness test |
| WireGuard/private connectivity | UNVERIFIED | Device support and control/data-plane isolation proof |
| Ruijie Cloud API | UNVERIFIED | Lab tenant API scope, read/write, and revoke evidence |

No exact-device runtime capability is `VERIFIED` as of this update. The
generic fake gateway validates architecture state transitions only; it is not
evidence about Ruijie firmware. The official-document review and its evidence
limits are below.

### 18.2 Official evidence review: RG-EG310GH-P-E / ReyeeOS 2.430

Evidence levels used here are intentionally strict:

- `DOCUMENTED`: an official Ruijie/Reyee document or product-family resource
  states the capability for the target model/firmware or an explicitly
  applicable model family. It does not prove packet behavior or the complete
  integration transaction.
- `VERIFIED`: demonstrated against the exact RG-EG310GH-P-E in the isolated
  lab with the firmware recorded. None exists yet.
- `MITIGATED`: controlled by the shared MikroMagic engine or represented by a
  generic local test double, not proven to be enforced by the gateway.
- `UNVERIFIED`: no sufficient target-specific runtime or documentation
  evidence was found.
- `UNSUPPORTED`: an official limitation explicitly rules the capability out.
  None was established in this review.

The product owner supplied official ReyeeOS 2.430 release-note evidence listing
`RG-EG310GH-P-E 1.xx`, `ReyeeOS 2.430.0.1924`, and
`EG_3.0(1)B11P430 Release(13192420)`. The supplied notes document, for the
relevant RG-EG3XX family, ACL capacity up to 128 ACEs, DNS blocklist/allowlist,
data-plan expiration/quota features, upload/download rate-limiting policies,
and captive-portal/authentication-related functionality. The supplied release
note file or stable public URL is not present in this repository, so its exact
page/section identifiers still need to be attached to the evidence record.

The official [RG-EG310GH-P-E product/resource page](https://reyee.ruijie.com/en-global/products/reyee-router/eg-series/rg-eg310gh-p-e/)
identifies the target as an EG-series router and exposes configuration,
implementation, software, and release-note resource categories. The official
[EG-series hotel solution](https://reyee.ruijie.com/en-global/solutions/smb/5-star-hotel/)
describes cloud, local, and third-party authentication modes and user-based
upload/download, connected-client, and traffic-quota controls at family/solution
level. The official [EG-series Implementation Cookbook](https://reyee.ruijie.com/en-global/support/documents/slide_ruijie-reyee-rg-eg-series-routers-implementation-cookbook/)
was also reviewed as the applicable configuration-document collection. These
family/solution statements do not prove the exact request parameters, success
return, authorization commit, disconnect, accounting, or pre-auth packet
policy for this model and firmware.

New official evidence is the [Reyee third-party captive portal integration
article](https://reyee.ruijie.com/en-global/blog/third-party-captive-portal-integration/).
It explicitly describes the client-developed path as: develop a WISPr
interface, obtain API documentation on Ruijie Cloud, then configure the portal
server IP on gateway eWeb. Its R&D-assisted path says to configure WISPr
protocol parameters on gateway eWeb, configure the portal server address, and
test the connection. This establishes WISPr as the documented integration
protocol and the gateway eWeb configuration boundary; it does not publish the
wire-level request, response, token, timeout, accounting, or revoke contract.

An official [Ruijie staff configuration article](https://community.ruijienetworks.com/forum.php?mod=viewthread&tid=7805)
states that Reyee EG gateways interwork with WISPr-compliant external
authentication servers and explicitly lists `RG-EG310GH-E`,
`RG-EG305GH-P-E`, and `EG310GH-P-E` on ReyeeOS 2.237 or later. It documents
`Cloud Auth`, `Third-party Authentication`, `Auth Server URL`, `Client Escape`,
`Authentication Type`, customizable HTTP parameters/request methods, and an
Online Clients view containing client IP, MAC, login time, and authentication
mode. It also states that the authentication type can be RADIUS, local account,
or no authentication. This is official configuration evidence, not exact
2.430 runtime proof; the model name in that article omits the `RG-` prefix.

#### 18.2.1 Capability evidence matrix

`Source` uses `PO release notes` for the official notes supplied by the product
owner and `official web` for the linked Ruijie resource. A row marked
`DOCUMENTED` records only the narrow capability actually stated; the
“not proven” column is the boundary that prevents it becoming `VERIFIED`.

| Capability | Status | Source | Model | Firmware | Document section | What is proven | What is not proven | Runtime test required | Security implication |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| External captive portal support | DOCUMENTED | PO release notes; official web family solution | RG-EG310GH-P-E / EG series | 2.430 target record; family statement | Auth/captive portal; Versatile Captive Portal | Captive/third-party auth functionality is documented | Exact external-portal redirect and return transaction | Redirect, context, success, failure, timeout | Do not grant access until the gateway-side commit is proven |
| Third-party authentication | DOCUMENTED | Official web family solution | EG series; target applicability not parameterized | Not exact in web source | Versatile Captive Portal | Family supports third-party authentication mode | Exact target firmware UI/API and protocol | Configure target and capture full exchange | The external server may validate without actually opening traffic |
| WISPr interoperability | DOCUMENTED | Official integration article; official staff configuration article | EG310GH-P-E named; EG series | Article supports ReyeeOS 2.237+; target 2.430 supplied | WISPr; Cloud Auth / Third-party Authentication | WISPr interface and WISPr-compliant external server are documented; target family/model is named | Exact fields, methods, success response, security, and runtime behavior | Redacted request/return and negative tests | WISPr is the leading boundary, but no access grant without proven response semantics |
| RADIUS guest authorization | DOCUMENTED | Official staff configuration article | EG310GH-P-E named | ReyeeOS 2.237+ article; target 2.430 supplied | Third-party Authentication / Authentication Type | RADIUS is one selectable authentication type for third-party authentication | Whether gateway-to-portal handoff requires RADIUS; attributes, accounting, and CoA | Access-Request/Accept/Reject lab test | Treat RADIUS as optional backend evidence, not the primary handoff assumption |
| Client MAC/IP/gateway/SSID parameters | DOCUMENTED | Official staff configuration article | EG310GH-P-E named | ReyeeOS 2.237+ article; target 2.430 supplied | Getting Started; Online Clients | Server must obtain client MAC; online view documents client IP and MAC | Exact WISPr parameter names, gateway ID, SSID, original URL, integrity, and binding | Capture and mutate each parameter | MAC/IP are inputs, never sole authoritative identity |
| Successful-auth callback | UNVERIFIED | No target callback documentation found | Target unknown | Target unknown | Not established | Nothing | WISPr return, HTTP callback, API, or other commit mechanism | Prove authenticated, replay-safe commit | A portal success page is not authorization |
| Explicit disconnect/revoke | DOCUMENTED | Official staff configuration article | EG310GH-P-E named | ReyeeOS 2.237+ article; target 2.430 supplied | Online Clients | Online Clients provides a Delete action to kick a selected client and disconnect Wi-Fi | API/CoA semantics, durable revoke, and exact session identifier | Revoke active session and test re-login | Manual kick is not sufficient for automated Magic reconciliation |
| RADIUS CoA | UNVERIFIED | No target CoA evidence | Target unknown | Target unknown | Not established | Nothing | CoA support, secret handling, and session identifiers | CoA disconnect in isolated RADIUS lab | Never claim stale-session enforcement without it or another proven path |
| Accounting start/stop/interim | UNVERIFIED | No target accounting evidence | Target unknown | Target unknown | Not established | Nothing | Record fields, interim interval, counters, correlation | Compare gateway and Magic records | Quota/revenue reconciliation cannot rely on guesses |
| Session timeout | UNVERIFIED | PO notes say expiration/quota, not session timer semantics | Target | 2.430 | Auth & Accounts boundary incomplete | Expiration/quota-related features are documented | Exact session timer and enforcement behavior | Timer expiry and re-auth test | Time expiry must terminate active access |
| Data quota | DOCUMENTED | PO release notes; official web family solution | RG-EG310GH-P-E 1.xx / EG series | 2.430.0.1924 family record | Auth & Accounts; bandwidth control | Data-plan/quota capability is documented | Counter source, precision, reset, and post-limit disconnect | Exact byte limit and post-limit traffic test | Magic remains quota authority until gateway behavior is proven |
| Upload/download rate enforcement | DOCUMENTED | PO release notes; official web family solution | RG-EG310GH-P-E 1.xx / EG series | 2.430 family record | Auth & Accounts; bandwidth control | Rate limiting is documented | Exact scope, units, and enforcement under load | Controlled per-client rate test | Useful entitlement enforcement, not pre-auth isolation proof |
| Authentication VLAN/IP-range scope | UNVERIFIED | No exact configuration section captured | Target unknown | Target unknown | Not established | Nothing target-specific | Scope boundaries and escape behavior | Alternate VLAN/subnet tests | Scope gaps can bypass the portal |
| ACL capacity / pre-auth ACL primitive | DOCUMENTED | PO release notes | RG-EG3XX family including target record | 2.430 family record | ACL | Up to 128 ACEs is documented | Whether ACLs bind to pre-auth state and exact ordering | Positive/negative packet tests | Capacity does not prove default-deny semantics |
| Pre-auth allowlist / walled garden | UNVERIFIED | No exact access-server policy section captured | Target unknown | Target unknown | Not established | Nothing target-specific | FQDN/IP resolution, scope, and leakage | Allowlist positive and broad-range negative tests | Broad exceptions can become an auth bypass |
| Authentication-free clients | UNVERIFIED | No target configuration evidence | Target unknown | Target unknown | Not established | Nothing target-specific | Matching criteria, persistence, and scope | Exception bypass and expiry tests | Exceptions must be explicit and audited |
| Seamless Online behavior | UNVERIFIED | No target firmware evidence | Target unknown | Target unknown | Not established | Nothing target-specific | Stale trust after revoke/expiry and reconnect | Reconnect after invalidation | Seamless trust may preserve stale authorization |
| HTTP injection prevention | UNVERIFIED | No target-specific official control captured | Target unknown | Target unknown | Not established | Nothing target-specific | Firmware control, scope, and default state | Defensive HTTP tunnel-class test | Never claim protection from generic captive-portal features |
| DNS block/allow controls | DOCUMENTED | PO release notes | RG-EG3XX family including target record | 2.430 family record | DNS | DNS blocklist/allowlist is documented | Forced resolver use and UDP/TCP 53 interception | External DNS and tunnel-class tests | Lists are not equivalent to controlled DNS |
| ICMP pre-auth control | UNVERIFIED | No target evidence | Target unknown | Target unknown | Not established | Nothing target-specific | Whether ICMP is denied or needed for portal operation | IPv4/IPv6 ICMP tests | ICMP exposure may support tunneling or discovery |
| IPv6 pre-auth enforcement | UNVERIFIED | No target evidence | Target unknown | Target unknown | Not established | Nothing | RA/DHCPv6/NDP/global-egress policy | IPv6-only client tests | IPv6 can bypass IPv4 captive controls |
| DoH behavior | UNVERIFIED | No target evidence | Target unknown | Target unknown | Not established | Nothing | HTTPS resolver reachability before auth | Controlled DoH endpoint test | DoH may evade DNS policy |
| DoT behavior | UNVERIFIED | No target evidence | Target unknown | Target unknown | Not established | Nothing | TCP 853 policy before auth | Controlled DoT endpoint test | DoT may evade DNS policy |
| QUIC / UDP-443 behavior | UNVERIFIED | No target evidence | Target unknown | Target unknown | Not established | Nothing | UDP/443 pre-auth policy | UDP/443 negative test | QUIC can bypass HTTP assumptions |
| VPN / tunneling controls | UNVERIFIED | Official product page lists VPN-tunnel capacity, not pre-auth controls | Target | Product page; target firmware control unproven | VPN product capability is not a bypass control | Device VPN capability exists as a product feature | Captive pre-auth VPN/tunnel denial | Representative defensive tunnel-class tests | Do not call the gateway VPN-proof |
| SNMP monitoring | UNVERIFIED | No target SNMP/OID evidence captured | Target unknown | Target unknown | Not established | Nothing target-specific | Read-only telemetry and freshness | OID inventory and stale-data test | Monitoring cannot substitute for enforcement |
| WireGuard / private connectivity | UNVERIFIED | No target firmware evidence | Target unknown | Target unknown | Not established | Nothing target-specific | Support, routing, and control/data-plane isolation | Lab tunnel and route test | Reachability is not programmability |
| Ruijie Cloud API | UNVERIFIED | No target API scope evidence | Target unknown | Target unknown | Not established | Nothing target-specific | Read/write/revoke endpoints and tenant scope | Lab-tenant API test | Cloud reachability must not be treated as session control |

The matrix contains 27 rows because RADIUS CoA is tracked separately from
RADIUS authentication. Current count: **10 DOCUMENTED, 0 VERIFIED, 0 MITIGATED,
0 UNSUPPORTED, and 17 UNVERIFIED**. `MITIGATED` is intentionally not assigned
to gateway capabilities: the shared Magic engine and generic fake gateway have
local mitigations, but they do not prove gateway enforcement. No official
limitation sufficient for `UNSUPPORTED` was found.

#### 18.2.2 The documented WISPr authorization handoff

The new evidence changes the protocol conclusion. The documented architecture
now fills the `?????` step with a gateway/portal WISPr interface:

```text
Guest -> RG-EG310GH-P-E -> external MikroMagic portal
      -> voucher validation
      -> MikroMagic WISPr interface / gateway WISPr exchange
      -> RG-EG310GH-P-E authorizes guest -> Internet
```

Ruijie’s article explicitly says client-developed integrations use a WISPr
interface and that WISPr protocol parameters are configured on gateway eWeb.
Therefore WISPr is now the **leading documented integration architecture**.
The article does not establish whether the successful return is a WISPr
redirect/response, a gateway callback, a proprietary API operation, or another
WISPr-defined exchange. RADIUS is documented as an authentication-type option
behind the third-party authentication service, not as a requirement for the
gateway-to-portal handoff. RADIUS Access-Accept, CoA, HTTP callbacks, and
Ruijie Cloud API calls remain unverified as the authorization commit mechanism.

Production adapter design remains **PARTIAL**. The shared Magic voucher,
entitlement, rate-limit, replay, session, and reconciliation engines can be
reused. The adapter boundary is blocked on the exact WISPr/API contract and
target-device runtime proof.

#### 18.2.3 WISPr/API contract evidence gap

The official article’s “API documentation on Ruijie Cloud” is a direction for
obtaining the integration documentation, not the API specification itself. No
publicly accessible official document reviewed here exposes the following
contract fields, so none may be invented:

| Required contract item | Current status |
| --- | --- |
| Redirect/request URL and HTTP method | UNVERIFIED |
| MAC, IP, gateway/device ID, SSID/network, original URL fields | UNVERIFIED except MAC/IP presence is DOCUMENTED in the Online Clients/configuration evidence |
| Authentication request format | UNVERIFIED |
| Success and failure response format | UNVERIFIED |
| Session identifier and timeout | UNVERIFIED |
| Disconnect, logout, and explicit revoke | UNVERIFIED for API/WISPr automation; manual Online Clients kick is DOCUMENTED |
| Accounting start/interim/stop | UNVERIFIED |
| Error codes | UNVERIFIED |
| Signature, token, TLS, and replay protection | UNVERIFIED |

The next official-documentation request is to obtain the WISPr/API package
through the Ruijie Cloud account associated with the lab, or through Ruijie’s
official support/RITA/case channels. The package must identify its applicable
model/firmware scope. A screenshot of an eWeb field or a successful portal page
is not a substitute for the protocol specification.

#### 18.2.4 Documented pre-auth controls and their limits

The supplied 2.430 evidence documents ACL capacity, DNS blocklist/allowlist,
quota/expiration, and rate limiting. Those are primitives or entitlement
features, not proof of this security policy:

```text
PRE_AUTH
  allow: DHCP + explicitly controlled DNS + minimum portal destinations
  deny: everything else
  after proven authorization: normal Internet policy
```

The review found no target-specific evidence proving that ACLs attach to the
pre-auth state, that DNS is forced to a controlled resolver, that ICMP/IPv6/
DoH/DoT/QUIC are contained, or that the access-server list is narrow and
non-leaking. These remain `UNVERIFIED` until exact configuration and packet
tests are captured. Authentication-free clients and Seamless Online require
special stale-trust tests before they can be part of a secure design.

#### 18.2.5 Evidence still required from the real device

The minimum real-device test must use an RG-EG310GH-P-E whose hardware label,
serial-independent inventory record, and running firmware are captured as
`ReyeeOS 2.430.0.1924` / `EG_3.0(1)B11P430 Release(13192420)` if that is the
device under test. Use a disposable lab WAN, a dedicated guest VLAN/subnet,
no production cloud tenant or router credentials, and a backup/export before
changes. Capture redacted configuration, portal redirects, request/response
fields, gateway logs, RADIUS packets if used, accounting records, and packet
captures for both allowed and denied traffic.

The minimum sequence is: portal redirect; invalid and valid voucher; duplicate
and replayed authorization; active-session observation; expiry, quota, manual
revoke, and logout; gateway disconnect/reconnect; router reboot; router
unreachable during revoke; and retry after recovery. Then run negative
pre-auth tests for external DNS, DNS tunnel class, ICMP, arbitrary TCP/443,
UDP/443, IPv6, DoH, DoT, HTTP tunnel class, VPN/tunnel class, VLAN/IP scope,
walled-garden leakage, authentication-free clients, and Seamless Online.
Rollback is restore/export or factory reset in the isolated lab only; no
customer or production router may be used.

## 19. Docker / Local Test Architecture

The current root `Dockerfile` builds a three-stage Node 22 Alpine image, installs
Bun, builds the SSR application, runs it as a non-root `nodejs` user, and
exposes port 3000. The current `docker-compose.yml` defines:

- `ollama`, using a persistent named `ollama-data` volume;
- `app`, built from the root Dockerfile and connected to Ollama over a private
  Compose network;
- host ports 3000 and 11434, with the current local working-tree change binding
  Ollama broadly rather than to loopback. That change pre-existed this document
  and was not modified. The committed documentation recommends loopback-only
  Ollama exposure for local development.

The repository does not currently define a local Supabase/Postgres service in
the root Compose file. `.env.example` names Supabase, Magic Hub, application
crypto, cron, and optional AI variables. No production secrets should be copied
into a local test environment.

Later, Docker can support:

1. a disposable local Supabase/Postgres fixture or a dedicated test database;
2. the SSR app with fake, non-production secrets;
3. Ollama for unrelated local AI paths;
4. a mock gateway adapter implementing explicit capability fixtures;
5. a fake Magic authorization service for failure/race testing;
6. a packet-test namespace or isolated network simulator for PRE_AUTH tests;
7. a disposable RADIUS/WISPr test double if Ruijie capability review selects it.

Docker must not be configured to point these tests at the production Supabase
database, production Hub, production routers, or production mutation APIs.
The current Compose defaults include development fallback secrets and a
non-loopback Ollama binding; these are suitable for local inspection only and
must not be treated as deployment-safe defaults.

### 19.1 Local Ruijie lab added in this phase

The uncommitted local-only lab files are:

- `docker-compose.ruijie-lab.yml`: additive Compose override starting only a
  generic fake gateway on `127.0.0.1:18080`, using an internal network,
  read-only filesystem, and no Linux capabilities.
- `tools/ruijie-lab/fake-gateway.mjs`: in-memory redirect, authorization,
  duplicate-request, disconnect, reachable, and unreachable state model. It
  has no outbound client and refuses startup if production credential variable
  names are present.
- `tools/ruijie-lab/README.md`: local invocation and evidence boundary.
- `tests/ruijie-lab-contract.test.ts`: static isolation and state-contract
  checks. These do not prove device capabilities or packet enforcement.

The fake endpoints use generic lab vocabulary, not claims about Ruijie REST,
WISPr, RADIUS, or Cloud API behavior. Protocol-specific fixtures require exact
vendor documentation or device captures first.

## 20. Security Test Matrix

These are defensive validation requirements for a later approved phase. They
are not attack tooling. The local fake-gateway contract tests were executed;
packet-level and exact-device tests were not.

| Category | Test requirement | Expected result |
| --- | --- | --- |
| Unauthenticated Internet | Fresh client attempts normal web access before redemption | Denied except explicit walled garden |
| Controlled DNS | Query approved resolver before auth | Works only as required |
| Arbitrary DNS | UDP/TCP 53 to external resolver | Denied or gateway-controlled |
| DNS tunneling | High-volume/encoded DNS class in lab | No unauthenticated egress; status reflects limits |
| ICMP | IPv4/IPv6 echo and arbitrary ICMP pre-auth | Denied unless explicitly justified |
| HTTP tunneling | HTTP Injector-style protocol class in lab | Denied pre-auth; no “VPN-proof” claim |
| VPN | Representative VPN handshake classes | Denied where gateway can enforce; limits reported |
| TCP/443 | Arbitrary pre-auth TLS destinations | Denied except exact portal endpoints |
| QUIC/UDP-443 | Pre-auth UDP/443 | Denied or status `UNVERIFIED` if not enforceable |
| DoH/DoT | Known resolver endpoints and alternate ports | Denied where supported; limitations recorded |
| IPv6 | RA/DHCPv6/global address and Internet attempt | No bypass; otherwise failed/unverified |
| Walled garden | Broad CDN/shared-host and unrelated origin probes | No leakage |
| VLAN/range escape | Alternate client VLAN/subnet/routing path | No pre-auth escape |
| MAC/session clone | Same voucher from second client/MAC | Policy limit enforced; no MAC-only trust |
| IP/MAC manipulation | Change IP/MAC/reconnect sequence | Fresh policy check; no stale access |
| Voucher brute force | Repeated malformed/valid-looking guesses | Durable budget, generic response, audit |
| Voucher automation | High-rate scripted submissions | Throttled/blocked without code disclosure |
| Replay | Reuse successful request/context | Idempotent original response or denial |
| Concurrent redemption | Two simultaneous requests for one code | At most one committed redemption |
| Concurrent usage | Exceed plan device limit | Extra client denied or replacement workflow |
| XSS/input injection | Operator text, code, query, headers, assets | Encoded/sanitized; no script execution |
| CSRF | Cross-site state-changing operator request | Rejected |
| Redirect | Malicious completion destination | Rejected/allowlisted |
| Stale authorization | Expire/revoke Magic while gateway remains active | Revoke/alert; never silently remain open |
| Expiration | Session crosses entitlement expiry | Gateway access ends within approved bound |
| Quota | Counters reach time/data limit | Terminal transition and revoke |
| Gateway disconnect | Adapter/control link fails | No new auth; existing policy follows approved choice |
| Magic failure | Authorization service unavailable | PRE_AUTH remains deny |
| Router reboot/reconnect | Gateway loses runtime state | Reconcile, no entitlement extension |
| Orphan sessions | Gateway reports unknown active client | Quarantine/audit; no inferred voucher identity |

## 21. Known Unknowns

- Exact RG-EG310GH-P-E firmware and supported external portal contract.
- Whether Ruijie can enforce a true pre-auth default-deny policy across IPv4,
  IPv6, DNS, ICMP, TCP, UDP, QUIC, DoH, and DoT.
- Whether an external portal success can atomically authorize a gateway client.
- RADIUS support details: accounting, interim updates, CoA/Disconnect, quotas,
  device limits, and failure behavior.
- Ruijie Cloud API scopes, tenant model, rate limits, event freshness, and
  revoke semantics.
- Whether private connectivity/WireGuard can reach a supported data/control
  interface on the target device.
- Whether SNMP exposes enough identity and counters for reconciliation.
- Required captive-detection endpoints for common guest devices.
- Product policy for already-active sessions during Magic/control-plane outage.
- Whether first-device binding is mandatory, optional, or unsuitable for the
  target market.
- Durable rate-limit infrastructure for public guest redemption.
- Local disposable database/packet-test harness suitable for race and bypass
  validation.

## 22. Risks

1. **False security claims:** the largest risk is labeling a configured gateway
   “protected” without packet-level evidence.
2. **Gateway capability mismatch:** an external portal may authenticate a guest
   but lack an enforceable post-auth or revoke path.
3. **Desynchronization:** Magic expiry/revocation can diverge from gateway
   state unless disconnect and reconciliation are first-class.
4. **Public redemption abuse:** existing operator-facing RLS and cooldowns do
   not prove a durable, atomic, abuse-resistant guest endpoint.
5. **IPv6/alternate transport bypass:** IPv6, DoH, DoT, QUIC, ICMP, and VPN
   behavior cannot be inferred from ordinary HTTP portal success.
6. **Walled-garden expansion:** broad cloud/CDN exceptions can become an
   authentication-free Internet path.
7. **Existing MikroTik regression:** changing the current RouterOS flow to fit
   Ruijie would risk a working system; adapters and shared policy must remain
   additive.
8. **Local secret leakage:** current Compose working-tree defaults include
   development fallbacks and broad Ollama exposure; they must not be promoted
   to deployment configuration.
9. **Asset rollback gap:** the existing portal deployment runbook identifies
   overwritten binary assets as not restorable by the current mechanism.

## 23. Migration / Compatibility Considerations

- Preserve existing RouterOS plan keys, profile naming, voucher ledger, trial
  semantics, deployment probe, staged rollback, and live session reconciliation.
- Introduce a vendor-neutral entitlement/session contract behind the existing
  MikroTik adapter rather than replacing RouterOS behavior first.
- Keep portal presentation and profile enforcement separate for both vendors.
- Treat `router_connections.vendor`/model/firmware and site/VLAN scope as
  adapter selection inputs, not as authorization by themselves.
- Use feature flags and lab-only integration records for Ruijie. No automatic
  migration of existing MikroTik routers or vouchers.
- Do not import RouterOS runtime users into Magic inventory without the existing
  read-only scan, explicit adoption, plan mapping, and audit provenance model.
- Run parallel reconciliation in a lab before any production coexistence:
  compare Magic desired state, MikroTik observed state, and Ruijie observed
  state without changing live routers.
- Reuse existing tenant/RLS and audit conventions, but review guest-facing
  public boundaries separately; authenticated operator policies are not a
  substitute for public redemption controls.

## 24. Decisions Requiring Product Owner Approval

1. Which Ruijie integration mechanism is allowed to proceed after capability
   proof: External Portal/WISPr, RADIUS, Ruijie Cloud API, a local component,
   or another documented mechanism.
2. Exact supported RG-EG310GH-P-E firmware and isolated lab hardware.
3. Whether a Ruijie integration is blocked when IPv6, DoH/DoT, QUIC, ICMP, or
   gateway revoke cannot be proven.
4. Existing-session behavior during Magic, VPS, adapter, or gateway outage:
   immediate revoke, bounded grace, or gateway lease.
5. Voucher device policy: maximum simultaneous devices, first-device binding,
   replacement process, and operator override authority.
6. Public redemption rate-limit budgets, challenge/automation controls, and
   retention/privacy policy for attempt telemetry.
7. Whether RADIUS/accounting data is acceptable as an observation source or
   whether Magic requires a stronger gateway confirmation.
8. Required operator UI surfaces and which roles may view security evidence or
   perform revocation/replacement.
9. Whether a separate local Supabase/Postgres and packet-test harness should be
   added before any adapter work.
10. Whether the current inline-script CSP approach may be hardened for the
    guest portal before external-vendor work begins.

## 25. Implementation Phases — PLAN ONLY

No phase below was implemented in this mission.

1. **Repository/security review:** review this blueprint, current MikroTik
   behavior, and the existing RLS/audit model with the product owner.
2. **Ruijie capability lab:** obtain exact hardware/firmware; document portal,
   RADIUS, Cloud API, private connectivity, SNMP, VLAN, IPv4/IPv6, and revoke
   capabilities using safe read-only checks and isolated test traffic.
3. **Local test foundation:** create disposable database fixtures, mock adapter,
   fake gateway, deterministic clock, rate-limit tests, and concurrency tests.
4. **Vendor-neutral contract:** define entitlement, Magic session, binding,
   idempotency, health evidence, and reconciliation interfaces without changing
   the MikroTik adapter behavior.
5. **External portal redemption:** implement only after approval, with atomic
   redemption, generic failures, replay protection, durable limits, audit, and
   no guest plan selection.
6. **Ruijie adapter:** implement only proven capabilities; unsupported controls
   remain visible and cannot be reported as protected.
7. **Pre-auth validation:** exercise the defensive test matrix in an isolated
   lab, including IPv6, DNS, ICMP, VPN, HTTP injection, DoH/DoT, and QUIC.
8. **Reconciliation validation:** test expiry, quota, revoke, disconnect,
   reboot, reconnect, Magic restart, adapter timeout, and orphan sessions.
9. **Operator UX:** expose evidence-backed Secure Hotspot and Gateway Sync
   states with actionable remediation and clear uncertainty.
10. **Compatibility review:** run focused MikroTik regression tests and compare
    existing portal/deployment/session behavior before any later release gate.

The lifecycle remains:

```text
Repository Audit
 -> Architecture Blueprint
 -> Security Review
 -> Product Owner Review
 -> Explicit Approval
 -> Implementation Plan
 -> Local Implementation
 -> Local Docker Testing
 -> Adversarial Security Validation
 -> Product Owner Approval
 -> only later GitHub/Lovable/production decisions
```
