import { ISea, isSeaFlag } from "@/lib/services/sea/sea.service";
import { createClient } from "@/lib/supabase/server";

/** Initial public read. Only columns anon may read: id, flag, updated_at. (Swap for your existing getter if you have one.) */
export async function getSeaForPage(): Promise<{
  id: string;
  sea: ISea;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sea")
    .select("id, flag, updated_at")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[sea] initial sea query failed", {
      code: error.code,
      message: error.message,
    });
    return null;
  }
  if (!data || !isSeaFlag(data.flag) || typeof data.updated_at !== "string")
    return null;
  return {
    id: data.id as string,
    sea: { flag: data.flag, updated_at: data.updated_at },
  };
}

/**
 * UX hints only. Mirrors RLS policy `sea_update_active_approved` (= is_active_approved():
 * profile active AND approved, ANY role). The database still enforces it on every request.
 */
export async function getSeaViewer(): Promise<{
  isAuthenticated: boolean;
  canUpdate: boolean;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { isAuthenticated: false, canUpdate: false };

  const { data } = await supabase
    .from("profiles")
    .select("approved, is_active")
    .eq("id", user.id)
    .maybeSingle();
  return {
    isAuthenticated: true,
    canUpdate: !!data?.approved && !!data?.is_active,
  };
}
