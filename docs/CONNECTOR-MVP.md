# Router Automation Connector (MVP)

## Architecture

```text
Cloud (MikroMagic)            Customer LAN
  connector_jobs   <-- outbound HTTPS --  connector-agent.mjs  --> RouterOS (HTTPS REST)
  connector_discovered_routers            connector-setup.mjs (local CLI, interactive)
```

The cloud never dials into the LAN. The agent polls `/api/public/connector/jobs`,
executes the job locally and posts results back. No port forwarding, no public IP.

## Manual step (not automated)

The operator physically connects the connector computer with an Ethernet cable to
an RB4011 LAN port (**ether2 – ether10**). Nothing in the product performs or
verifies cabling.

## Discovery

1. MNDP broadcasts on UDP 5678, parsed defensively (`src/agent/lib/mndp.mjs`),
   deduped by serial → MAC → identity.
2. Fallback only if MNDP is silent: `192.168.88.1` plus a bounded candidate list
   from the machine's own private CIDRs, hard-capped at 64 addresses
   (`src/agent/lib/net.mjs`). Public address space is never probed.

Missing fields are shown as `unknown`. States are exactly:
`discovered, authenticating, configuring, connected, offline, error`.

## Secrets lifecycle

| Secret                         | Where it lives                                                                                | Lifetime                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Router admin password          | typed into the local CLI, memory only                                                         | discarded on exit; never on disk, argv, logs or the cloud                             |
| Generated `magic-api` password | created locally, uploaded once over HTTPS                                                     | stored AES-256-GCM encrypted (`encryptSecret`)                                        |
| Backup encryption password     | printed once locally                                                                          | operator's responsibility                                                             |
| Connector bearer token         | OS secret store (Windows DPAPI / macOS Keychain / libsecret), else an AES-256-GCM file (0600) | until unpaired; a legacy plaintext `config.json` token is migrated out on first start |

The cloud UI never asks for a router admin password.

## Transport and TLS

HTTPS REST is preferred and verification is **on**. A self-signed router
certificate is accepted only after the operator confirms its exact SHA-256
fingerprint; the exception is pinned per router and per request.
`NODE_TLS_REJECT_UNAUTHORIZED` is never set. SSH is the bootstrap fallback on
**all** platforms:

- POSIX — the password is served from memory over a private 0600 UNIX socket to
  a short-lived askpass helper exactly once.
- Windows — the installed OpenSSH client prompts on the console and reads the
  password from the console handle; nothing is stored. If `ssh` is missing the
  tool stops with the exact `Add-WindowsCapability` command to install it.

On both platforms the password is never in argv, never in the environment,
never on disk and never logged, and the RouterOS commands themselves are fed
over stdin so they never appear in the process arguments either.

### SSH host identity

Before any write the tool scans the router's SSH host key, shows its OpenSSH
`SHA256:` fingerprint and requires a typed `YES` when the key is unknown. A key
already present in `known_hosts` is correlated and used with
`StrictHostKeyChecking=yes`; `accept-new` is used only for a key the operator
just confirmed. A **changed** key aborts the run — it is never replaced
silently, and hashed `known_hosts` entries are treated as unknown rather than
guessed.

### www-ssl certificate

A factory www-ssl service often has no certificate, so `disabled=no` alone
leaves secure REST unusable. On the factory (SSH) path the tool reuses the
assigned certificate when it exists and has a private key; otherwise — after
the backup and the `APPLY` confirmation — it creates a Connector-owned,
uniquely named and tagged TLS **server** certificate `mikromagic-connector-cert`
(`key-usage=tls-server`, self-signed on the router), assigns it to `www-ssl`
only, waits for signing to complete and fails the run if it does not. Its
SHA-256 fingerprint is then displayed, confirmed and pinned, and the created
certificate is part of the rollback. When REST is already reachable the existing
certificate is kept untouched and none is created. TLS is never weakened and
plain HTTP is never used.
Plaintext HTTP REST and the plaintext RouterOS API are never used for credentials.
WinBox automation is not used anywhere.

## Bootstrap and idempotency

All created objects carry the comment tag `mikromagic-connector`:
restricted `magic-api` group (policy `read,write,rest-api` only — the binary
`api` policy is a separate RouterOS privilege this REST-only MVP does not need,
and `winbox`, `policy`, `password` and `sensitive` are never granted) and user,
plus the single secure management service and, on the factory path, the
Connector-owned TLS certificate. Both the service and the user are restricted to the /32 the
connector actually reaches the router from; if that address cannot be determined
the tool refuses to continue. **No firewall rule is ever added.** If an untagged
`magic-api` user or group already exists it is reported as a conflict and the run
stops — the Connector never adopts objects it did not create. The same applies
to an untagged `mikromagic-connector-cert`. Re-running updates the tagged
objects; it never duplicates them and never edits, disables or deletes anything
untagged.

### Exact ordering (identical on the REST and the factory/SSH path)

1. discovery and selection;
2. connector source `/32` derivation;
3. SSH host-key verification (factory path only);
4. **read-only** verification snapshot — REST `GET`s, or SSH `print`/`get` only;
5. the full configuration summary, including every SSH-side change;
6. typed `APPLY`;
7. successful **encrypted on-router backup**;
8. the first configuration write (certificate → service over SSH, then
   group/user over the now-verified REST channel).

No router write of any kind happens before step 8. `tests/connector-factory-flow.test.ts`
asserts both the runtime ordering against a mocked transport and the static call
ordering inside `setup-cli.mjs`.

## Rollback scope (exact)

The generated `.rsc` distinguishes adds from updates: it removes only the
Connector-tagged objects this run created, and restores the previous values of
the Connector-tagged objects this run changed. A Connector-owned user or group
that existed before the run is restored, never removed. It also restores the
previous enabled/address/certificate state of the one management service it
touched, and removes the `mikromagic-connector-cert` certificate **only** when
that run created it (after the service stops referencing it). It does **not**
restore files, packages, binaries, certificates it did not create, or any
unrelated configuration, and the on-router backup is not claimed
to be a complete file/binary restore.

## Backend hardening

- Tenancy comes from the bearer token only; request bodies never carry owner ids.
- Zod validation, 64 KB body cap, `connector_rate_hit` atomic rate limiting.
- Jobs may target private IPv4 only — no other schemes, URL credentials, public
  hosts, redirects, dangerous headers or unsupported methods.
- Results only apply to the authenticated connector's own claimed, unexpired job.
- One discovered-router row per (owner, fingerprint); never merged across tenants.
- Audit rows go through central redaction (`src/lib/redact.server.ts`).

## Local development

```bash
bun run dev
node src/agent/setup-cli.mjs          # local CLI (needs a real LAN)
bunx vitest run tests/connector-mvp.test.ts
```

## Downloadable artifacts (packaging)

Both downloads are single self-contained files with zero npm dependencies and
no relative imports, produced by the same bundler (`src/lib/connector-bundle.ts`):

| Endpoint                           | Contents                              |
| ---------------------------------- | ------------------------------------- |
| `/api/public/connector/download`   | agent + inlined `lib/token-store.mjs` |
| `/api/public/connector/setup-tool` | setup CLI + inlined `lib/*.mjs`       |

`/api/public/connector/version` hashes the exact bytes served by `/download`
(`src/lib/connector-agent-artifact.ts` is the single source for both), so the
signed manifest SHA always pins the runnable artifact the self-updater writes.
Installers fetch only `/download`; there is no second file to install.

`tests/connector-agent-packaging.test.ts` writes each artifact into a fresh
empty directory, runs `node --check`, boots the agent until it exits with the
"no pairing code" path (proving no `ERR_MODULE_NOT_FOUND`), and validates the
live-served bytes when a dev server is reachable.

## Install commands

```bash
# Windows (elevated PowerShell)
iwr <origin>/api/public/connector/install/windows -OutFile $env:TEMP\mm-install.ps1
# macOS
curl -fsSL <origin>/api/public/connector/install/macos | sudo bash -s CODE
# Linux
curl -fsSL <origin>/api/public/connector/install/linux | sudo bash -s CODE
```

## Authorized RB4011 test checklist

1. Cable the connector machine to ether2–ether10; confirm an IP on the LAN.
2. Install the connector, verify Online in `/app/connectors`.
3. Run the local setup tool (it is installed by the Windows, macOS and Linux installers); confirm MNDP lists the RB4011.
4. Confirm the SSH host-key fingerprint (factory router) and the TLS certificate fingerprint prompts match the router.
5. Review the dry run; type `APPLY`.
6. Verify the backup file exists on the router and store the backup password.
7. Confirm `magic-api` exists, existing rules/services are unchanged.
8. Re-run the tool; confirm no duplicates are created.
9. Confirm the health check with the `magic-api` account passed and the router shows Connected in `/app/connectors`.
10. Run the rollback `.rsc`; confirm only objects created by that run disappear and updated ones are restored.

## Honest limitations

- No production router was touched during development. RouterOS REST behaviour is covered by `tests/connector-routeros-integration.test.ts` (transport/TLS pinning) and `tests/connector-e2e-flow.test.ts` (stateful mock: auth failure, read verification, encrypted backup, apply, registration, idempotent rerun, rollback) and `tests/connector-factory-flow.test.ts` (factory state: read-only SSH snapshot, host-key confirmation/mismatch, APPLY-then-backup-then-write ordering, certificate create/assign/reuse/conflict, rollback of the created certificate, Windows and missing-`ssh` behaviour, terse parsing).
- Cloud registration requires HTTPS. Plain HTTP is rejected, except for `localhost`/`127.0.0.1` with `MIKROMAGIC_ALLOW_INSECURE_LOCALHOST=1`.
- The setup tool reads the paired connector token from the OS secret store, so the Connector must be installed and paired on that machine first; tokens are never passed in argv.
- The router is only reported as `connected` after cloud registration succeeds; failures are reported as `offline` or `error` with a redacted message.
- SSH fallback works on POSIX and on Windows via the OpenSSH client; it requires
  `ssh` (and `ssh-keyscan` for host-key display) to be installed, and stops with
  install instructions when they are missing.
- Certificate signing is polled on the router for up to ~2 minutes; if it does
  not complete the run fails and points at the backup instead of leaving a
  half-configured service.
- Hashed `known_hosts` entries cannot be correlated, so such a router is treated
  as unknown and its fingerprint must be confirmed again.
- Fallback probing detects an open management port, not necessarily RouterOS.
