// Pure planning logic for portal deployment and rollback.
//
// Deployment is staged: files are written into a versioned directory, verified,
// and only then are the *selected* hotspot profiles switched to it. Nothing in
// the live directory is mutated, so a rollback returns traffic to the previous
// portal and removes everything the deployment created.
//
// Restore guarantees, precisely:
//   - hotspot profile html-directory mapping: restored exactly.
//   - text files: restored byte-for-byte, because their prior content is read
//     and captured before the deployment writes.
//   - files that did not exist before: removed ("absent" markers), so a
//     rollback never leaves a new file behind.
//   - binary assets (logo/hero) that DID exist before: NOT restored. The app
//     does not keep a copy of the bytes, so an overwritten binary cannot be put
//     back. Such paths are reported by unrestorableAssets() and are left in
//     place rather than deleted, which is the safest available behaviour.

export type TextFile = { name: string; content: string };

export type ProfileTarget = {
  id: string;
  name: string;
  /** html-directory the profile pointed at before this deployment. */
  htmlDirectory: string;
};

export type DeployStep =
  | { op: "write-text"; path: string; content: string }
  | { op: "fetch-binary"; path: string; url: string }
  | { op: "verify"; paths: string[] }
  | {
      op: "set-html-dir";
      profileId: string;
      profileName: string;
      dir: string;
      previousDir: string;
    };

export type DeployPlan = {
  version: string;
  stagingDir: string;
  steps: DeployStep[];
  /** Paths the plan creates, in creation order. */
  creates: string[];
  switched: ProfileTarget[];
};

export type PriorAsset = { path: string; present: boolean };
export type PriorTextFile = { path: string; present: boolean; content?: string };

export function portalManifestText(input: {
  version: string;
  fingerprint: string;
  deployedAt: string;
}): string {
  return JSON.stringify(input);
}

export type PriorState = {
  stagingDir: string;
  texts: PriorTextFile[];
  assets: PriorAsset[];
  profiles: ProfileTarget[];
  /** Paths created by the deployment being rolled back. */
  created: string[];
};

export type RollbackStep =
  | { op: "set-html-dir"; profileId: string; profileName: string; dir: string }
  | { op: "remove-file"; path: string }
  | { op: "write-text"; path: string; content: string };

export function planPortalDeploy(input: {
  version: string;
  files: TextFile[];
  logoUrl?: string | null;
  heroUrl?: string | null;
  profiles: ProfileTarget[];
  /** Content fingerprint written to mm-manifest.json for live-router probes. */
  fingerprint?: string;
  /** Prebuilt manifest text so storage fallback and router verification use identical bytes. */
  manifestContent?: string;
}): DeployPlan {
  if (!input.profiles.length)
    throw new Error("Select at least one hotspot profile to deploy the portal to.");
  const stagingDir = `hotspot-mm-${input.version}`;
  const steps: DeployStep[] = [];
  const creates: string[] = [];

  for (const f of input.files) {
    const path = `${stagingDir}/${f.name}`;
    steps.push({ op: "write-text", path, content: f.content });
    creates.push(path);
  }
  if (input.fingerprint) {
    const manifestPath = `${stagingDir}/mm-manifest.json`;
    steps.push({
      op: "write-text",
      path: manifestPath,
      content:
        input.manifestContent ??
        portalManifestText({
          version: input.version,
          fingerprint: input.fingerprint,
          deployedAt: new Date().toISOString(),
        }),
    });
    creates.push(manifestPath);
  }
  if (input.logoUrl) {
    const path = `${stagingDir}/img/logo.png`;
    steps.push({ op: "fetch-binary", path, url: input.logoUrl });
    creates.push(path);
  }
  if (input.heroUrl) {
    const path = `${stagingDir}/img/hero.jpg`;
    steps.push({ op: "fetch-binary", path, url: input.heroUrl });
    creates.push(path);
  }

  steps.push({ op: "verify", paths: [...creates] });

  for (const p of input.profiles) {
    steps.push({
      op: "set-html-dir",
      profileId: p.id,
      profileName: p.name,
      dir: stagingDir,
      previousDir: p.htmlDirectory,
    });
  }

  return { version: input.version, stagingDir, steps, creates, switched: [...input.profiles] };
}

/**
 * Rollback for a deployment that failed part-way through. `completed` is the
 * number of plan steps that ran successfully; only their effects are undone.
 */
export function planPartialRollback(plan: DeployPlan, completed: number): RollbackStep[] {
  const done = plan.steps.slice(0, Math.max(0, Math.min(completed, plan.steps.length)));
  const steps: RollbackStep[] = [];

  // Profiles first: get traffic back on the previous portal before deleting.
  for (const s of done) {
    if (s.op === "set-html-dir")
      steps.push({
        op: "set-html-dir",
        profileId: s.profileId,
        profileName: s.profileName,
        dir: s.previousDir,
      });
  }
  const created = done
    .filter(
      (s): s is Extract<DeployStep, { op: "write-text" | "fetch-binary" }> =>
        s.op === "write-text" || s.op === "fetch-binary",
    )
    .map((s) => s.path);
  for (const path of created.reverse()) steps.push({ op: "remove-file", path });
  return steps;
}

/** Restore an exact captured prior state (used by the manual rollback action). */
export function planRestorePrior(prior: PriorState): RollbackStep[] {
  const steps: RollbackStep[] = [];

  for (const p of prior.profiles)
    steps.push({
      op: "set-html-dir",
      profileId: p.id,
      profileName: p.name,
      dir: p.htmlDirectory,
    });

  for (const t of prior.texts) {
    if (t.present && typeof t.content === "string")
      steps.push({ op: "write-text", path: t.path, content: t.content });
    else steps.push({ op: "remove-file", path: t.path });
  }
  // Binary assets cannot be re-created from an audit row; absent-file markers
  // are still honoured so a rollback never leaves a new asset behind.
  for (const a of prior.assets) if (!a.present) steps.push({ op: "remove-file", path: a.path });

  // Anything the deployment created and the prior state does not know about.
  const known = new Set([...prior.texts.map((t) => t.path), ...prior.assets.map((a) => a.path)]);
  for (const path of [...prior.created].reverse())
    if (!known.has(path)) steps.push({ op: "remove-file", path });

  return steps;
}

/**
 * Assets a rollback cannot restore byte-for-byte: they existed before the
 * deployment and were overwritten, and no copy of the original bytes is kept.
 * They are deliberately left in place (never deleted) and surfaced in the UI so
 * the operator can re-upload the original.
 */
export function unrestorableAssets(prior: PriorState): string[] {
  return prior.assets.filter((a) => a.present).map((a) => a.path);
}
