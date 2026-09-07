import { isMagicPortalDirectory, magicPortalDirsFromFilePaths } from "./bundle-fingerprint";

type Conn = Parameters<typeof import("../mikrotik.server").routerAPI.findFileId>[0];

/** Remove Magic portal staging dirs no longer referenced by any hotspot profile. */
export async function pruneOrphanMagicPortalDirs(conn: Conn): Promise<{
  removedDirs: string[];
  removedFiles: number;
  errors: string[];
}> {
  const { routerAPI } = await import("../mikrotik.server");
  const profiles = await routerAPI.hotspotProfiles(conn);
  const referenced = new Set(
    profiles.map((p) => p["html-directory"] ?? "").filter((d) => isMagicPortalDirectory(d)),
  );

  const rows = await routerAPI
    .listFiles(conn)
    .catch(() => [] as Array<{ ".id"?: string; name?: string }>);
  const magicDirs = magicPortalDirsFromFilePaths(
    rows.map((r) => r.name).filter((n): n is string => Boolean(n)),
  );
  const orphanDirs = magicDirs.filter((d) => !referenced.has(d));

  const removedDirs: string[] = [];
  let removedFiles = 0;
  const errors: string[] = [];

  for (const dir of orphanDirs) {
    const prefix = `${dir}/`;
    const dirFiles = rows.filter((r) => r.name === dir || r.name?.startsWith(prefix));
    let dirRemoved = 0;
    for (const file of dirFiles) {
      const id = file[".id"];
      if (!id) continue;
      try {
        await routerAPI.removeFile(conn, id);
        dirRemoved += 1;
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120));
      }
    }
    if (dirRemoved > 0) {
      removedDirs.push(dir);
      removedFiles += dirRemoved;
    }
  }

  return { removedDirs, removedFiles, errors };
}
