// Driver registry — maps a controller's brand to its implementation.
import type { ApBrand, ApDriver } from "./types";
import { unifiDriver } from "./unifi.server";
import { mikrotikDriver } from "./mikrotik.server";
import { ruijieDriver } from "./ruijie.server";
import { genericDriver } from "./generic.server";

export const AP_DRIVERS: Record<ApBrand, ApDriver> = {
  unifi: unifiDriver,
  mikrotik: mikrotikDriver,
  ruijie: ruijieDriver,
  generic: genericDriver,
};

export function driverFor(brand: string): ApDriver {
  return AP_DRIVERS[(brand as ApBrand) in AP_DRIVERS ? (brand as ApBrand) : "generic"];
}
