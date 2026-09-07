export type EasyResourceState = {
  label: string;
  state: "loading" | "ready" | "empty" | "error";
};

export function easyGreeting(hour: number): "Good morning" | "Good afternoon" | "Good evening" {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function easyRouterState({
  isPending,
  isError,
  routerName,
}: {
  isPending: boolean;
  isError: boolean;
  routerName?: string | null;
}): EasyResourceState {
  if (isPending) return { label: "Checking connected routers…", state: "loading" };
  if (isError) return { label: "Could not load your routers", state: "error" };
  if (routerName) return { label: routerName, state: "ready" };
  return { label: "No physical router connected", state: "empty" };
}

export function uniquePlanDetail(title: string, detail: string): string | null {
  const normalizedTitle = title.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const normalizedDetail = detail.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return normalizedDetail && normalizedDetail !== normalizedTitle ? detail : null;
}

export function easyGuestEmptyState({
  routerState,
  livePending,
  liveError,
}: {
  routerState: EasyResourceState["state"];
  livePending: boolean;
  liveError: boolean;
}): { message: string; action: "connect" | "setup" | null } {
  if (routerState === "loading")
    return { message: "Checking your connected router…", action: null };
  if (routerState === "error")
    return { message: "Could not load your router right now.", action: "setup" };
  if (routerState === "empty")
    return { message: "Connect a router to see live guests.", action: "connect" };
  if (livePending) return { message: "Checking live guests…", action: null };
  if (liveError)
    return { message: "Could not read live guests from this router.", action: "setup" };
  return { message: "No guests are online right now.", action: null };
}
