/**
 * Tenant scoping helpers shared by every server function that reads or writes
 * money- and commission-related rows with the service role.
 *
 * supabaseAdmin bypasses RLS, so these helpers are the authorization boundary
 * for those code paths: the tenant filter must be applied to the query itself,
 * never assumed from the database policies.
 */
export type TenantScope = {
  userId: string;
  /** Canonical owner id of the caller's business — the same value Tier Pass purchases store. */
  tenantId: string;
  /** Narrow, explicitly listed cross-tenant exception. */
  isPlatformAdmin: boolean;
};

/** The owner id a service-role query must be filtered by, or null for platform admins. */
export function tenantFilterFor(scope: TenantScope): string | null {
  return scope.isPlatformAdmin ? null : scope.tenantId;
}

type Eqable<T> = { eq: (column: string, value: string) => T };

/** Adds `.eq(column, tenantId)` unless the caller is a platform administrator. */
export function applyTenantFilter<T extends Eqable<T>>(
  query: T,
  scope: TenantScope,
  column = "owner_id",
): T {
  const tenant = tenantFilterFor(scope);
  return tenant === null ? query : query.eq(column, tenant);
}

/** Owner/admin staff may only review purchases belonging to their own tenant. */
export function canReviewPurchase(scope: TenantScope, row: { owner_id: string }): boolean {
  return scope.isPlatformAdmin || row.owner_id === scope.tenantId;
}

/** The buyer always sees their own receipt; reviewers only within their tenant. */
export function canReadReceipt(
  scope: TenantScope,
  row: { user_id: string; owner_id: string },
): boolean {
  return row.user_id === scope.userId || canReviewPurchase(scope, row);
}
