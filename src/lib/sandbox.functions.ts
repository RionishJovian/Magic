import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { SANDBOX_REMOVED_MESSAGE } from "./test-router";

export const getSandboxRouter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const guards = await import("./guards.server");
    await guards.requirePrivileged(context.supabase, context.userId);
    await guards.requireNotExpired(context.supabase, context.userId);
    throw new Error(SANDBOX_REMOVED_MESSAGE);
  });

export const createSandboxRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const guards = await import("./guards.server");
    await guards.requirePrivileged(context.supabase, context.userId);
    await guards.requireNotExpired(context.supabase, context.userId);
    throw new Error(SANDBOX_REMOVED_MESSAGE);
  });

export const resetSandboxRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw))
  .handler(async ({ context }) => {
    const guards = await import("./guards.server");
    await guards.requirePrivileged(context.supabase, context.userId);
    await guards.requireNotExpired(context.supabase, context.userId);
    throw new Error(SANDBOX_REMOVED_MESSAGE);
  });

export const deleteSandboxRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw))
  .handler(async ({ context }) => {
    const guards = await import("./guards.server");
    await guards.requirePrivileged(context.supabase, context.userId);
    await guards.requireNotExpired(context.supabase, context.userId);
    throw new Error(SANDBOX_REMOVED_MESSAGE);
  });
