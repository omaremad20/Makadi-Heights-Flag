"use server";

import { revalidatePath } from "next/cache";

import { getAdminContext } from "@/lib/auth/require-admin";
import { buildMenuObjectName } from "@/lib/services/settings/menu-name";
import { MENU_BUCKET, MENU_MAX_BYTES, MENU_PATH_RE } from "@/lib/services/settings/menu.service";

export type MenuActionResult = { ok: true; message: string } | { ok: false; message: string };

const KEPT = "The new menu could not be uploaded. The current menu was kept unchanged.";

/**
 * Replaces the public menu (admins only).
 *  1 validate (size, type, %PDF- magic bytes)
 *  2 upload under a NEW unique name with the admin's session (menu bucket
 *    INSERT policy = is_active_approved_admin); never upsert
 *  3 point site_settings.menu at it (admin-only UPDATE policy); on failure the
 *    new file is removed and the current menu stays live
 *
 * Previous menu files are intentionally NOT deleted: every PDF in the `menu`
 * bucket keeps its URL (approved 2026-10-31). Membership PDFs are never touched.
 */
export async function replaceMenuAction(formData: FormData): Promise<MenuActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Please choose a PDF to upload." };
  if (file.size === 0) return { ok: false, message: "The selected file is empty." };
  if (file.size > MENU_MAX_BYTES) return { ok: false, message: "The file is too large (max 1 MB)." };
  const looksPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const magic = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (!looksPdf || magic !== "%PDF-") return { ok: false, message: "Only valid PDF files are allowed." };

  const ctx = await getAdminContext();
  if (!ctx) return { ok: false, message: "Admin access is required." };

  const path = buildMenuObjectName(file.name);
  if (!MENU_PATH_RE.test(path)) return { ok: false, message: "This file name can’t be used." };
  const bucket = ctx.supabase.storage.from(MENU_BUCKET);

  const up = await bucket.upload(path, file, { contentType: "application/pdf", upsert: false });
  if (up.error) {
    console.error("[menu] upload failed", up.error.message);
    return { ok: false, message: KEPT };
  }

  const { data: updated, error: updErr } = await ctx.supabase
    .from("site_settings")
    .update({ value: { bucket: MENU_BUCKET, path } })
    .eq("key", "menu")
    .select("key");
  if (updErr || !updated || updated.length === 0) {
    console.error("[menu] setting update failed", updErr?.code ?? "0 rows");
    const { error: rbErr } = await bucket.remove([path]);
    if (rbErr) console.error("[menu] ORPHANED new menu file, rollback failed", path, rbErr.message);
    return { ok: false, message: KEPT };
  }

  revalidatePath("/");
  revalidatePath("/dashboard/menu");
  return { ok: true, message: "Menu updated. Visitors now see the new PDF." };
}
