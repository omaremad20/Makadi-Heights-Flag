// ASSUMPTION: the project already has a browser Supabase client at
// "@/lib/supabase/client" exporting `createClient()` (the standard
// @supabase/ssr pattern). Adjust this import if your actual path differs.
import { createClient } from "@/lib/supabase/client";

const REDIRECT_PATH = "/auth/callback";

function getRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${REDIRECT_PATH}`;
}

/**
 * Starts the Google OAuth flow. Supabase redirects the browser to Google,
 * then back to REDIRECT_PATH, which exchanges the code for a session.
 * The `profiles` row for a first-time user is created entirely by the
 * existing database trigger — nothing to do here on the frontend.
 */
export async function loginWithGoogle() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getRedirectUrl(),
    },
  });

  if (error) throw error;
  return data;
}

/**
 * Google-only auth means signup and login are the same OAuth flow — a new
 * user is created in `auth.users` on first sign-in, and the existing
 * trigger populates `profiles`. This alias exists so call sites can be
 * explicit about intent without duplicating logic.
 */
export const signupWithGoogle = loginWithGoogle;

export async function logout() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export const authService = {
  loginWithGoogle,
  signupWithGoogle,
  logout,
};
