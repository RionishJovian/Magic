/** Magic Hub connection_mode. Legacy rows stored "cloud" before the rename. */
export function isHubMode(mode?: string | null): boolean {
  return mode === "hub" || mode === "cloud";
}

/** Nickname stored on a Magic Hub row — never dialled from the cloud. */
export function hubHostFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "magic-hub-board";
}
