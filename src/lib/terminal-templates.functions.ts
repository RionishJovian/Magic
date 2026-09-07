import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const templateInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(400).optional().nullable(),
  category: z.string().min(1).max(40).default("general"),
  method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
  path: z
    .string()
    .min(1)
    .max(300)
    .regex(/^\//, "Path must start with /")
    .refine((p) => !/\s/.test(p), "Path must not contain whitespace"),
  body: z.string().max(4000).optional().nullable(),
});

export const listTerminalTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("./guards.server")).requirePrivileged(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("terminal_templates")
      .select("id, name, description, category, method, path, body, is_builtin, updated_at")
      .order("is_builtin", { ascending: false })
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTerminalTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => templateInput.parse(raw))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requirePrivileged(context.supabase, context.userId);
    const { data: ownerRow } = await context.supabase.rpc("effective_owner", {
      _user_id: context.userId,
    });
    const ownerId = (ownerRow as string | null) ?? context.userId;
    const { data: row, error } = await context.supabase
      .from("terminal_templates")
      .insert({
        owner_id: ownerId,
        created_by: context.userId,
        name: data.name,
        description: data.description ?? null,
        category: data.category,
        method: data.method,
        path: data.path,
        body: data.body ?? null,
        is_builtin: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateTerminalTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => templateInput.extend({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requirePrivileged(context.supabase, context.userId);
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("terminal_templates")
      .update({
        name: patch.name,
        description: patch.description ?? null,
        category: patch.category,
        method: patch.method,
        path: patch.path,
        body: patch.body ?? null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTerminalTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requirePrivileged(context.supabase, context.userId);
    const { error } = await context.supabase.from("terminal_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
