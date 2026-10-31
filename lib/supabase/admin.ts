import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * Service-role Supabase client. SERVER ONLY.
 *
 * Bypasses RLS, so it must only be used for narrowly scoped operations that
 * enforce their own rules (e.g. the SECURITY DEFINER functions behind the
 * public application form). Never import this from a Client Component; the
 * `server-only` import above makes the build fail if that happens.
 */
export function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service configuration is missing (SUPABASE_SERVICE_ROLE_KEY).");
  }

  adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return adminClient;
}
