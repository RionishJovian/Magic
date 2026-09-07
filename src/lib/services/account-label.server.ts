// Server-only helper: a human-readable account label for owner notifications.
// Falls back through profile display name -> username -> auth email -> short id
// so a message never shows a bare UUID.

import type { DatabaseClient } from "../database.types";

export async function accountLabel(
  supabaseAdmin: DatabaseClient,
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return "unknown account";
  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username")
      .eq("id", userId)
      .maybeSingle();
    const name = data?.display_name?.trim() || data?.username?.trim();
    if (name) return name;
  } catch {
    // fall through to the auth lookup
  }
  try {
    const admin = supabaseAdmin as unknown as {
      auth?: {
        admin?: {
          getUserById?: (
            id: string,
          ) => Promise<{ data?: { user?: { email?: string | null } | null } }>;
        };
      };
    };
    const res = await admin.auth?.admin?.getUserById?.(userId);
    const email = res?.data?.user?.email;
    if (email) return email;
  } catch {
    // fall through to the id
  }
  return userId.slice(0, 8);
}
