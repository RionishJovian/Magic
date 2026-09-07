/**
 * Users page — Primary (Application owner) vs Developer capabilities.
 * Keep UI gates and server checks aligned with this matrix.
 *
 * Who is who:
 * - User: café shop owner managing their own RouterBOARD Hotspot business; direct
 *   parentage is shown separately from operational ownership.
 * - Primary: Application owner / producer — does not own a café; one per cloud.
 * - Developer: builds app features — does not own a café; ranks above Primary.
 * - Verified Agent: hired by the Application owner to recruit café Users; Magic Coins
 *   commission on monthly/annual purchases from Users tagged under their agent id.
 *
 * Ownership model:
 * - User / Agent own themselves (isolated routers, plans, portal).
 * - One Primary per cloud; Developer ranks above Primary and scopes platform-wide.
 * - Verified Agent referrals tag new Users under the agent for Magic Coins only.
 */
export type UsersPageActor = {
  isPrimary: boolean;
  isPlatformAdmin: boolean;
};

export type UsersPageView = "accounts" | "tenants";

export function usersPageCanAccess(actor: UsersPageActor): boolean {
  return actor.isPrimary || actor.isPlatformAdmin;
}

export function usersPageViews(actor: UsersPageActor): UsersPageView[] {
  if (actor.isPrimary || actor.isPlatformAdmin) return ["accounts", "tenants"];
  return ["accounts"];
}

export function usersPageDefaultView(_actor: UsersPageActor): UsersPageView {
  return "accounts";
}

export function usersPageCoerceView(
  actor: UsersPageActor,
  view: UsersPageView | undefined,
): UsersPageView {
  const allowed = usersPageViews(actor);
  if (view && allowed.includes(view)) return view;
  return usersPageDefaultView(actor);
}

export function usersPageCanCreatePrimary(actor: UsersPageActor, primaryCount: number): boolean {
  return actor.isPlatformAdmin && primaryCount === 0;
}

export function usersPageCanAssignPrimaryRole(
  actor: UsersPageActor,
  primaryCount: number,
  subjectIsPrimary: boolean,
): boolean {
  return usersPageCanCreatePrimary(actor, primaryCount) || subjectIsPrimary;
}

/** Primary accounts are managed by Developer only — never by another Primary. */
export function usersPageCanManageAccount(
  actor: UsersPageActor,
  subject: { id: string; roles: string[] },
  selfId: string,
): boolean {
  if (subject.id === selfId) return true;
  if (subject.roles.includes("primary") && !actor.isPlatformAdmin) return false;
  return true;
}

export function usersPageHeadline(_actor: UsersPageActor, view: UsersPageView): string {
  if (view === "tenants") return "Tenant console";
  return "User management";
}

export function usersPageSubtitle(actor: UsersPageActor, view: UsersPageView): string {
  if (view === "tenants") {
    if (actor.isPlatformAdmin) {
      return "Search and manage accounts platform-wide. Café Users and Agents own their own resources.";
    }
    return "Manage café Users and Verified Agents. Each café User owns their own routers, plans, and portal.";
  }
  if (actor.isPlatformAdmin) {
    return "Developer — builds the app (no café). Above Primary (Application owner). Create café Users and Agents; set platform defaults.";
  }
  return "Create café Users and Verified Agents (each owns their account). Agents recruit Users for commission. Platform defaults stay Developer/Primary-only.";
}

export const USERS_PAGE_CAPABILITIES = {
  primary: [
    "One Primary (app owner) per cloud — cannot create a second Primary",
    "Application owner / producer — does not own a café",
    "Create User (café Hotspot owner) and Verified Agent accounts (each owns itself)",
    "Hire Verified Agents to recruit café Users; Agents earn Magic Coins on referred purchases",
    "Scope into User/Agent accounts for support without rewriting their café data for others",
    "Approve or reject agent-created pending signups",
    "Set access expiry and reset passwords for Users/Agents",
    "Cannot change Developer platform-wide defaults that apply to everyone",
  ],
  developer: [
    "Highest rank — builds application features; does not own a café",
    "Above Primary (Application owner), platform-wide access",
    "Everything Primary can do, plus manage Primary accounts",
    "Scope into any café User / Agent account",
    "Set platform defaults (operator role defaults, backups, topology) for everyone",
    "Users/Agents keep isolated operational data — edits in one café do not alter another’s routers/plans/portal",
    "Verified Agent referrals tag new Users under the agent for Magic Coins commission only",
  ],
  userAgentIsolation: [
    "User (café owner) / Agent read/write/edit only their own account activity",
    "Own voucher plans, captive portal settings, and routers",
    "Writes never rewrite another account’s data or platform defaults",
  ],
} as const;
