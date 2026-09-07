import { createHash } from "node:crypto";

export type PortalBundleAssetFlags = {
  logo: boolean;
  hero: boolean;
};

/** Stable fingerprint for the text bundle + whether logo/hero assets are included. */
export function portalBundleFingerprint(
  files: Array<{ name: string; content: string }>,
  assets: PortalBundleAssetFlags,
): string {
  const h = createHash("sha256");
  for (const f of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    h.update(f.name);
    h.update("\0");
    h.update(f.content);
    h.update("\0");
  }
  h.update(assets.logo ? "logo" : "");
  h.update(assets.hero ? "hero" : "");
  return h.digest("hex").slice(0, 16);
}

export const MM_PORTAL_DIR_PREFIX = "hotspot-mm-";

export function isMagicPortalDirectory(dir: string): boolean {
  const trimmed = dir.trim();
  return trimmed.startsWith(MM_PORTAL_DIR_PREFIX) && !trimmed.includes("/");
}

/** Extract unique Magic portal directory names from router /file paths. */
export function magicPortalDirsFromFilePaths(paths: string[]): string[] {
  const dirs = new Set<string>();
  for (const path of paths) {
    if (!path.startsWith(MM_PORTAL_DIR_PREFIX)) continue;
    const slash = path.indexOf("/");
    dirs.add(slash === -1 ? path : path.slice(0, slash));
  }
  return [...dirs].sort();
}
