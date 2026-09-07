import {
  isMagicPortalDirectory,
  magicPortalDirsFromFilePaths,
  portalBundleFingerprint,
  type PortalBundleAssetFlags,
} from "./bundle-fingerprint";
import type { ProfileTarget } from "./deploy-plan";

export type PortalDeployStatus = "not_deployed" | "matches" | "outdated" | "partial" | "unknown";

export type PortalProfileProbe = {
  id: string;
  name: string;
  htmlDirectory: string;
  pointsAtMagicDir: boolean;
};

export type PortalDeployProbe = {
  status: PortalDeployStatus;
  summary: string;
  liveDirectory: string | null;
  profiles: PortalProfileProbe[];
  magicDirectories: string[];
  orphanDirectories: string[];
  expectedFingerprint: string;
  liveFingerprint: string | null;
  textFilesChecked: number;
  textFilesMatched: number;
  assetsExpected: PortalBundleAssetFlags;
  assetsOnRouter: PortalBundleAssetFlags;
};

export type PortalDeviceScan = {
  profiles: PortalProfileProbe[];
  directories: Array<{
    directory: string;
    files: Array<{ name: string; bytes: number; sha256: string }>;
    kind: "magic" | "custom" | "empty";
    managedFingerprint: string | null;
  }>;
  summary: string;
};

const SCANNABLE_PORTAL_FILES = new Set([
  "login.html",
  "status.html",
  "logout.html",
  "error.html",
  "alogin.html",
  "radvert.html",
  "style.css",
  "style-extra.css",
  "mm-manifest.json",
]);
const MAX_SCANNED_TEXT_BYTES = 256 * 1024;

type Conn = Parameters<typeof import("../mikrotik.server").routerAPI.findFileId>[0];

export function assessPortalDeployProbe(input: {
  profiles: ProfileTarget[];
  magicDirectories: string[];
  expectedFingerprint: string;
  liveFingerprint: string | null;
  textFilesChecked: number;
  textFilesMatched: number;
  assetsExpected: PortalBundleAssetFlags;
  assetsOnRouter: PortalBundleAssetFlags;
}): PortalDeployProbe {
  const profileRows: PortalProfileProbe[] = input.profiles.map((p) => ({
    id: p.id,
    name: p.name,
    htmlDirectory: p.htmlDirectory,
    pointsAtMagicDir: isMagicPortalDirectory(p.htmlDirectory),
  }));

  const referencedMagic = new Set(
    profileRows.filter((p) => p.pointsAtMagicDir).map((p) => p.htmlDirectory),
  );
  const orphanDirectories = input.magicDirectories.filter((d) => !referencedMagic.has(d));

  const liveDirs = [...referencedMagic];
  const liveDirectory = liveDirs.length === 1 ? liveDirs[0]! : (liveDirs[0] ?? null);

  const assetsMatch =
    input.assetsExpected.logo === input.assetsOnRouter.logo &&
    input.assetsExpected.hero === input.assetsOnRouter.hero;
  const textsMatch =
    input.textFilesChecked > 0 && input.textFilesMatched === input.textFilesChecked;
  const fingerprintMatch =
    input.liveFingerprint != null && input.liveFingerprint === input.expectedFingerprint;

  let status: PortalDeployStatus;
  if (liveDirs.length === 0 && input.magicDirectories.length === 0) {
    status = "not_deployed";
  } else if (liveDirs.length > 1) {
    status = "partial";
  } else if (fingerprintMatch || (textsMatch && assetsMatch)) {
    status = "matches";
  } else if (liveDirectory || input.magicDirectories.length > 0) {
    status = "outdated";
  } else {
    status = "unknown";
  }

  const orphanNote =
    orphanDirectories.length > 0
      ? ` ${orphanDirectories.length} old portal folder${orphanDirectories.length === 1 ? "" : "s"} will be removed on the next publish.`
      : "";

  let summary: string;
  switch (status) {
    case "not_deployed":
      summary =
        "No Magic portal directory on this router yet. Publish when Hotspot foundation is ready.";
      break;
    case "matches":
      summary = `Portal already live${liveDirectory ? ` in ${liveDirectory}` : ""} and matches your saved settings. Republish only if phones still show old branding.${orphanNote}`;
      break;
    case "outdated":
      summary = `Portal on the router${liveDirectory ? ` (${liveDirectory})` : ""} is outdated — publish to refresh.${orphanNote}`;
      break;
    case "partial":
      summary = `Hotspot profiles point at different portal folders (${liveDirs.join(", ")}). Publish once to align them.${orphanNote}`;
      break;
    default:
      summary = "Could not fully verify the portal on this router.";
  }

  return {
    status,
    summary,
    liveDirectory,
    profiles: profileRows,
    magicDirectories: input.magicDirectories,
    orphanDirectories,
    expectedFingerprint: input.expectedFingerprint,
    liveFingerprint: input.liveFingerprint,
    textFilesChecked: input.textFilesChecked,
    textFilesMatched: input.textFilesMatched,
    assetsExpected: input.assetsExpected,
    assetsOnRouter: input.assetsOnRouter,
  };
}

export async function probePortalOnRouter(
  conn: Conn,
  input: {
    expectedFiles: Array<{ name: string; content: string }>;
    logoPath: string | null;
    heroPath: string | null;
    profileNames?: string[];
  },
): Promise<PortalDeployProbe> {
  const { routerAPI } = await import("../mikrotik.server");
  const { readProfileTargets } = await import("./deploy.server");

  const assetsExpected: PortalBundleAssetFlags = {
    logo: Boolean(input.logoPath),
    hero: Boolean(input.heroPath),
  };
  const expectedFingerprint = portalBundleFingerprint(input.expectedFiles, assetsExpected);

  const profiles = await readProfileTargets(conn, input.profileNames);
  // Do not turn a transport/permission failure into a false "not deployed" result.
  // Publishing also needs /file, so an unreadable inventory is a real blocker.
  const allFiles = await routerAPI.listFiles(conn);
  const filePaths = allFiles.map((f) => f.name).filter((n): n is string => Boolean(n));
  const magicDirectories = magicPortalDirsFromFilePaths(filePaths);

  const magicProfileDirs = profiles
    .map((p) => p.htmlDirectory)
    .filter((d) => isMagicPortalDirectory(d));
  const liveDirectory =
    magicProfileDirs.length === 1
      ? magicProfileDirs[0]!
      : (magicProfileDirs[0] ?? (magicDirectories.length === 1 ? magicDirectories[0]! : null));

  let liveFingerprint: string | null = null;
  if (liveDirectory) {
    const manifestPath = `${liveDirectory}/mm-manifest.json`;
    const raw = await routerAPI.readFile(conn, manifestPath).catch(() => null);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { fingerprint?: string };
        if (parsed.fingerprint) liveFingerprint = parsed.fingerprint;
      } catch {
        // Fall back to content comparison below.
      }
    }
  }

  let textFilesChecked = 0;
  let textFilesMatched = 0;
  const assetsOnRouter: PortalBundleAssetFlags = { logo: false, hero: false };

  if (liveDirectory) {
    for (const f of input.expectedFiles) {
      textFilesChecked += 1;
      const path = `${liveDirectory}/${f.name}`;
      const live = await routerAPI.readFile(conn, path).catch(() => null);
      if (live === f.content) textFilesMatched += 1;
    }
    if (assetsExpected.logo) {
      assetsOnRouter.logo = Boolean(
        await routerAPI.findFileId(conn, `${liveDirectory}/img/logo.png`),
      );
    }
    if (assetsExpected.hero) {
      assetsOnRouter.hero = Boolean(
        await routerAPI.findFileId(conn, `${liveDirectory}/img/hero.jpg`),
      );
    }
  }

  return assessPortalDeployProbe({
    profiles,
    magicDirectories,
    expectedFingerprint,
    liveFingerprint,
    textFilesChecked,
    textFilesMatched,
    assetsExpected,
    assetsOnRouter,
  });
}

/**
 * Read-only inventory of the active Hotspot portal files. Router contents are
 * deliberately never returned to the browser: a board can contain arbitrary
 * HTML/JS, and the app must not treat it as trusted preview or editor input.
 */
export async function scanPortalOnRouter(
  conn: Conn,
  input?: { profileNames?: string[] },
): Promise<PortalDeviceScan> {
  const { createHash } = await import("node:crypto");
  const { routerAPI } = await import("../mikrotik.server");
  const { readProfileTargets } = await import("./deploy.server");
  const targets = await readProfileTargets(conn, input?.profileNames);
  const profiles: PortalProfileProbe[] = targets.map((p) => ({
    id: p.id,
    name: p.name,
    htmlDirectory: p.htmlDirectory,
    pointsAtMagicDir: isMagicPortalDirectory(p.htmlDirectory),
  }));
  const directories = [
    ...new Set(targets.map((p) => p.htmlDirectory.trim()).filter(Boolean)),
  ].slice(0, 20);
  const all = await routerAPI.listFiles(conn);
  const paths = new Set((all ?? []).map((f) => f.name).filter((p): p is string => Boolean(p)));
  const scanned: PortalDeviceScan["directories"] = [];

  for (const directory of directories) {
    // Directory comes from RouterOS, but still reject traversal/control characters.
    if (directory.includes("..") || /[\0\r\n]/.test(directory)) continue;
    const files: Array<{ name: string; bytes: number; sha256: string }> = [];
    let managedFingerprint: string | null = null;
    for (const filename of SCANNABLE_PORTAL_FILES) {
      const path = `${directory}/${filename}`;
      if (!paths.has(path)) continue;
      const content = await routerAPI.readFile(conn, path).catch(() => null);
      if (content == null) continue;
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > MAX_SCANNED_TEXT_BYTES) continue;
      if (filename === "mm-manifest.json") {
        try {
          const parsed = JSON.parse(content) as { fingerprint?: unknown };
          if (typeof parsed.fingerprint === "string" && /^[a-f0-9]{16}$/i.test(parsed.fingerprint))
            managedFingerprint = parsed.fingerprint;
        } catch {
          // A malformed manifest is custom content, not a valid Magic layout.
        }
      }
      files.push({
        name: filename,
        bytes,
        sha256: createHash("sha256").update(content).digest("hex").slice(0, 16),
      });
    }
    scanned.push({
      directory,
      files,
      kind: managedFingerprint ? "magic" : files.length ? "custom" : "empty",
      managedFingerprint,
    });
  }

  const magic = scanned.filter((d) => d.kind === "magic").length;
  const custom = scanned.filter((d) => d.kind === "custom").length;
  return {
    profiles,
    directories: scanned,
    summary:
      magic > 0
        ? `${magic} Magic-managed portal folder${magic === 1 ? "" : "s"} found.${custom ? ` ${custom} custom folder${custom === 1 ? " was" : "s were"} also found.` : ""}`
        : custom > 0
          ? `${custom} custom portal folder${custom === 1 ? " was" : "s were"} found. Review it before replacing it with a Magic-managed portal.`
          : "No readable portal HTML files were found in the active Hotspot profile directories.",
  };
}
