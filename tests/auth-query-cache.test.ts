import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { resetTenantQueryCache } from "@/lib/auth-query-cache";

describe("resetTenantQueryCache", () => {
  it("cancels in-flight queries and clears the cache", async () => {
    const qc = new QueryClient();
    const cancelSpy = vi.spyOn(qc, "cancelQueries").mockResolvedValue(undefined);
    const clearSpy = vi.spyOn(qc, "clear");

    qc.setQueryData(["me"], { id: "user-a" });

    await resetTenantQueryCache(qc);

    expect(cancelSpy).toHaveBeenCalledOnce();
    expect(clearSpy).toHaveBeenCalledOnce();
    expect(qc.getQueryData(["me"])).toBeUndefined();
  });
});
