// Narrow wrapper around the (not yet typed) Supabase OAuth beta namespace.
// Lives outside the route file so route code-splitting can hoist the loader
// without losing this helper.
import { supabase } from "@/integrations/supabase/client";

export type OAuthDetails = {
  client?: { name?: string; redirect_uri?: string } | null;
  scope?: string;
  redirect_url?: string;
  redirect_to?: string;
};

export type OAuthResult = {
  data: OAuthDetails | null;
  error: { message: string } | null;
};

export type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};

export function oauth(): OAuthNs {
  return (supabase.auth as unknown as { oauth: OAuthNs }).oauth;
}
