// Executes a staged portal deployment plan against one router.
//
// Files land in a fresh versioned directory; the selected hotspot profiles are
// only switched once every file has been written and verified. If any step
// fails, the effects of the completed steps are undone in reverse order, so a
// partial failure never leaves a half-published portal behind.

import {
  planPartialRollback,
  planPortalDeploy,
  planRestorePrior,
  type DeployPlan,
  type PriorState,
  type ProfileTarget,
  type RollbackStep,
  type TextFile,
} from "./deploy-plan";

type Conn = Parameters<typeof import("../mikrotik.server").routerAPI.findFileId>[0];

export const LEGACY_ROUTEROS_TEXT_LIMIT_BYTES = 4_095;

function routerOsVersionParts(version: string | undefined): [number, number] | null {
  const match = version?.match(/^(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function assertPortalTextCompatibility(
  routerOsVersion: string | undefined,
  files: TextFile[],
): void {
  const parts = routerOsVersionParts(routerOsVersion);
  if (!parts) return;
  const [major, minor] = parts;
  if (major > 7 || (major === 7 && minor >= 16)) return;

  const oversized = files.find(
    (file) => Buffer.byteLength(file.content, "utf8") > LEGACY_ROUTEROS_TEXT_LIMIT_BYTES,
  );
  if (!oversized) return;

  const bytes = Buffer.byteLength(oversized.content, "utf8");
  throw new Error(
    `Portal preflight stopped before writing files: ${oversized.name} is ${bytes} bytes, but RouterOS ${routerOsVersion} can only verify portal text up to ${LEGACY_ROUTEROS_TEXT_LIMIT_BYTES} bytes. Shorten this portal content or update RouterOS.`,
  );
}

export type ExecResult = {
  ok: boolean;
  partial: boolean;
  rolledBack: boolean;
  completed: number;
  total: number;
  written: string[];
  error?: string;
  rollbackError?: string;
  prior: PriorState;
};

function deployStepLabel(step: DeployPlan["steps"][number]): string {
  if (step.op === "write-text") return `writing ${step.path}`;
  if (step.op === "fetch-binary") return `downloading ${step.path}`;
  if (step.op === "verify") return `verifying ${step.paths.length} portal file(s)`;
  return `switching Hotspot profile “${step.profileName}”`;
}

export async function readProfileTargets(conn: Conn, wanted?: string[]): Promise<ProfileTarget[]> {
  const { routerAPI } = await import("../mikrotik.server");
  const rows = await routerAPI.hotspotProfiles(conn);
  return (rows ?? [])
    .filter(
      (r) => !wanted?.length || wanted.includes(r["name"] ?? "") || wanted.includes(r[".id"] ?? ""),
    )
    .map((r) => ({
      id: r[".id"] ?? "",
      name: r["name"] ?? "unnamed",
      htmlDirectory: r["html-directory"] ?? "hotspot",
    }))
    .filter((p) => p.id);
}

async function applyRollback(conn: Conn, steps: RollbackStep[]): Promise<string | undefined> {
  const { routerAPI } = await import("../mikrotik.server");
  const errors: string[] = [];
  for (const step of steps) {
    try {
      if (step.op === "set-html-dir")
        await routerAPI.setProfileHtmlDir(conn, step.profileId, step.dir);
      else if (step.op === "remove-file") {
        const id = await routerAPI.findFileId(conn, step.path);
        if (id) await routerAPI.removeFile(conn, id);
      } else {
        const id = await routerAPI.findFileId(conn, step.path);
        if (id) await routerAPI.removeFile(conn, id);
        await writeTextFile(conn, step.path, step.content);
      }
    } catch (e) {
      errors.push(
        `${step.op} ${"path" in step ? step.path : step.profileName}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
  return errors.length ? errors.join("; ") : undefined;
}

const ROUTER_FETCH_TRUST_ERROR =
  /no trusted ca|unable to get issuer|self[- ]signed certificate|certificate verify|unknown ca|could not verify (?:the )?download certificate/i;

export function isRouterFetchTrustError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return ROUTER_FETCH_TRUST_ERROR.test(message);
}

async function removeFileIfPresent(conn: Conn, path: string): Promise<void> {
  const { routerAPI } = await import("../mikrotik.server");
  const id = await routerAPI.findFileId(conn, path);
  if (id) await routerAPI.removeFile(conn, id);
}

async function verifyTextFile(conn: Conn, path: string, expected: string): Promise<void> {
  const { routerAPI } = await import("../mikrotik.server");
  const actual = await routerAPI.readFile(conn, path);
  if (actual === expected) return;
  await removeFileIfPresent(conn, path).catch(() => undefined);
  throw new Error(
    `Portal text integrity verification failed for ${path}; the downloaded file was removed.`,
  );
}

export async function writeTextFile(
  conn: Conn,
  path: string,
  content: string,
  fetchUrl?: string,
): Promise<void> {
  const { routerAPI } = await import("../mikrotik.server");
  try {
    await routerAPI.addFile(conn, path, content);
    await verifyTextFile(conn, path, content);
    return;
  } catch (first) {
    if (!fetchUrl) throw first;
    await removeFileIfPresent(conn, path);
  }

  try {
    await routerAPI.fetchToPath(conn, fetchUrl, path);
  } catch (secureFetchError) {
    if (!isRouterFetchTrustError(secureFetchError)) throw secureFetchError;
    await removeFileIfPresent(conn, path);
    await routerAPI.fetchToPath(conn, fetchUrl, path, { checkCertificate: false });
  }
  // The CA-compatibility retry is safe only because the exact text is read
  // back over the authenticated Hub/Connector path before any profile switch.
  await verifyTextFile(conn, path, content);
}

export async function executeDeploy(
  conn: Conn,
  input: {
    version: string;
    files: TextFile[];
    logoUrl?: string | null;
    heroUrl?: string | null;
    profiles: ProfileTarget[];
    fingerprint?: string;
    /** Exact manifest bytes uploaded for the signed RouterOS fetch fallback. */
    manifestContent?: string;
    /** Signed URLs for text files when /file/add is refused on the board. */
    textFetchUrls?: Record<string, string>;
  },
): Promise<{ plan: DeployPlan; result: ExecResult }> {
  const { routerAPI } = await import("../mikrotik.server");
  let resource: { version?: string };
  try {
    resource = await routerAPI.ping(conn);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Portal preflight failed before any files were written: ${message}`);
  }
  assertPortalTextCompatibility(resource.version, input.files);
  const plan = planPortalDeploy(input);

  // Capture the exact prior state so a later manual rollback is faithful.
  const prior: PriorState = {
    stagingDir: plan.stagingDir,
    texts: [],
    assets: [],
    profiles: input.profiles.map((p) => ({ ...p })),
    created: [...plan.creates],
  };
  for (const step of plan.steps) {
    if (step.op === "write-text") {
      const existing = await routerAPI.readFile(conn, step.path).catch(() => null);
      prior.texts.push(
        existing == null
          ? { path: step.path, present: false }
          : { path: step.path, present: true, content: existing },
      );
    } else if (step.op === "fetch-binary") {
      const id = await routerAPI.findFileId(conn, step.path).catch(() => null);
      prior.assets.push({ path: step.path, present: Boolean(id) });
    }
  }

  const written: string[] = [];
  let completed = 0;
  let activeStep: DeployPlan["steps"][number] | null = null;
  try {
    for (const step of plan.steps) {
      activeStep = step;
      if (step.op === "write-text") {
        const id = await routerAPI.findFileId(conn, step.path);
        if (id) await routerAPI.removeFile(conn, id);
        await writeTextFile(conn, step.path, step.content, input.textFetchUrls?.[step.path]);
        written.push(step.path);
      } else if (step.op === "fetch-binary") {
        await routerAPI.fetchToPath(conn, step.url, step.path);
        written.push(step.path);
      } else if (step.op === "verify") {
        for (const path of step.paths) {
          const id = await routerAPI.findFileId(conn, path);
          if (!id) throw new Error(`Verification failed: ${path} is missing on the router.`);
        }
      } else {
        await routerAPI.setProfileHtmlDir(conn, step.profileId, step.dir);
      }
      completed += 1;
    }
    return {
      plan,
      result: {
        ok: true,
        partial: false,
        rolledBack: false,
        completed,
        total: plan.steps.length,
        written,
        prior,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const error = activeStep
      ? `Portal deploy failed while ${deployStepLabel(activeStep)}: ${raw}`
      : raw;
    const rollbackError = await applyRollback(conn, planPartialRollback(plan, completed));
    return {
      plan,
      result: {
        ok: false,
        partial: completed > 0,
        rolledBack: !rollbackError,
        completed,
        total: plan.steps.length,
        written,
        error,
        rollbackError,
        prior,
      },
    };
  }
}

export async function executeRestore(
  conn: Conn,
  prior: PriorState,
): Promise<{ ok: boolean; steps: number; error?: string }> {
  const steps = planRestorePrior(prior);
  const error = await applyRollback(conn, steps);
  return { ok: !error, steps: steps.length, error };
}
