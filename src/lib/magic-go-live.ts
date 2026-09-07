/**
 * Ordered Magic go-live checks — Site → Router → online → Hotspot →
 * plans → vouchers → portal. Pure types + helpers (no I/O).
 */

export const MAGIC_STEP_IDS = [
  "site",
  "router",
  "online",
  "hotspot",
  "plans",
  "vouchers",
  "portal",
] as const;

export type MagicStepId = (typeof MAGIC_STEP_IDS)[number];

export type MagicStepStatus = "done" | "todo" | "blocked" | "unknown";

export type MagicStep = {
  id: MagicStepId;
  title: string;
  status: MagicStepStatus;
  detail: string;
  to: string;
  cta: string;
};

export type MagicGoLive = {
  siteId: string | null;
  siteName: string | null;
  routerId: string | null;
  routerName: string | null;
  steps: MagicStep[];
  doneCount: number;
  totalCount: number;
  next: MagicStep | null;
  complete: boolean;
};

export const MAGIC_STEP_META: Record<
  MagicStepId,
  { title: string; to: string; cta: string; todoDetail: string }
> = {
  site: {
    title: "Site",
    to: "/app/sites",
    cta: "Add site",
    todoDetail: "Create a location (branch / site) so routers and revenue can be scoped.",
  },
  router: {
    title: "Router",
    to: "/app/routers",
    cta: "Add router",
    todoDetail:
      "Add the MikroTik with Magic Hub (Cloud Remote) — our path for Starlink and CGNAT — then Test until Reachable.",
  },
  online: {
    title: "Online",
    to: "/app/routers",
    cta: "Test",
    todoDetail: "Open Routers → Check now / Test until the board is Reachable.",
  },
  hotspot: {
    title: "Hotspot Wi‑Fi",
    to: "/app/routers",
    cta: "Hotspot Wi‑Fi",
    todoDetail:
      "On the router card, open Hotspot Wi‑Fi and Apply guest SSID + captive portal — that is how this platform runs the MikroTik hotspot business.",
  },
  plans: {
    title: "Plans",
    to: "/app/vouchers",
    cta: "Plans",
    todoDetail: "Create at least one voucher plan, then Add to router so RouterOS has the profile.",
  },
  vouchers: {
    title: "Codes",
    to: "/app/vouchers",
    cta: "Generate",
    todoDetail: "Generate voucher codes bound to the plan (and router).",
  },
  portal: {
    title: "Portal",
    to: "/app/portal",
    cta: "Deploy",
    todoDetail: "Publish the captive portal login page to the router.",
  },
};

export function scoreMagicSteps(
  steps: MagicStep[],
): Pick<MagicGoLive, "doneCount" | "totalCount" | "next" | "complete"> {
  const totalCount = steps.length;
  const doneCount = steps.filter((s) => s.status === "done").length;
  const next = steps.find((s) => s.status !== "done") ?? null;
  return {
    doneCount,
    totalCount,
    next,
    complete: doneCount === totalCount && totalCount > 0,
  };
}

export function buildMagicStep(
  id: MagicStepId,
  status: MagicStepStatus,
  detail?: string,
): MagicStep {
  const meta = MAGIC_STEP_META[id];
  return {
    id,
    title: meta.title,
    status,
    detail: detail ?? (status === "done" ? "Done" : meta.todoDetail),
    to: meta.to,
    cta: status === "done" ? "Open" : meta.cta,
  };
}
