/**
 * Upsert the mm-{plan_key} HotSpot user profile on a board before issuing users.
 */
import type { RouterConn } from "../mikrotik.server";
import { planProfileBody, type PlanProfileInput } from "./plan-profile";

export async function ensurePlanProfileOnRouter(
  conn: RouterConn,
  plan: PlanProfileInput,
): Promise<"created" | "updated"> {
  const { routerAPI } = await import("../mikrotik.server");
  const body = planProfileBody(plan);
  const existing = (await routerAPI.profiles(conn)) ?? [];
  const match = existing.find((row) => row.name === body.name);
  const action = match?.[".id"] ? ("updated" as const) : ("created" as const);

  try {
    if (match?.[".id"]) {
      const { name: _n, ...patch } = body;
      await routerAPI.patchUserProfile(conn, match[".id"], patch);
    } else {
      await routerAPI.addUserProfile(conn, body);
    }
    return action;
  } catch (first) {
    const { userProfileUpsertCli } = await import("../mikrotik.server");
    await routerAPI.execScript(conn, userProfileUpsertCli(body));
    return action;
  }
}
