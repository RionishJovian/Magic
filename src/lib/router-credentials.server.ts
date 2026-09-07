// Server-only helpers for the Router Edit credential save path.
// Never log or return plaintext passwords or ciphertext from here.
import type { DatabaseClient } from "./database.types";
import type { Database } from "@/integrations/supabase/types";
import { encryptSecret } from "./crypto.server";

type RouterConnectionsUpdate = Database["public"]["Tables"]["router_connections"]["Update"];

/**
 * Builds the credential portion of a router edit patch.
 * A nonempty password replaces password_ciphertext with a freshly
 * AES-256-GCM-encrypted value; a blank edit password omits the key entirely
 * so the stored ciphertext is preserved. Username is always updated.
 */
export function routerCredentialPatch(input: { username: string; password: string }): {
  username: string;
  password_ciphertext?: string;
} {
  return {
    username: input.username,
    ...(input.password.length > 0 ? { password_ciphertext: encryptSecret(input.password) } : {}),
  };
}

/**
 * Commits a router edit and proves exactly one RLS-visible row was updated.
 * When RLS hides the row (or it was deleted concurrently) PostgREST updates
 * zero rows and .single() errors — we surface a clear save failure so the UI
 * can never toast success for a write that did not happen.
 */
export async function commitRouterUpdate(
  supabase: DatabaseClient,
  id: string,
  patch: RouterConnectionsUpdate,
): Promise<string> {
  const { data, error } = await supabase
    .from("router_connections")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(
      "Router save failed: the router could not be updated (it may have been removed or is not permitted for your account). No changes were saved.",
    );
  }
  return data.id as string;
}
