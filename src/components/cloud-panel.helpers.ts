/** Session-only so a refresh can reopen the paste window. Do not persist to disk. */
export function magicHubScriptStorageKey(routerId: string): string {
  return `mm.magic-hub.script.${routerId}`;
}
