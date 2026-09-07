import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { rateLimit } from "./connector-guard.server";
import { passwordSchema } from "./password-policy";

const trialInput = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must contain at least 3 characters.")
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, underscores or hyphens only."),
  password: passwordSchema(),
  display_name: z.string().trim().min(1, "Enter your name or business name.").max(120),
});

function signupRateKey(kind: "ip" | "username", value: string): string {
  return `trial-signup:${kind}:v1:${createHash("sha256")
    .update(value.trim().toLowerCase().slice(0, 200))
    .digest("hex")}`;
}

/**
 * Public, rate-limited trial registration. The service-role key never reaches
 * the browser. Supabase Auth receives an internal synthetic email because
 * operators sign in with usernames and are not required to provide email.
 */
export const createTrialAccount = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => trialInput.parse(raw))
  .handler(async ({ data }) => {
    const username = data.username.toLowerCase();
    const forwarded =
      getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for") ?? "unknown";
    const ip = forwarded.split(",")[0]?.trim() || "unknown";
    const [ipAllowed, usernameAllowed] = await Promise.all([
      rateLimit(signupRateKey("ip", ip), 3, 60 * 60),
      rateLimit(signupRateKey("username", username), 5, 24 * 60 * 60),
    ]);
    if (!ipAllowed || !usernameAllowed) {
      throw new Error("Too many trial registrations. Please try again later.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: primary } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "primary")
      .limit(1)
      .maybeSingle();
    if (!primary?.user_id) {
      throw new Error("Trial registration is temporarily unavailable. Contact support.");
    }

    const email = `${username}@mikromagic`;
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.display_name },
    });
    if (created.error || !created.data.user) {
      if (/already|registered|exists/i.test(created.error?.message ?? "")) {
        throw new Error("That username is unavailable. Try another one or sign in.");
      }
      throw new Error("Trial account could not be created. Please try again.");
    }

    const userId = created.data.user.id;
    try {
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
        { id: userId, username, display_name: data.display_name },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;

      // The database trigger creates the isolated client role and seven-day
      // expiry. Reassert it here so the public path remains deterministic.
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error: roleDeleteError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (roleDeleteError) throw roleDeleteError;
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
        user_id: userId,
        role: "client",
        owner_id: primary.user_id,
        expires_at: expiresAt,
      });
      if (roleError) throw roleError;

      const { error: mappingError } = await supabaseAdmin.from("owner_accounts").upsert(
        { username, auth_email: email, user_id: userId, updated_at: new Date().toISOString() },
        { onConflict: "username" },
      );
      if (mappingError) throw mappingError;
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(
        /duplicate|unique/i.test(error instanceof Error ? error.message : String(error))
          ? "That username is unavailable. Try another one or sign in."
          : "Trial account setup failed safely. Please try again.",
      );
    }

    return { ok: true, username };
  });
