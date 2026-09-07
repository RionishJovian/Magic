// Deterministic fixtures for the Sandbox side of the Test Lab.
//
// Nothing here touches hardware or the database. It exists so the workflow
// (check → mark environment → deploy → roll back) can be walked through
// instantly while the UI is being built or demonstrated.

export type SandboxRouter = {
  id: string;
  name: string;
  host: string;
  port: number;
  board: string;
  version: string;
  profile: string;
};

export const SANDBOX_ROUTERS: ReadonlyArray<SandboxRouter> = [
  {
    id: "sandbox-rb5009",
    name: "Sandbox RB5009",
    host: "sandbox.invalid",
    port: 443,
    board: "RB5009UG+S+",
    version: "7.14.3",
    profile: "hsprof-sandbox",
  },
  {
    id: "sandbox-hex",
    name: "Sandbox hEX S",
    host: "sandbox2.invalid",
    port: 443,
    board: "RB760iGS",
    version: "7.13.5",
    profile: "hsprof-lab",
  },
];

export type SandboxStep = { id: string; label: string; detail: string; writes: boolean };

/** The exact sequence a real router must follow, simulated end to end. */
export const SANDBOX_WORKFLOW: ReadonlyArray<SandboxStep> = [
  {
    id: "endpoint",
    label: "Validate endpoint",
    detail: "Hostname/IP shape and public-range check, then re-check before dialling out.",
    writes: false,
  },
  {
    id: "check",
    label: "Read-only connection check",
    detail: "Ask the router for its identity, RouterOS version and board. Nothing is changed.",
    writes: false,
  },
  {
    id: "plan",
    label: "Plan a staged portal deploy",
    detail: "Files are planned into a versioned directory; no profile is switched yet.",
    writes: false,
  },
  {
    id: "apply",
    label: "Apply and verify",
    detail: "Write files, verify each one exists, then switch only the selected hotspot profile.",
    writes: true,
  },
  {
    id: "rollback",
    label: "Roll back",
    detail: "Switch the profile back first, then remove the files the deploy created.",
    writes: true,
  },
];

export type SimResult = { step: string; outcome: "ok" | "failed"; message: string };

/**
 * Simulate the workflow. With `failAt` the run stops at that step and reports
 * the rollback that a real deployment would have attempted.
 */
export function simulateWorkflow(failAt?: string): SimResult[] {
  const out: SimResult[] = [];
  for (const step of SANDBOX_WORKFLOW) {
    if (step.id === "rollback") continue;
    if (failAt && step.id === failAt) {
      out.push({ step: step.id, outcome: "failed", message: "Simulated failure at this step." });
      out.push({
        step: "rollback",
        outcome: "ok",
        message: "Completed steps undone in reverse order; profile restored first.",
      });
      return out;
    }
    out.push({ step: step.id, outcome: "ok", message: "Simulated successfully." });
  }
  out.push({ step: "rollback", outcome: "ok", message: "Manual rollback available." });
  return out;
}
