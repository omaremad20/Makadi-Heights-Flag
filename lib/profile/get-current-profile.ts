// ASSUMPTION: your server client lives at "@/lib/supabase/server" and
// exports an async `createClient()` (standard @supabase/ssr pattern).
import { createClient } from "@/lib/supabase/server";
import type { CurrentProfileResult, Profile } from "./types";

const PROFILE_COLUMNS = [
  "id",
  "email",
  "full_name",
  "phone",
  "avatar_url",
  "role",
  "is_active",
  "approved",
  "approved_by",
  "approved_by_email_snapshot",
  "job_title",
  "created_at",
  "updated_at",
  "last_updated_by",
  "last_updated_by_email_snapshot",
].join(", ");

export async function getCurrentProfile(): Promise<CurrentProfileResult> {
  const supabase = await createClient();

  // The user id always comes from the authenticated session.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { status: "unauthenticated" };
  }

  // Direct lookup of the caller's own row; RLS still applies.
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle<Profile>();

  if (error) {
    // Log server-side only; never surface raw database errors to the UI.
    console.error("[getCurrentProfile] profile query failed", {
      code: error.code,
    });
    return { status: "error" };
  }

  if (!data) {
    return { status: "not_found" };
  }

  // Google metadata is used only as a display fallback for the avatar.
  const metadata = user.user_metadata ?? {};
  const providerAvatarUrl =
    typeof metadata.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata.picture === "string"
        ? metadata.picture
        : null;

  return { status: "ok", profile: data, providerAvatarUrl };
}