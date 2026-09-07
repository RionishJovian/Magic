/**
 * One source of truth for the RouterOS HotSpot profile name of a voucher plan.
 * Both the manual voucher generator and the paid-order fulfiller persist the
 * value this returns onto the voucher row, so a later plan rename can never
 * repoint a voucher that has already been created on the router.
 */
export function hotspotProfileName(planKey: string): string {
  return `mm-${planKey}`;
}
