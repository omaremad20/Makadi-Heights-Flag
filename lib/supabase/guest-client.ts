import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let guestClient: SupabaseClient | null = null;

/**
 * Anonymous Supabase client for the public application form.
 *
 * Why not the existing createBrowserClient (@supabase/ssr)? That client reads
 * the signed-in session from cookies. A signed-in staff member opening /apply
 * would then insert as `authenticated`, which has no INSERT privilege on
 * public.applications (42501). This client never carries a session, so the
 * request always runs as `anon`.
 *
 * Uses only the public URL + publishable key. Never put the service-role key here.
 */
export function getGuestClient(): SupabaseClient {
  if (!guestClient) {
    guestClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          // Distinct key so it never collides with the app's session client.
          storageKey: "sb-guest-applications",
        },
      },
    );
  }
  return guestClient;
}