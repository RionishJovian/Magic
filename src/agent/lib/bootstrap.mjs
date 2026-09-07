import { randomBytes as nodeRandomBytes } from "node:crypto";
/**
 * Idempotent, narrowly tagged RouterOS bootstrap plan.
 *
 * Rules enforced by the planner:
 *  - it only ever adds or updates objects that carry the Connector tag;
 *  - an untagged object with a Connector name is a CONFLICT, never adopted;
 *  - the magic-api group gets the minimum RouterOS policies needed for the
 *    REST calls the app makes — no winbox, policy, password or sensitive;
 *  - the secure management service is always restricted to the Connector's
 *    own source address, never opened to every interface;
 *  - no firewall rule is ever added.
 */

export const CONNECTOR_TAG = "mikromagic-connector";
export const MAGIC_USER = "magic-api";
export const MAGIC_GROUP = "magic-api";
/** Connector-owned TLS server certificate, uniquely named and tagged. */
export const MAGIC_CERT = "mikromagic-connector-cert";

/**
 * Minimum RouterOS policy set for this MVP.
 *  read      — inspect configuration and status
 *  write     — apply the configuration the app manages
 *  rest-api  — REST access (RouterOS 7). Per the official RouterOS user
 *              documentation `rest-api` alone grants REST; `api` is a separate
 *              policy for the binary RouterOS API, which this MVP never uses,
 *              so it is deliberately NOT granted.
 * Deliberately excluded: api, winbox, policy, password, sensitive, ftp, telnet,
 * ssh, local, reboot, sniff, romon, dude, test, tikapp.
 */
export const MAGIC_POLICY = "read,write,rest-api";

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%^*_-+=";

/** Cryptographically strong generated password for the magic-api user. */
export function generateStrongPassword(randomSource = nodeRandomBytes, length = 32) {
  const randomBytes = typeof randomSource === "function" ? randomSource : nodeRandomBytes;
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  return out;
}

function tagged(comment) {
  return typeof comment === "string" && comment.includes(CONNECTOR_TAG);
}

function isTrue(value) {
  return value === true || value === "true" || value === "yes";
}

function step(fields) {
  return { tag: CONNECTOR_TAG, previous: null, ...fields };
}

/**
 * A RouterOS certificate can only terminate TLS when it is present, has its
 * private key on the router and is signed (RouterOS reports `K` in the flags
 * and `private-key: true` in a terse print).
 */
export function certUsable(cert) {
  if (!cert) return false;
  if (isTrue(cert.invalid) || isTrue(cert.expired) || isTrue(cert.revoked)) return false;
  const hasKey = isTrue(cert["private-key"]) || String(cert.flags ?? "").includes("K");
  if (!hasKey) return false;
  // An unsigned request (flags contain R without T/A) cannot serve TLS.
  const flags = String(cert.flags ?? "");
  if (flags.includes("R") && !/[TAL]/.test(flags)) return false;
  return true;
}

/**
 * @param snapshot {{ groups?: any[], users?: any[], services?: any[], certificates?: any[] }}
 * @param options  {{ allowedFrom: string, service?: string, commonName?: string,
 *                    requireCertificate?: boolean }}
 *   `requireCertificate` is set by the factory path (secure REST unreachable):
 *   only then may a Connector-owned TLS certificate be created. When REST
 *   already works the existing certificate is kept untouched.
 *   `allowedFrom` is the Connector host address (normally a /32) that the
 *   magic-api user and the management service are restricted to. It is
 *   required: the planner refuses to open the service to every address.
 */
export function planBootstrap(snapshot, options = {}) {
  const groups = Array.isArray(snapshot.groups) ? snapshot.groups : [];
  const users = Array.isArray(snapshot.users) ? snapshot.users : [];
  const services = Array.isArray(snapshot.services) ? snapshot.services : [];
  const certificates = Array.isArray(snapshot.certificates) ? snapshot.certificates : [];

  const serviceName = options.service ?? "www-ssl";
  const allowedFrom = options.allowedFrom ?? null;
  const requireCertificate = options.requireCertificate === true;
  const certCommonName = String(options.commonName ?? "mikromagic-connector").replace(
    /[^\w.-]/g,
    "-",
  );
  const steps = [];
  const conflicts = [];

  if (!allowedFrom) {
    conflicts.push({
      id: "allowed-from",
      title: "Connector source address is unknown",
      detail:
        "The setup tool could not determine which local address reaches this router, so it refuses to enable the management service without an address restriction.",
      remedy: "Re-run the tool while connected to the router's LAN.",
    });
  }

  // ---------------------------------------------------------------- group ---
  const existingGroup = groups.find((g) => g.name === MAGIC_GROUP);
  if (!existingGroup) {
    steps.push(
      step({
        id: "group",
        action: "add",
        title: "Create the restricted magic-api group",
        command: `/user/group/add name=${MAGIC_GROUP} policy=${MAGIC_POLICY} comment="${CONNECTOR_TAG}"`,
        reason: "No magic-api group exists on this router yet.",
        payload: { name: MAGIC_GROUP, policy: MAGIC_POLICY, comment: CONNECTOR_TAG },
      }),
    );
  } else if (!tagged(existingGroup.comment)) {
    conflicts.push({
      id: "group",
      title: "A magic-api group already exists and was not created by MikroMagic",
      detail:
        "Continuing would mean adopting or changing configuration that belongs to someone else.",
      remedy: `Rename or remove the existing "${MAGIC_GROUP}" group on the router, then run this tool again.`,
    });
  } else {
    steps.push(
      step({
        id: "group",
        action: "update",
        title: "Refresh the magic-api group policy",
        command: `/user/group/set [find name=${MAGIC_GROUP}] policy=${MAGIC_POLICY} comment="${CONNECTOR_TAG}"`,
        reason: "Connector-owned group already present — updated in place, not duplicated.",
        payload: { policy: MAGIC_POLICY, comment: CONNECTOR_TAG },
        previous: {
          id: existingGroup[".id"] ?? null,
          policy: existingGroup.policy ?? "",
          comment: existingGroup.comment ?? "",
        },
      }),
    );
  }

  // ----------------------------------------------------------------- user ---
  const existingUser = users.find((u) => u.name === MAGIC_USER);
  const userAddress = allowedFrom ?? "";
  if (!existingUser) {
    steps.push(
      step({
        id: "user",
        action: "add",
        title: "Create the magic-api user with a generated password",
        command: `/user/add name=${MAGIC_USER} group=${MAGIC_GROUP} address=${userAddress} comment="${CONNECTOR_TAG}" password=<generated>`,
        reason:
          "The app will only ever use this dedicated account; your admin password stays on this computer.",
        payload: {
          name: MAGIC_USER,
          group: MAGIC_GROUP,
          address: userAddress,
          comment: CONNECTOR_TAG,
        },
      }),
    );
  } else if (!tagged(existingUser.comment)) {
    conflicts.push({
      id: "user",
      title: "A magic-api user already exists and was not created by MikroMagic",
      detail: "The Connector never modifies or reuses an account it did not create.",
      remedy: `Rename or remove the existing "${MAGIC_USER}" user on the router, then run this tool again.`,
    });
  } else {
    steps.push(
      step({
        id: "user",
        action: "update",
        title: "Rotate the magic-api password",
        command: `/user/set [find name=${MAGIC_USER}] group=${MAGIC_GROUP} address=${userAddress} comment="${CONNECTOR_TAG}" password=<generated>`,
        reason: "Connector-owned user already present — rotated in place, not duplicated.",
        payload: { group: MAGIC_GROUP, address: userAddress, comment: CONNECTOR_TAG },
        previous: {
          id: existingUser[".id"] ?? null,
          group: existingUser.group ?? "",
          address: existingUser.address ?? "",
          comment: existingUser.comment ?? "",
        },
      }),
    );
  }

  // ---------------------------------------------------------- certificate ---
  // A factory RouterOS www-ssl service usually has NO certificate assigned, so
  // simply setting disabled=no leaves secure REST unusable. Reuse a suitable
  // existing certificate; otherwise create a Connector-owned, uniquely named
  // and tagged TLS *server* certificate and assign it to www-ssl only.
  const svc = services.find((s) => s.name === serviceName);
  const currentCertName = String(svc?.certificate ?? "").trim();
  const currentCert = currentCertName
    ? certificates.find((c) => c.name === currentCertName)
    : undefined;
  const magicCert = certificates.find((c) => c.name === MAGIC_CERT);

  let certificateName = null;
  if (currentCert && certUsable(currentCert)) {
    certificateName = currentCert.name;
    steps.push(
      step({
        id: "certificate",
        action: "skip",
        title: `Reuse the existing TLS certificate "${currentCert.name}"`,
        command: "",
        reason: "It already has a private key and is assigned to the secure management service.",
      }),
    );
  } else if (!requireCertificate) {
    // The tool already reached this router over verified HTTPS REST, so the
    // service is demonstrably serving TLS with whatever it has. Nothing is
    // created, replaced or weakened.
    certificateName = currentCertName || null;
    steps.push(
      step({
        id: "certificate",
        action: "skip",
        title: "Keep the TLS certificate the secure service already uses",
        command: "",
        reason: "Secure REST is already working over HTTPS; no certificate is created or changed.",
      }),
    );
  } else if (magicCert && !tagged(magicCert.comment)) {
    conflicts.push({
      id: "certificate",
      title: `A certificate named "${MAGIC_CERT}" already exists and was not created by MikroMagic`,
      detail: "The Connector never reuses or overwrites a certificate it did not create.",
      remedy: `Rename or remove the certificate "${MAGIC_CERT}" on the router, then run this tool again.`,
    });
  } else if (magicCert && certUsable(magicCert)) {
    certificateName = MAGIC_CERT;
    steps.push(
      step({
        id: "certificate",
        action: "reuse",
        title: `Reuse the Connector-owned certificate "${MAGIC_CERT}"`,
        command: "",
        reason: "It was created by a previous Connector run and is still signed and usable.",
        payload: { name: MAGIC_CERT },
      }),
    );
  } else {
    certificateName = MAGIC_CERT;
    steps.push(
      step({
        id: "certificate",
        action: "add",
        title: `Create and self-sign the TLS server certificate "${MAGIC_CERT}"`,
        command:
          `/certificate/add name=${MAGIC_CERT} common-name=${certCommonName} key-size=2048 days-valid=3650 ` +
          `key-usage=tls-server comment="${CONNECTOR_TAG}" ; /certificate/sign ${MAGIC_CERT}`,
        reason: currentCertName
          ? `The certificate "${currentCertName}" assigned to ${serviceName} is missing or has no private key, so HTTPS would not work.`
          : `${serviceName} has no certificate assigned, so HTTPS would not work. TLS is never weakened and plain HTTP is never used.`,
        payload: { name: MAGIC_CERT, commonName: certCommonName },
      }),
    );
  }

  // -------------------------------------------------------------- service ---
  const serviceNeedsCert = certificateName && currentCertName !== certificateName;
  if (!svc) {
    conflicts.push({
      id: "service",
      title: `RouterOS service ${serviceName} was not found`,
      detail: "The secure management service is required and cannot be created by this tool.",
      remedy: "Check the RouterOS version and that the www-ssl service exists.",
    });
  } else if (!isTrue(svc.disabled) && svc.address === allowedFrom && !serviceNeedsCert) {
    steps.push(
      step({
        id: "service",
        action: "skip",
        title: `Secure management service ${serviceName} already restricted correctly`,
        command: "",
        reason: "Nothing to change; it is already enabled for the Connector address only.",
      }),
    );
  } else {
    const payload = {
      disabled: "false",
      address: allowedFrom ?? "",
      ...(serviceNeedsCert ? { certificate: certificateName } : {}),
    };
    steps.push(
      step({
        id: "service",
        action: "update",
        title: `Enable ${serviceName} for the Connector address only`,
        command:
          `/ip/service/set [find name=${serviceName}] disabled=no address=${allowedFrom ?? "<unknown>"}` +
          (serviceNeedsCert ? ` certificate=${certificateName}` : ""),
        reason: `Only ${allowedFrom ?? "the Connector host"} may reach it. No other service is enabled and none is disabled.`,
        payload,
        previous: {
          id: svc[".id"] ?? null,
          disabled: isTrue(svc.disabled),
          address: svc.address ?? "",
          certificate: currentCertName,
        },
      }),
    );
  }

  const blocked = conflicts.length > 0;
  const writes = blocked ? [] : steps.filter((s) => s.action !== "skip" && s.action !== "reuse");

  return {
    tag: CONNECTOR_TAG,
    policy: MAGIC_POLICY,
    allowedFrom,
    service: serviceName,
    certificate: blocked ? null : certificateName,
    steps,
    writes,
    conflicts,
    blocked,
    noop: !blocked && writes.length === 0,
    summary: steps.reduce((acc, s) => ({ ...acc, [s.action]: (acc[s.action] ?? 0) + 1 }), {}),
  };
}

/**
 * Rollback covers *only* what this run actually changed:
 *  - objects this run ADDED are removed (including a certificate it created);
 *  - tagged objects this run UPDATED are restored to their previous values
 *    (including the previous www-ssl certificate assignment).
 * A pre-existing Connector-owned user, group or certificate is therefore never
 * removed on a re-run. The router is never reset and untagged configuration is
 * untouched. Steps are undone in reverse order of application, so the service
 * stops referencing the created certificate before it is removed.
 */
export function buildRollback(plan, context = {}) {
  const commands = [];
  const applied = context.appliedSteps ?? plan.writes ?? [];

  for (const s of [...applied].reverse()) {
    if (s.id === "group" && s.action === "add") {
      commands.push(`/user/group/remove [find name=${MAGIC_GROUP} comment~"${CONNECTOR_TAG}"]`);
    } else if (s.id === "group" && s.action === "update" && s.previous) {
      commands.push(
        `/user/group/set [find name=${MAGIC_GROUP}] policy=${s.previous.policy || MAGIC_POLICY} comment="${s.previous.comment ?? ""}"`,
      );
    } else if (s.id === "user" && s.action === "add") {
      commands.push(`/user/remove [find name=${MAGIC_USER} comment~"${CONNECTOR_TAG}"]`);
    } else if (s.id === "user" && s.action === "update" && s.previous) {
      commands.push(
        `/user/set [find name=${MAGIC_USER}] group=${s.previous.group || MAGIC_GROUP} address=${s.previous.address ?? ""} comment="${s.previous.comment ?? ""}"`,
      );
    } else if (s.id === "service" && s.previous) {
      commands.push(
        `/ip/service/set [find name=${plan.service ?? "www-ssl"}] disabled=${
          s.previous.disabled ? "yes" : "no"
        } address=${s.previous.address ? s.previous.address : '""'} certificate=${
          s.previous.certificate ? s.previous.certificate : "none"
        }`,
      );
    } else if (s.id === "certificate" && s.action === "add") {
      commands.push(`/certificate/remove [find name=${MAGIC_CERT} comment~"${CONNECTOR_TAG}"]`);
    }
  }

  const addedNames = applied.filter((s) => s.action === "add").map((s) => s.id);
  const updatedNames = applied.filter((s) => s.action === "update").map((s) => s.id);

  return {
    tag: CONNECTOR_TAG,
    backupName: context.backupName ?? null,
    added: addedNames,
    updated: updatedNames,
    scope:
      `Removes only what this run created (${addedNames.join(", ") || "nothing"}) and restores the previous values of what this run changed (${updatedNames.join(", ") || "nothing"}). ` +
      "It never resets the router, never removes a Connector object that existed before this run, and does not restore files, packages, binaries, certificates it did not create, or any unrelated configuration.",

    commands,
    script: commands.join("\n"),
  };
}
