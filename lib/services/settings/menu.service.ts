import "server-only";

import { FALLBACK_MENU_PATH, menuBucketPublicUrl } from "@/lib/config/hotel";
import { createClient } from "@/lib/supabase/server";

export const MENU_BUCKET = "menu";
export const MENU_MAX_BYTES = 1024 * 1024; // existing upload limit (the bucket itself allows 2 MiB)
export const MENU_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.pdf$/;

export type MenuSetting = { path: string; url: string; updatedAt: string | null };

/**
 * Current menu from public.site_settings (row 'menu', is_public = true).
 * Public visitors read it through RLS (anon may read public rows only).
 */
export async function getCurrentMenu(): Promise<MenuSetting> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("value, updated_at")
      .eq("key", "menu")
      .maybeSingle();
    const path = (data?.value as { path?: unknown } | null)?.path;
    if (error || typeof path !== "string" || !MENU_PATH_RE.test(path)) {
      if (error) console.error("[menu] site_settings read failed", error.code);
      return { path: FALLBACK_MENU_PATH, url: menuBucketPublicUrl(FALLBACK_MENU_PATH), updatedAt: null };
    }
    return {
      path,
      url: menuBucketPublicUrl(path),
      updatedAt: data?.updated_at ?? null,
    };
  } catch (e) {
    console.error("[menu] unexpected", e instanceof Error ? e.message : e);
    return { path: FALLBACK_MENU_PATH, url: menuBucketPublicUrl(FALLBACK_MENU_PATH), updatedAt: null };
  }
}
