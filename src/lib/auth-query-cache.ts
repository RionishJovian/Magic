import type { QueryClient } from "@tanstack/react-query";

/** Drop tenant-scoped React Query data after auth changes (sign-in as another user). */
export async function resetTenantQueryCache(qc: QueryClient) {
  await qc.cancelQueries();
  qc.clear();
}
