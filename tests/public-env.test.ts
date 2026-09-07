import { describe, expect, it, afterEach } from "vitest";
import { publicEnvBootScript, readPublicSupabaseEnv } from "@/lib/public-env";

describe("public-env", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_PUBLISHABLE_KEY"];
    delete process.env["VITE_SUPABASE_URL"];
    delete process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  });

  it("boot script merges and does not wipe existing window values when env is empty", () => {
    const script = publicEnvBootScript();
    expect(script).toContain("Object.assign(window.__MM_PUBLIC__||{},");
    expect(script).toContain("{}");
  });

  it("boot script embeds process env when present", () => {
    process.env["SUPABASE_URL"] = "https://example.supabase.co";
    process.env["SUPABASE_PUBLISHABLE_KEY"] = "sb_publishable_test";
    const script = publicEnvBootScript();
    expect(script).toContain("https://example.supabase.co");
    expect(script).toContain("sb_publishable_test");
  });

  it("readPublicSupabaseEnv prefers window over process", () => {
    process.env["SUPABASE_URL"] = "https://process.example";
    process.env["SUPABASE_PUBLISHABLE_KEY"] = "process-key";
    (globalThis as { window: Window }).window = {
      __MM_PUBLIC__: {
        supabase: {
          url: "https://window.example",
          publishableKey: "window-key",
        },
      },
    } as Window;
    expect(readPublicSupabaseEnv()).toEqual({
      url: "https://window.example",
      publishableKey: "window-key",
    });
  });
});
